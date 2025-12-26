const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const idCidadao = String(req.body.idCidadao || "").trim();
  const {
    Discord_Bot_Token,
    CHANNEL_PRISOES_ID,
    CHANNEL_FIANCAS_ID,
    CHANNEL_LIMPEZA_ID,
  } = process.env;

  if (!idCidadao) return res.status(400).json({ error: "ID não fornecido" });

  try {
    // 1. BUSCAR ÚLTIMA LIMPEZA
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      1000,
      true
    );
    let dataUltimaLimpeza =
      mensagensLimpeza.length > 0
        ? new Date(mensagensLimpeza[0].timestamp)
        : new Date(0);

    // 2. BUSCAR PRISÕES (Sequencial para evitar erro de conexão)
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      2000,
      false
    );

    // 3. BUSCAR FIANÇAS
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      2000,
      false
    );

    const todosRegistros = [...prisoes, ...fiancas];
    let somaMultas = 0;
    let totalInafiancaveis = 0;
    const listaKeywordsInafiancaveis = [
      "DESACATO",
      "ASSEDIO",
      "AZARALHAMENTO",
      "AGRESSAO",
      "PREVARICACAO",
      "HOMICIDIO",
      "SEQUESTRO",
    ];

    todosRegistros.forEach((msg) => {
      if (!msg.embeds || !msg.embeds[0]) return;
      const fields = msg.embeds[0].fields || [];

      fields.forEach((f) => {
        const nome = f.name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // EXTRAÇÃO DA MULTA (Padrão: "Multa: R$55.000")
        if (nome.includes("SENTENCA") || nome.includes("MULTA")) {
          const matchMulta = f.value.match(/Multa:\s*R?\$?\s*([\d.]+)/i);
          if (matchMulta) {
            somaMultas += parseInt(matchMulta[1].replace(/\./g, "")) || 0;
          }
        }

        // CONTAGEM DE CRIMES
        if (nome.includes("CRIMES")) {
          f.value.split("\n").forEach((linha) => {
            const linhaLimpa = linha
              .toUpperCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            if (
              listaKeywordsInafiancaveis.some((k) => linhaLimpa.includes(k)) &&
              linha.trim().length > 4
            ) {
              totalInafiancaveis++;
            }
          });
        }
      });
    });

    const taxaBase = 1000000 + mensagensLimpeza.length * 400000;
    const custoInafiancaveis = totalInafiancaveis * 400000;

    return res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral: taxaBase + somaMultas + custoInafiancaveis,
      totalLimpezasAnteriores: mensagensLimpeza.length,
      ultimaLimpeza:
        mensagensLimpeza.length > 0
          ? dataUltimaLimpeza.toLocaleString("pt-BR")
          : "Nunca Limpou",
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    console.error("Erro na API:", error);
    return res
      .status(500)
      .json({ error: "Erro ao processar dados do Discord" });
  }
};

async function buscarMensagensDiscord(
  channelId,
  idCidadao,
  token,
  dataCorte,
  limite,
  buscaAmpla = false
) {
  let filtradas = [];
  let ultimoId = null;
  let processadas = 0;
  const regexRG = new RegExp(`RG:\\s*${idCidadao}(\\D|$)`, "i");

  if (!channelId) return [];

  try {
    while (processadas < limite) {
      const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100${
        ultimoId ? `&before=${ultimoId}` : ""
      }`;
      const response = await fetch(url, {
        headers: { Authorization: `Bot ${token}` },
        signal: AbortSignal.timeout(5000), // Timeout de 5s por requisição
      });

      if (!response.ok) break;

      const mensagens = await response.json();
      if (!mensagens || !Array.isArray(mensagens) || mensagens.length === 0)
        break;

      for (const msg of mensagens) {
        processadas++;
        ultimoId = msg.id;

        if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

        const pertence = (msg.embeds || []).some((embed) => {
          if (buscaAmpla) return JSON.stringify(embed).includes(idCidadao);

          return (embed.fields || []).some((f) => {
            const nome = f.name.toUpperCase();
            // Busca o RG dentro do campo PRESO conforme o seu padrão
            return nome.includes("PRESO") && regexRG.test(f.value);
          });
        });

        if (pertence) filtradas.push(msg);
      }
      if (mensagens.length < 100) break;
    }
  } catch (e) {
    console.error(`Erro ao buscar no canal ${channelId}:`, e);
  }
  return filtradas;
}

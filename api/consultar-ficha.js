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

  try {
    // 1. BUSCA ÚLTIMA LIMPEZA
    const mensagensLimpeza = await buscarMensagens(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      1000,
      true
    );
    let dataCorte =
      mensagensLimpeza.length > 0
        ? new Date(mensagensLimpeza[0].timestamp)
        : new Date(0);

    // 2. BUSCA PRISÕES E FIANÇAS (Limite de 5.000 conforme solicitado)
    const prisoes = await buscarMensagens(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorte,
      5000,
      false
    );
    const fiancas = await buscarMensagens(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorte,
      5000,
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
      const embed = msg.embeds?.[0];
      if (!embed || !embed.fields) return;

      embed.fields.forEach((f) => {
        const nome = f.name.toUpperCase();
        const valor = f.value;

        // EXTRAÇÃO DA MULTA: Captura "Multa: R$55.000" mesmo colado em "meses"
        if (nome.includes("SENTENCA") || nome.includes("MULTA")) {
          // Procura o valor financeiro especificamente após a palavra 'Multa:'
          const matchMulta = valor.match(/Multa:\s*R?\$?\s*([\d.]+)/i);
          if (matchMulta) {
            const valorNumerico =
              parseInt(matchMulta[1].replace(/\./g, "")) || 0;
            somaMultas += valorNumerico;
          }
        }

        // CONTAGEM DE CRIMES: 1 por linha
        if (nome.includes("CRIMES")) {
          valor.split("\n").forEach((linha) => {
            const linhaLimpa = linha
              .toUpperCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            const temCrime = listaKeywordsInafiancaveis.some((k) =>
              linhaLimpa.includes(k)
            );
            if (temCrime && linha.trim().length > 4) {
              totalInafiancaveis++;
            }
          });
        }
      });
    });

    const taxaBase = 1000000 + mensagensLimpeza.length * 400000;
    const custoInafiancaveis = totalInafiancaveis * 400000;

    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral: taxaBase + somaMultas + custoInafiancaveis,
      totalLimpezasAnteriores: mensagensLimpeza.length,
      ultimaLimpeza:
        mensagensLimpeza.length > 0
          ? dataCorte.toLocaleString("pt-BR")
          : "Nunca Limpou",
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao consultar o Discord." });
  }
};

async function buscarMensagens(
  channelId,
  idCidadao,
  token,
  dataCorte,
  limite,
  ampla
) {
  let filtradas = [];
  let ultimoId = null;
  let processadas = 0;

  // REGEX PARA RG COLADO: Captura "RG: 962" ou "CharmosoRG: 962"
  const regexRG = new RegExp(`RG:\\s*${idCidadao}(\\D|$)`, "i");

  while (processadas < limite) {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100${
      ultimoId ? `&before=${ultimoId}` : ""
    }`;
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!response.ok) break;
    const mensagens = await response.json();
    if (!mensagens || mensagens.length === 0) break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;

      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertence = (msg.embeds || []).some((embed) => {
        if (ampla) return JSON.stringify(embed).includes(idCidadao);

        // Verifica o RG dentro do campo PRESO (Padrão: Nome: SmokeRG: 962)
        return (embed.fields || []).some(
          (f) => f.name.toUpperCase().includes("PRESO") && regexRG.test(f.value)
        );
      });

      if (pertence) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

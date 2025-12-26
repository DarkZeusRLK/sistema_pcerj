const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  const startTime = Date.now();
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
    // 1. BUSCA ÚLTIMA LIMPEZA (Mais precisa)
    const mensagensLimpeza = await buscarMensagens(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      1000,
      true,
      startTime
    );
    let dataCorte =
      mensagensLimpeza.length > 0
        ? new Date(mensagensLimpeza[0].timestamp)
        : new Date(0);

    // 2. BUSCA PRISÕES E FIANÇAS (Limite aumentado para 12.000 mensagens)
    // Buscamos um canal após o outro para maximizar o tempo de resposta
    const prisoes = await buscarMensagens(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorte,
      12000,
      false,
      startTime
    );
    const fiancas = await buscarMensagens(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorte,
      12000,
      false,
      startTime
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
      msg.embeds?.[0]?.fields?.forEach((f) => {
        const nome = f.name.toUpperCase();
        const valor = f.value;

        // Extração de Multa (Trata: "Pena: 77 mesesMulta: R$55.000")
        if (
          nome.includes("SENTENCA") ||
          nome.includes("MULTA") ||
          nome.includes("VALOR")
        ) {
          const match = valor.match(/Multa:\s*R?\$?\s*([\d.]+)/i);
          if (match) {
            somaMultas += parseInt(match[1].replace(/\./g, "")) || 0;
          }
        }

        // Contagem de Crimes (Padrão: "Art. 157 - Desacato 01")
        if (nome.includes("CRIMES")) {
          valor.split("\n").forEach((l) => {
            const lin = l
              .toUpperCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            if (
              listaKeywordsInafiancaveis.some((k) => lin.includes(k)) &&
              l.trim().length > 4
            ) {
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
      // Info extra para debug:
      tempoExecucao: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    });
  } catch (error) {
    res.status(500).json({ error: "Erro de conexão." });
  }
};

async function buscarMensagens(
  channelId,
  idCidadao,
  token,
  dataCorte,
  limite,
  ehLimpeza,
  startTime
) {
  let filtradas = [];
  let ultimoId = null;
  let totalLidas = 0;
  const regexRG = new RegExp(`RG:\\s*${idCidadao}(\\D|$)`, "i");

  while (totalLidas < limite) {
    // Trava de segurança para Vercel Free (9 segundos)
    if (Date.now() - startTime > 9000) break;

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
      totalLidas++;
      ultimoId = msg.id;

      // Se chegamos numa mensagem anterior à última limpeza, paramos a busca
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const achou = (msg.embeds || []).some((embed) => {
        // Se for canal de limpeza, verifica o RG de forma mais rigorosa
        if (ehLimpeza) return regexRG.test(JSON.stringify(embed));

        // Em prisões, varre todos os campos do embed em busca do RG
        return (embed.fields || []).some((f) => regexRG.test(f.value));
      });

      if (achou) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

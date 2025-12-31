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

  if (!idCidadao) {
    return res.status(400).json({ error: "ID não fornecido" });
  }

  try {
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    // 🔹 LIMPEZAS (SOMENTE SE TIVER O ID)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA,
      200
    );

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    const totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      const ultima = new Date(mensagensLimpeza[0].timestamp);
      if (ultima > dataCorteFinal) dataCorteFinal = ultima;
    }

    // 🔹 PRISÕES + FIANÇAS
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000
    );

    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000
    );

    const todosRegistros = [...prisoes, ...fiancas];

    let somaMultas = 0;
    let totalInafiancaveis = 0;

    const crimesInafiancaveis = [
      "DESACATO",
      "AMEACA",
      "APOLOGIA",
      "SEQUESTRO",
      "HOMICIDIO",
      "AGRESSAO",
      "PREVARICACAO",
    ];

    // 🔎 PROCESSAMENTO REAL
    todosRegistros.forEach((msg) => {
      msg.embeds?.forEach((embed) => {
        let texto = "";

        if (embed.title) texto += embed.title + "\n";
        if (embed.description) texto += embed.description + "\n";

        embed.fields?.forEach((f) => {
          texto += `${f.name}\n${f.value}\n`;
        });

        const normalizado = texto
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // 💰 MULTA
        const matchMulta = normalizado.match(/MULTA[:\s]*R?\$?\s*([\d.]+)/i);
        if (matchMulta) {
          somaMultas += parseInt(matchMulta[1].replace(/\./g, "")) || 0;
        }

        // ⚖️ CRIMES INAFIANÇÁVEIS
        crimesInafiancaveis.forEach((crime) => {
          const ocorrencias = normalizado.split(crime).length - 1;
          totalInafiancaveis += ocorrencias;
        });
      });
    });

    // 🔢 CÁLCULO FINAL
    const taxaBase = 1000000 + totalLimpezasAnteriores * 400000;
    const custoInafiancaveis = totalInafiancaveis * 400000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral,
      totalLimpezasAnteriores,
      ultimaLimpeza:
        totalLimpezasAnteriores > 0
          ? dataCorteFinal.toLocaleString("pt-BR")
          : "Nunca Limpou",
      totalRegistrosBrutos: todosRegistros.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// =======================================================
// 🔍 BUSCA NO DISCORD (ID NO BLOCO PRESO)
// =======================================================
async function buscarMensagensDiscord(
  channelId,
  idCidadao,
  token,
  dataCorte,
  limite
) {
  let resultados = [];
  let ultimoId = null;

  while (resultados.length < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });

    const mensagens = await res.json();
    if (!Array.isArray(mensagens) || mensagens.length === 0) break;

    for (const msg of mensagens) {
      ultimoId = msg.id;

      if (dataCorte && new Date(msg.timestamp) <= dataCorte) {
        return resultados;
      }

      const textoCompleto = JSON.stringify(msg.embeds || [])
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      const regexID = new RegExp(`\\b${idCidadao}\\b`);

      if (regexID.test(textoCompleto)) {
        resultados.push(msg);
      }
    }
  }

  return resultados;
}

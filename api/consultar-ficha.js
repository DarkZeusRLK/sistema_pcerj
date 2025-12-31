const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const idCidadao = String(req.body.idCidadao || "").trim();
  if (!idCidadao) {
    return res.status(400).json({ error: "ID não fornecido" });
  }

  const {
    Discord_Bot_Token,
    CHANNEL_PRISOES_ID,
    CHANNEL_FIANCAS_ID,
    CHANNEL_LIMPEZA_ID,
  } = process.env;

  try {
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    /* ================= LIMPEZAS ================= */
    const limpezas = await buscarGenerico(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA,
      true
    );

    const totalLimpezasAnteriores = limpezas.length;
    const dataCorteFinal =
      limpezas.length > 0
        ? new Date(limpezas[0].timestamp)
        : DATA_INICIO_SISTEMA;

    /* ================= PRISÕES / FIANÇAS ================= */
    const prisoes = await buscarGenerico(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      false
    );

    const fiancas = await buscarGenerico(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      false
    );

    const registros = [...prisoes, ...fiancas];

    /* ================= PROCESSAMENTO ================= */
    let somaMultas = 0;
    const crimesInafiancaveis = new Set();

    const ARTIGOS_INAFIANCAVEIS = [
      "ART. 101",
      "ART. 102",
      "ART. 103",
      "ART. 104",
      "ART. 105",
      "ART. 106",
      "ART. 110",
      "ART. 150",
      "ART. 159",
      "ART. 160",
      "ART. 161",
    ];

    registros.forEach((msg) => {
      const embed = msg.embeds?.[0];
      if (!embed) return;

      embed.fields?.forEach((f) => {
        const texto = normalizar(`${f.name} ${f.value}`);

        /* 💰 MULTAS (procura em qualquer campo) */
        const multaMatch = texto.match(/MULTA[: ]*R?\$?\s*([\d.]+)/);
        if (multaMatch) {
          somaMultas += parseInt(multaMatch[1].replace(/\./g, "")) || 0;
        }

        /* ⚖️ CRIMES */
        ARTIGOS_INAFIANCAVEIS.forEach((art) => {
          if (texto.includes(art)) crimesInafiancaveis.add(art);
        });
      });
    });

    /* ================= CÁLCULO ================= */
    const taxaBase = 1_000_000 + totalLimpezasAnteriores * 400_000;
    const custoInafiancaveis = crimesInafiancaveis.size * 400_000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    /* ================= RESPOSTA ================= */
    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis: crimesInafiancaveis.size,
      custoInafiancaveis,
      totalGeral,
      totalLimpezasAnteriores,
      ultimaLimpeza:
        limpezas.length > 0
          ? dataCorteFinal.toLocaleString("pt-BR")
          : "Nunca Limpou",
      registrosEncontrados: registros.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= FUNÇÕES ================= */

function normalizar(txt) {
  return txt
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function buscarGenerico(
  channelId,
  idCidadao,
  token,
  dataCorte,
  isLimpeza
) {
  let resultado = [];
  let ultimoId = null;

  while (true) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });

    const msgs = await res.json();
    if (!Array.isArray(msgs) || msgs.length === 0) break;

    for (const msg of msgs) {
      ultimoId = msg.id;

      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return resultado;

      const embed = msg.embeds?.[0];
      if (!embed) continue;

      if (isLimpeza) {
        if (
          normalizar(embed.title || "").includes("LIMPEZA") &&
          msg.content.includes(idCidadao)
        ) {
          resultado.push(msg);
        }
        continue;
      }

      const textoCompleto = normalizar(
        embed.fields?.map((f) => f.value).join(" ") || ""
      );

      if (new RegExp(`\\b${idCidadao}\\b`).test(textoCompleto)) {
        resultado.push(msg);
      }
    }

    if (msgs.length < 100) break;
  }

  return resultado;
}

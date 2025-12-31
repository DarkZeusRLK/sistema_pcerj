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

    // ================= LIMPEZAS =================
    const mensagensLimpeza = await buscarLimpezas(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA
    );

    const totalLimpezasAnteriores = mensagensLimpeza.length;

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    if (mensagensLimpeza.length > 0) {
      const ultima = new Date(mensagensLimpeza[0].timestamp);
      if (ultima > dataCorteFinal) dataCorteFinal = ultima;
    }

    // ================= PRISÕES / FIANÇAS =================
    const prisoes = await buscarPrisaoOuFianca(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal
    );

    const fiancas = await buscarPrisaoOuFianca(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal
    );

    const registros = [...prisoes, ...fiancas];

    let somaMultas = 0;
    let totalInafiancaveis = 0;

    const artigosInafiancaveis = [
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
        const nome = normalizar(f.name);
        const valor = normalizar(f.value);

        // 💰 MULTA
        if (nome.includes("SENTENCA")) {
          const multaMatch = valor.match(/MULTA[: ]*R?\$?\s*([\d.]+)/i);
          if (multaMatch) {
            somaMultas += parseInt(multaMatch[1].replace(/\./g, "")) || 0;
          }
        }

        // ⚖️ CRIMES
        if (nome.includes("CRIMES")) {
          const linhas = valor.split("\n");
          linhas.forEach((linha) => {
            artigosInafiancaveis.forEach((art) => {
              if (linha.includes(art)) totalInafiancaveis++;
            });
          });
        }
      });
    });

    // ================= CÁLCULO =================
    const taxaBase = 1_000_000 + totalLimpezasAnteriores * 400_000;
    const custoInafiancaveis = totalInafiancaveis * 400_000;
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
      registrosEncontrados: registros.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ================= FUNÇÕES =================

function normalizar(txt) {
  return txt
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// 🔹 BUSCA PRISÕES / FIANÇAS
async function buscarPrisaoOuFianca(
  channelId,
  idCidadao,
  token,
  dataCorte
) {
  return buscarGenerico(channelId, idCidadao, token, dataCorte, false);
}

// 🔹 BUSCA LIMPEZAS
async function buscarLimpezas(channelId, idCidadao, token, dataCorte) {
  return buscarGenerico(channelId, idCidadao, token, dataCorte, true);
}

// 🔹 BUSCA GENÉRICA
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
        if (normalizar(embed.title || "").includes("LIMPEZA")) {
          if (msg.content.includes(idCidadao)) resultado.push(msg);
        }
        continue;
      }

      const fields = embed.fields || [];
      let dentroPreso = false;

      for (const f of fields) {
        const nome = normalizar(f.name);
        const valor = normalizar(f.value

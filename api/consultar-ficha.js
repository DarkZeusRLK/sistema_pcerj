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
    EXONERACAO_CHANNEL_ID,
  } = process.env;

  if (!idCidadao) {
    return res.status(400).json({ error: "ID não fornecido" });
  }

  try {
    // ================= DATA BASE DO SISTEMA =================
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    // ================= 1️⃣ EXONERAÇÃO =================
    const dataExoneracao = await buscarDataExoneracao(
      EXONERACAO_CHANNEL_ID,
      idCidadao,
      Discord_Bot_Token
    );

    // Data inicial real para buscar crimes
    const dataBaseCrimes = dataExoneracao || DATA_INICIO_SISTEMA;

    // ================= 2️⃣ LIMPEZAS =================
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      dataBaseCrimes,
      100,
      true
    );

    let totalLimpezasAnteriores = mensagensLimpeza.length;
    let dataCorteFinal = dataBaseCrimes;

    if (mensagensLimpeza.length > 0) {
      const ultimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
      if (ultimaLimpeza > dataCorteFinal) dataCorteFinal = ultimaLimpeza;
    }

    // ================= 3️⃣ PRISÕES / FIANÇAS =================
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false
    );

    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false
    );

    const todosRegistros = [...prisoes, ...fiancas];

    // ================= 4️⃣ PROCESSAMENTO =================
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
      if (!embed) return;

      embed.fields?.forEach((f) => {
        const nome = normalizar(f.name);
        const valor = normalizar(f.value);

        // 💰 MULTA
        if (nome.includes("SENTENCA") || nome.includes("MULTA")) {
          const match = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (match && match[1]) {
            somaMultas += parseInt(match[1].replace(/\./g, "")) || 0;
          }
        }

        // ⚖️ CRIMES INAFIANÇÁVEIS
        if (nome.includes("CRIMES")) {
          const linhas = valor.split("\n");
          linhas.forEach((linha) => {
            const ehInafiancavel = listaKeywordsInafiancaveis.some((k) =>
              linha.includes(k)
            );
            if (ehInafiancavel && linha.replace(/[*`\s]/g, "").length > 3) {
              totalInafiancaveis++;
            }
          });
        }
      });
    });

    // ================= 5️⃣ CÁLCULOS =================
    const taxaBase = 1_000_000 + totalLimpezasAnteriores * 400_000;
    const custoInafiancaveis = totalInafiancaveis * 400_000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    // ================= 6️⃣ RESPOSTA =================
    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral,
      totalLimpezasAnteriores,
      dataExoneracao: dataExoneracao
        ? dataExoneracao.toLocaleString("pt-BR")
        : null,
      ultimaLimpeza:
        totalLimpezasAnteriores > 0
          ? dataCorteFinal.toLocaleString("pt-BR")
          : "Nunca Limpou",
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =======================================================
// 🔍 BUSCA DATA DE EXONERAÇÃO
// =======================================================
async function buscarDataExoneracao(channelId, idCidadao, token) {
  if (!channelId) return null;

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
      if (JSON.stringify(msg.embeds || []).includes(idCidadao)) {
        return new Date(msg.timestamp);
      }
    }

    if (msgs.length < 100) break;
  }

  return null;
}

// =======================================================
// 🔍 BUSCA MENSAGENS (SOMENTE BLOCO "PRESO")
// =======================================================
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

  if (!channelId) return [];

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });

    const mensagens = await res.json();
    if (!Array.isArray(mensagens) || mensagens.length === 0) break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;

      if (dataCorte && new Date(msg.timestamp) <= dataCorte) {
        return filtradas;
      }

      const pertenceAoCidadao = (msg.embeds || []).some((embed) => {
        if (buscaAmpla) {
          return JSON.stringify(embed).toLowerCase().includes(idCidadao);
        }

        return (embed.fields || []).some((field) => {
          const nome = field.name.toLowerCase();
          const valor = field.value.toLowerCase();

          // 🔒 SOMENTE BLOCO PRESO
          if (nome.includes("preso")) {
            const regexID = new RegExp(`(\\D|^)${idCidadao}(\\D|$)`);
            return regexID.test(valor);
          }

          return false;
        });
      });

      if (pertenceAoCidadao) filtradas.push(msg);
    }

    if (mensagens.length < 100) break;
  }

  return filtradas;
}

// =======================================================
function normalizar(txt) {
  return txt
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

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
    // === DATA BASE DO SISTEMA ===
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    // 1️⃣ BUSCAR LIMPEZAS
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA,
      100,
      true
    );

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    const totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      const dataRecente = new Date(mensagensLimpeza[0].timestamp);
      if (dataRecente > dataCorteFinal) dataCorteFinal = dataRecente;
    }

    // 2️⃣ BUSCAR PRISÕES E FIANÇAS (SOMENTE SE FOR O PRESO)
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

    // 3️⃣ PROCESSAMENTO DOS EMBEDS (DESCRIPTION REAL)
    todosRegistros.forEach((msg) => {
      if (!msg.embeds || msg.embeds.length === 0) return;
      const embed = msg.embeds[0];
      if (!embed.description) return;

      const texto = embed.description
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      // 💰 MULTA
      const multaMatch = texto.match(/MULTA:\s*R?\$?\s*([\d.]+)/);
      if (multaMatch && multaMatch[1]) {
        somaMultas += parseInt(multaMatch[1].replace(/\./g, ""), 10);
      }

      // ⚖️ CRIMES INAFIANÇÁVEIS
      const crimesMatch = texto.match(
        /CRIMES([\s\S]*?)(ITENS APREENDIDOS|DINHEIRO SUJO|DETALHES|$)/
      );

      if (crimesMatch && crimesMatch[1]) {
        crimesMatch[1].split("\n").forEach((linha) => {
          linha = linha.trim();
          if (!linha) return;

          if (listaKeywordsInafiancaveis.some((k) => linha.includes(k))) {
            totalInafiancaveis++;
          }
        });
      }
    });

    // 4️⃣ CÁLCULOS
    const taxaBase = 1000000 + totalLimpezasAnteriores * 400000;
    const custoInafiancaveis = totalInafiancaveis * 400000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    // 5️⃣ RESPOSTA FINAL
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
          : "Nunca Limpou (Busca desde 10/12)",

      registrosEncontrados: totalInafiancaveis,
      temCrimesImpedidores: totalInafiancaveis > 0,
      totalRegistrosBrutos: todosRegistros.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =======================================================
// 🔍 BUSCA NO DISCORD (IDENTIFICA PRESO VIA DESCRIPTION)
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
        if (!embed.description) return false;

        const texto = embed.description
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // Captura apenas o bloco do PRESO
        const presoMatch = texto.match(
          /PRESO([\s\S]*?)(SENTENCA|CRIMES|ADVOGADO|$)/
        );

        if (!presoMatch) return false;

        const blocoPreso = presoMatch[1];
        const regexID = new RegExp(`(\\D|^)${idCidadao}(\\D|$)`);
        return regexID.test(blocoPreso);
      });

      if (pertenceAoCidadao || buscaAmpla) {
        filtradas.push(msg);
      }
    }

    if (mensagens.length < 100) break;
  }

  return filtradas;
}

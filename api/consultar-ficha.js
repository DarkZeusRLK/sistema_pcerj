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

    // 1️⃣ BUSCAR LIMPEZAS (após 10/12)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA,
      100,
      true
    );

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      const dataRecenteLimpeza = new Date(mensagensLimpeza[0].timestamp);
      if (dataRecenteLimpeza > dataCorteFinal) {
        dataCorteFinal = dataRecenteLimpeza;
      }
    }

    // 2️⃣ BUSCAR PRISÕES E FIANÇAS (somente se o ID for o PRESO)
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

    // 3️⃣ PROCESSAMENTO DOS EMBEDS
    todosRegistros.forEach((msg) => {
      if (!msg.embeds || msg.embeds.length === 0) return;
      const embed = msg.embeds[0];

      embed.fields?.forEach((f) => {
        const nomeCampo = f.name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        const valorCampo = f.value
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // 💰 MULTAS
        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          const matchMulta = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (matchMulta && matchMulta[1]) {
            somaMultas += parseInt(matchMulta[1].replace(/\./g, "")) || 0;
          }
        }

        // ⚖️ CRIMES INAFIANÇÁVEIS
        if (nomeCampo.includes("CRIMES")) {
          const linhas = valorCampo.split("\n");
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

      // ⚠️ IMPORTANTE PARA O FRONT
      registrosEncontrados: totalInafiancaveis,
      temCrimesImpedidores: totalInafiancaveis > 0,
      totalRegistrosBrutos: todosRegistros.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =======================================================
// 🔍 BUSCA NO DISCORD (SÓ CONSIDERA SE FOR O PRESO)
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
        const fields = embed.fields || [];
        let dentroDoBlocoPreso = false;

        for (const field of fields) {
          const nome = field.name.toLowerCase();
          const valor = field.value.toLowerCase();

          if (nome.includes("preso")) {
            dentroDoBlocoPreso = true;
            continue;
          }

          if (
            nome.includes("crimes") ||
            nome.includes("sentenca") ||
            nome.includes("itens") ||
            nome.includes("detalhes") ||
            nome.includes("participantes") ||
            nome.includes("oficial")
          ) {
            dentroDoBlocoPreso = false;
          }

          if (dentroDoBlocoPreso) {
            const regexID = new RegExp(`(\\D|^)${idCidadao}(\\D|$)`);
            if (regexID.test(valor)) {
              return true;
            }
          }
        }
        return false;
      });

      if (pertenceAoCidadao) {
        filtradas.push(msg);
      }
    }

    if (mensagens.length < 100) break;
  }

  return filtradas;
}

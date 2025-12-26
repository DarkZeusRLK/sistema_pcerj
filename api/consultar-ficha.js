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
    // === CONFIGURAÇÃO DE DATA INICIAL (10/12/2025) ===
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    // 1. BUSCAR ÚLTIMA LIMPEZA (A partir do dia 10/12)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA, // Ignora limpezas antes do dia 10
      100,
      true
    );

    // Define o corte: ou a data da limpeza mais recente, ou o dia 10/12
    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      const dataRecenteLimpeza = new Date(mensagensLimpeza[0].timestamp);
      if (dataRecenteLimpeza > dataCorteFinal) {
        dataCorteFinal = dataRecenteLimpeza;
      }
    }

    // 2. BUSCAR PRISÕES E FIANÇAS (Limite aumentado para 2000 para cobrir o histórico)
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

        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          const matchMulta = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (matchMulta && matchMulta[1]) {
            const valorLimpo = parseInt(matchMulta[1].replace(/\./g, "")) || 0;
            somaMultas += valorLimpo;
          }
        }

        if (nomeCampo.includes("CRIMES")) {
          const linhas = valorCampo.split("\n");
          linhas.forEach((linha) => {
            const ehInafiancavel = listaKeywordsInafiancaveis.some((keyword) =>
              linha.includes(keyword)
            );
            if (ehInafiancavel && linha.replace(/[*`\s]/g, "").length > 3) {
              totalInafiancaveis++;
            }
          });
        }
      });
    });

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
          : "Nunca Limpou (Busca desde 10/12)",
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
  if (!channelId) return [];

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    const mensagens = await res.json();

    if (!mensagens || !Array.isArray(mensagens) || mensagens.length === 0)
      break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;

      // Se a mensagem for anterior ou igual à data de corte, para a busca
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertenceAoCidadao = (msg.embeds || []).some((embed) => {
        if (buscaAmpla) {
          return JSON.stringify(embed).toLowerCase().includes(idCidadao);
        }
        return (embed.fields || []).some((field) => {
          const nome = field.name.toLowerCase();
          const valor = field.value.toLowerCase();
          if (nome.includes("preso") || nome.includes("cidadao")) {
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

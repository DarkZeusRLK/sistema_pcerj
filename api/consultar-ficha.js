const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  const startTime = Date.now(); // Marca o início da execução
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
    // 1. BUSCA ÚLTIMA LIMPEZA (Sempre prioritária)
    const mensagensLimpeza = await buscarMensagens(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      500,
      true,
      startTime
    );
    let dataCorte =
      mensagensLimpeza.length > 0
        ? new Date(mensagensLimpeza[0].timestamp)
        : new Date(0);

    // 2. BUSCA PRISÕES E FIANÇAS (Limite alto, mas com trava de tempo)
    // Buscamos primeiro prisões, depois fianças para não estourar o tempo
    const prisoes = await buscarMensagens(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorte,
      8000,
      false,
      startTime
    );
    const fiancas = await buscarMensagens(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorte,
      8000,
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
        // Captura Multa: R$55.000 ou Multa: 55000
        if (nome.includes("SENTENCA") || nome.includes("MULTA")) {
          const match = f.value.match(/Multa:\s*R?\$?\s*([\d.]+)/i);
          if (match) somaMultas += parseInt(match[1].replace(/\./g, "")) || 0;
        }
        // Captura Crimes (linha por linha)
        if (nome.includes("CRIMES")) {
          f.value.split("\n").forEach((l) => {
            const lin = l
              .toUpperCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            if (
              listaKeywordsInafiancaveis.some((k) => lin.includes(k)) &&
              l.trim().length > 4
            )
              totalInafiancaveis++;
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
      aviso:
        Date.now() - startTime > 8500
          ? "Busca parcial devido ao limite de tempo"
          : null,
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao consultar histórico." });
  }
};

async function buscarMensagens(
  channelId,
  idCidadao,
  token,
  dataCorte,
  limite,
  ampla,
  startTime
) {
  let filtradas = [];
  let ultimoId = null;
  let totalBusca = 0;
  const regexRG = new RegExp(`RG:\\s*${idCidadao}(\\D|$)`, "i");

  while (totalBusca < limite) {
    // MONITOR DE SEGURANÇA: Se passarem 8 segundos, encerra para não dar erro 504
    if (Date.now() - startTime > 8000) break;

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
      totalBusca++;
      ultimoId = msg.id;
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const achou = (msg.embeds || []).some((embed) => {
        if (ampla) return JSON.stringify(embed).includes(idCidadao);
        return (embed.fields || []).some(
          (f) => f.name.toUpperCase().includes("PRESO") && regexRG.test(f.value)
        );
      });
      if (achou) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

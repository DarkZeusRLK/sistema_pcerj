const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    // 1. BUSCA ÚLTIMA LIMPEZA (Até 1000 mensagens)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      1000,
      true
    );

    let dataUltimaLimpeza = new Date(0);
    let totalLimpezasAnteriores = mensagensLimpeza.length;
    if (totalLimpezasAnteriores > 0) {
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCA PRISÕES (Até 20.000 mensagens - Foco no campo RG)
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      20000,
      false
    );

    await sleep(1500); // Pausa de segurança entre canais

    // 3. BUSCA FIANÇAS (Até 20.000 mensagens - Foco no campo RG)
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      20000,
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
      if (!msg.embeds?.[0]) return;
      msg.embeds[0].fields?.forEach((f) => {
        const nomeCampo = f.name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const valorCampo = f.value
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // EXTRAÇÃO DE MULTA
        if (
          nomeCampo.includes("SENTENCA") ||
          nomeCampo.includes("MULTA") ||
          nomeCampo.includes("VALOR")
        ) {
          const matchMulta = f.value.match(/R?\$?\s*([\d.]+)/i);
          if (matchMulta)
            somaMultas += parseInt(matchMulta[1].replace(/\./g, "")) || 0;
        }

        // CRIMES INAFIANÇÁVEIS
        if (nomeCampo.includes("CRIMES")) {
          valorCampo.split("\n").forEach((linha) => {
            if (
              listaKeywordsInafiancaveis.some((k) => linha.includes(k)) &&
              linha.length > 5
            ) {
              totalInafiancaveis++;
            }
          });
        }
      });
    });

    const taxaBase = 1000000 + totalLimpezasAnteriores * 400000;
    const custoInafiancaveis = totalInafiancaveis * 400000;

    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral: taxaBase + somaMultas + custoInafiancaveis,
      totalLimpezasAnteriores,
      ultimaLimpeza:
        totalLimpezasAnteriores > 0
          ? dataUltimaLimpeza.toLocaleString("pt-BR")
          : "Nunca Limpou",
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
  buscaAmpla
) {
  let filtradas = [];
  let ultimoId = null;
  let processadas = 0;
  // Regex para ID exato (não pega 10 dentro de 105)
  const regexID = new RegExp(`(\\D|^)${idCidadao}(\\D|$)`);

  while (processadas < limite) {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100${
      ultimoId ? `&before=${ultimoId}` : ""
    }`;

    const response = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });

    // RATE LIMIT: Se o Discord bloquear, esperamos o tempo solicitado
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") || 5;
      await sleep(retryAfter * 1000);
      continue;
    }

    const mensagens = await response.json();
    if (!mensagens || mensagens.length === 0) break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;

      // Se a mensagem for mais antiga que a última limpeza, para a busca
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertence = (msg.embeds || []).some((embed) => {
        // 1. BUSCA ESPECÍFICA NO CAMPO "RG"
        const noCampoRG = (embed.fields || []).some((f) => {
          const nome = f.name
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          return nome === "RG" && regexID.test(f.value);
        });

        if (noCampoRG) return true;

        // 2. BUSCA AMPLA (Caso o ID esteja na descrição ou título)
        if (buscaAmpla) {
          const textoCompleto = JSON.stringify(embed).toLowerCase();
          return regexID.test(textoCompleto);
        }
        return false;
      });

      if (pertence) filtradas.push(msg);
    }

    if (mensagens.length < 100) break;
    await sleep(300); // Pausa preventiva para não ser banido
  }
  return filtradas;
}

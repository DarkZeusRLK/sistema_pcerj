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

  try {
    // 1. BUSCAR ÚLTIMA LIMPEZA (Limite menor para poupar tempo)
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

    // 2. BUSCAR PRISÕES E FIANÇAS (Busca otimizada)
    // Usamos um limite de 5000 para garantir que a Vercel não corte a conexão por tempo
    const [prisoes, fiancas] = await Promise.all([
      buscarMensagensDiscord(
        CHANNEL_PRISOES_ID,
        idCidadao,
        Discord_Bot_Token,
        dataUltimaLimpeza,
        5000,
        false
      ),
      buscarMensagensDiscord(
        CHANNEL_FIANCAS_ID,
        idCidadao,
        Discord_Bot_Token,
        dataUltimaLimpeza,
        5000,
        false
      ),
    ]);

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

        // EXTRAÇÃO DE MULTA (Pega valores como 100.000 ou 100000)
        if (
          nomeCampo.includes("SENTENCA") ||
          nomeCampo.includes("MULTA") ||
          nomeCampo.includes("VALOR") ||
          nomeCampo.includes("FIANCA")
        ) {
          const valorLimpo = f.value.replace(/\./g, "").match(/(\d+)/);
          if (valorLimpo) somaMultas += parseInt(valorLimpo[0]) || 0;
        }

        // CRIMES INAFIANÇÁVEIS
        if (nomeCampo.includes("CRIMES")) {
          valorCampo.split("\n").forEach((linha) => {
            if (
              listaKeywordsInafiancaveis.some((k) => linha.includes(k)) &&
              linha.length > 3
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
  const regexID = new RegExp(`(\\D|^)${idCidadao}(\\D|$)`);

  while (processadas < limite) {
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
      processadas++;
      ultimoId = msg.id;

      // Para a busca se chegar na data da última limpeza
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertence = (msg.embeds || []).some((embed) => {
        // Busca o ID em campos chave (RG, PASSAPORTE, CIDADAO)
        const matchNoCampo = (embed.fields || []).some((f) => {
          const nome = f.name
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          return (
            (nome.includes("RG") ||
              nome.includes("PASSAPORTE") ||
              nome.includes("ID") ||
              nome.includes("PRESO")) &&
            regexID.test(f.value)
          );
        });

        if (matchNoCampo) return true;

        // Fallback: Busca em todo o embed se for limpeza ou se o campo falhar
        if (buscaAmpla || JSON.stringify(embed).includes(idCidadao)) {
          return regexID.test(JSON.stringify(embed));
        }
        return false;
      });

      if (pertence) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

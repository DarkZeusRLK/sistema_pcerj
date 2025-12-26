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
    // 1. BUSCA ÚLTIMA LIMPEZA
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      100,
      true
    );
    let dataCorte =
      mensagensLimpeza.length > 0
        ? new Date(mensagensLimpeza[0].timestamp)
        : new Date(0);

    // 2. BUSCA PRISÕES E FIANÇAS
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorte,
      1000,
      false
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorte,
      1000,
      false
    );

    const todosRegistros = [...prisoes, ...fiancas];
    let somaMultas = 0;
    let totalInafiancaveis = 0;

    const keywordsInafiancaveis = [
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
      if (!embed || !embed.fields) return;

      embed.fields.forEach((f) => {
        const valorOriginal = f.value;
        const valorLimpo = valorOriginal
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // EXTRAÇÃO DE MULTA: Procura "Multa:" e pega o número, independente de onde esteja no campo
        // Agora ele pega R$655.000 mesmo se tiver texto antes ou depois
        const matchMulta = valorOriginal.match(/Multa[:\s]*R?\$?\s*([\d.]+)/i);
        if (matchMulta) {
          const valorNumerico = parseInt(matchMulta[1].replace(/\./g, "")) || 0;
          somaMultas += valorNumerico;
        }

        // CONTAGEM DE CRIMES: Varre o campo procurando as palavras-chave
        // Isso garante que "Homicídio" seja contado mesmo se o campo não se chamar "Crimes"
        valorLimpo.split("\n").forEach((linha) => {
          if (
            keywordsInafiancaveis.some((k) => linha.includes(k)) &&
            linha.trim().length > 4
          ) {
            totalInafiancaveis++;
          }
        });
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

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100${
      ultimoId ? `&before=${ultimoId}` : ""
    }`;
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    const mensagens = await response.json();

    if (!mensagens || !Array.isArray(mensagens) || mensagens.length === 0)
      break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertence = (msg.embeds || []).some((embed) => {
        // BUSCA UNIVERSAL: Se o ID aparecer em qualquer lugar do embed (campos, descrição, etc)
        // ele vai capturar o relatório. Resolve o problema de nomes de campos diferentes.
        return JSON.stringify(embed).includes(idCidadao);
      });

      if (pertence) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

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
    // 1. BUSCAR ÚLTIMA LIMPEZA (Corte de data)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      100
    );
    let dataUltimaLimpeza = new Date(0);
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCAR PRISÕES E FIANÇAS
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      500
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      500
    );
    const todosRegistros = [...prisoes, ...fiancas];

    let somaMultas = 0;
    let totalInafiancaveis = 0;
    const listaCrimesInafiancaveis = [
      "HOMICIDIO",
      "DESACATO",
      "TRAFICO",
      "SEQUESTRO",
      "TENTATIVA",
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

        // EXTRAÇÃO DA MULTA (Pega o número após "Multa:")
        // Ex: "Pena: 36 mesesMulta: R$25.000" -> Captura 25.000
        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          const regexMulta = /MULTA:\s*R?\$?\s*([\d.]+)/i;
          const match = f.value.match(regexMulta);
          if (match && match[1]) {
            // Remove pontos de milhar e converte para número
            const valorLimpo = parseInt(match[1].replace(/\./g, "")) || 0;
            somaMultas += valorLimpo;
          }
        }

        // CONTAGEM DE CRIMES INAFIANÇÁVEIS
        if (nomeCampo.includes("CRIMES")) {
          listaCrimesInafiancaveis.forEach((crime) => {
            if (valorCampo.includes(crime)) {
              const regex = new RegExp(crime, "gi");
              totalInafiancaveis += (valorCampo.match(regex) || []).length;
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
          ? dataUltimaLimpeza.toLocaleString("pt-BR")
          : "Ficha Suja",
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
  limite
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

      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      // FILTRO DE IDENTIFICAÇÃO:
      // Procura no campo "Preso" pelo padrão "RG: [idCidadao]"
      const pertenceAoCidadao = (msg.embeds || []).some((embed) => {
        return (embed.fields || []).some((field) => {
          const nome = field.name.toLowerCase();
          const valor = field.value.toLowerCase();

          if (nome.includes("preso")) {
            // Esta linha garante que "RG: 737" seja encontrado exatamente
            const regexRG = new RegExp(`rg:\\s*${idCidadao}(\\b|$)`, "i");
            return regexRG.test(valor);
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

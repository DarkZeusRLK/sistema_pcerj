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
    // No canal de limpeza, procuramos o ID em QUALQUER lugar da mensagem/embed
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      50,
      true
    );

    let dataUltimaLimpeza = new Date(0);
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      // Pega a limpeza mais recente
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCAR PRISÕES E FIANÇAS
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      500,
      false
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      500,
      false
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
        // Limpa o nome do campo para comparação (remove emojis e espaços)
        const nomeCampo = f.name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const valorCampo = f.value
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // EXTRAÇÃO DA MULTA: Agora aceita "**Multa:** R$ 25.000" ou "Multa: 25000"
        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          // Regex que procura o número após a palavra "Multa", ignorando ** e R$
          const matchMulta = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (matchMulta && matchMulta[1]) {
            const valorLimpo = parseInt(matchMulta[1].replace(/\./g, "")) || 0;
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
          : "Nunca Limpou",
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    console.error("Erro na API:", error);
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

      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertenceAoCidadao = (msg.embeds || []).some((embed) => {
        // Se for canal de limpeza (buscaAmpla), olha em tudo: título, descrição e campos
        if (buscaAmpla) {
          const textoCompleto = JSON.stringify(embed).toLowerCase();
          return textoCompleto.includes(idCidadao);
        }

        // Se for canal de Prisão/Fiança, procura especificamente no campo que contém "Preso"
        return (embed.fields || []).some((field) => {
          const nome = field.name.toLowerCase();
          const valor = field.value.toLowerCase();

          if (nome.includes("preso")) {
            // Procura o ID isolado para não confundir "73" com "737"
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

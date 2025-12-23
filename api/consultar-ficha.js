const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { idCidadao } = req.body;
  const {
    Discord_Bot_Token,
    CHANNEL_PRISOES_ID,
    CHANNEL_FIANCAS_ID,
    CHANNEL_LIMPEZA_ID,
  } = process.env;

  if (!idCidadao) return res.status(400).json({ error: "ID não fornecido" });

  try {
    // 1. BUSCAR ÚLTIMA LIMPEZA
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      300
    );

    let dataUltimaLimpeza = new Date(0);
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      // Pega a data da limpeza mais recente para servir de "ponto de corte"
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCAR REGISTROS CRIMINAIS (Prisões e Fianças)
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      1000
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      1000
    );

    const todosRegistros = [...prisoes, ...fiancas];

    let somaMultas = 0;
    let totalInafiancaveis = 0;
    const listaCrimesInafiancaveis = [
      "DESACATO",
      "HOMICIDIO",
      "TENTATIVA",
      "SEQUESTRO",
      "TRAFICO",
    ];

    todosRegistros.forEach((msg) => {
      if (!msg.embeds || msg.embeds.length === 0) return;
      const embed = msg.embeds[0];

      // Percorre todos os campos do embed
      embed.fields?.forEach((f) => {
        const nomeCampo = f.name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const valorCampo = f.value
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // --- CORREÇÃO: Extração de Multas ---
        // Se o campo se chamar MULTA, VALOR, TOTAL ou TAXA
        if (
          nomeCampo.includes("MULTA") ||
          nomeCampo.includes("VALOR") ||
          nomeCampo.includes("TOTAL")
        ) {
          // Remove tudo que não for número (ex: R$ 10.000 -> 10000)
          const apenasNumeros = f.value.replace(/\D/g, "");
          somaMultas += parseInt(apenasNumeros) || 0;
        }

        // --- CORREÇÃO: Extração de Crimes ---
        if (nomeCampo.includes("CRIME")) {
          listaCrimesInafiancaveis.forEach((crime) => {
            const regex = new RegExp(crime, "gi");
            const ocorrencias = (valorCampo.match(regex) || []).length;
            totalInafiancaveis += ocorrencias;
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
          ? dataUltimaLimpeza.toLocaleDateString("pt-BR")
          : "Nunca",
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

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    const mensagens = await res.json();

    if (!mensagens || mensagens.length === 0) break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;
      const dataMsg = new Date(msg.timestamp);

      // Se chegamos em mensagens antes da última limpeza, paramos a busca
      if (dataCorte && dataMsg <= dataCorte) {
        return filtradas;
      }

      // Verifica se o ID do cidadão está nos campos ou descrição do embed
      const stringEmbed = JSON.stringify(msg.embeds || "").toLowerCase();
      // Usamos uma regex simples para garantir que o ID não seja parte de outro número (ex: ID 10 não pegar 110)
      const regexId = new RegExp(`\\b${idCidadao}\\b`);

      if (regexId.test(stringEmbed)) {
        filtradas.push(msg);
      }
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

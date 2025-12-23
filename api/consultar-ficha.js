// api/consultar-ficha.js (Versão Sincronizada com seu script.js)
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  const { idCidadao } = req.body;
  const {
    Discord_Bot_Token,
    CHANNEL_PRISOES_ID,
    CHANNEL_FIANCAS_ID,
    CHANNEL_LIMPEZA_ID,
  } = process.env;

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
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCAR PRISÕES E FIANÇAS
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

    // Lista baseada nos nomes que aparecem no seu Script.js (Código Penal)
    const listaCrimesInafiancaveis = [
      "DESACATO",
      "HOMICIDIO",
      "TENTATIVA",
      "SEQUESTRO",
      "TRAFICO",
      "PORTE DE ARMA PESADA",
    ];

    todosRegistros.forEach((msg) => {
      const embed = msg.embeds[0];
      if (!embed || !embed.fields) return;

      embed.fields.forEach((f) => {
        // Normaliza o nome do campo para ignorar emojis e maiúsculas
        const nomeCampo = f.name.toUpperCase();

        // No seu script.js o campo é "💰 Multa"
        if (nomeCampo.includes("MULTA") || nomeCampo.includes("VALOR")) {
          const valorLimpo = f.value.replace(/\D/g, "");
          somaMultas += parseInt(valorLimpo) || 0;
        }

        // No seu script.js o campo é "📜 Crimes"
        if (nomeCampo.includes("CRIMES")) {
          const crimesTexto = f.value.toUpperCase();
          listaCrimesInafiancaveis.forEach((crime) => {
            const regex = new RegExp(crime, "gi");
            const ocorrencias = (crimesTexto.match(regex) || []).length;
            totalInafiancaveis += ocorrencias;
          });
        }
      });
    });

    // CÁLCULO DAS TAXAS PROGRESSIVAS (CONFORME SOLICITADO)
    // 1ª Limpeza: 1.000.000 | 2ª: 1.400.000 | 3ª: 1.800.000...
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
          : "Nenhuma",
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

    if (!mensagens || mensagens.length === 0 || !Array.isArray(mensagens))
      break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;
      const dataMsg = new Date(msg.timestamp);

      if (dataCorte && dataMsg <= dataCorte) return filtradas;

      const stringEmbed = JSON.stringify(msg.embeds || "");
      // Busca o ID garantindo que ele esteja isolado (evita que ID 1 pegue ID 10)
      const regexId = new RegExp(`\\b${idCidadao}\\b`);

      if (regexId.test(stringEmbed)) {
        filtradas.push(msg);
      }
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

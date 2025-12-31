const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // Configuração de CORS e Cabeçalhos
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
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    // 1. BUSCAR LIMPEZA
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA,
      100,
      true // Busca ampla na limpeza
    );

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      const dataRecenteLimpeza = new Date(mensagensLimpeza[0].timestamp);
      if (dataRecenteLimpeza > dataCorteFinal) {
        dataCorteFinal = dataRecenteLimpeza;
      }
    }

    // 2. BUSCAR PRISÕES E FIANÇAS (Busca ESTRITA)
    // Aumentei o limite para garantir que pega tudo
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false // Busca estrita (SÓ CAMPO PRESO)
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false // Busca estrita (SÓ CAMPO PRESO)
    );
    const todosRegistros = [...prisoes, ...fiancas];

    // 3. CÁLCULOS
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
        const nomeCampo = normalizarTexto(f.name);

        // Pega valor da multa
        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          const matchMulta = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (matchMulta && matchMulta[1]) {
            somaMultas += parseInt(matchMulta[1].replace(/\./g, "")) || 0;
          }
        }

        // Verifica crimes inafiançáveis
        if (nomeCampo.includes("CRIMES")) {
          const linhas = normalizarTexto(f.value).split("\n");
          linhas.forEach((linha) => {
            const ehInafiancavel = listaKeywordsInafiancaveis.some((keyword) =>
              linha.includes(keyword)
            );
            // Ignora linhas muito curtas (evita falsos positivos em formatação)
            if (ehInafiancavel && linha.length > 3) {
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
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    console.error("Erro API:", error);
    res.status(500).json({ error: error.message });
  }
};

// Função auxiliar para limpar texto (Upper + Sem acentos)
function normalizarTexto(texto) {
  if (!texto) return "";
  return texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

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

  // Cria regex exata para o ID (evita pegar "123" dentro de "12345")
  const safeId = idCidadao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexIdEstrita = new RegExp(`(?:^|[^0-9])${safeId}(?:$|[^0-9])`);

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!res.ok) break; // Se der erro no Discord, para o loop

    const mensagens = await res.json();
    if (!mensagens || !Array.isArray(mensagens) || mensagens.length === 0)
      break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;

      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertence = (msg.embeds || []).some((embed) => {
        // MODO 1: LIMPEZA (Busca em qualquer lugar do embed)
        if (buscaAmpla) {
          return JSON.stringify(embed).toLowerCase().includes(idCidadao);
        }

        // MODO 2: FICHA CRIMINAL (Busca ESTRITA apenas no campo correto)
        const fields = embed.fields || [];

        return fields.some((field) => {
          const nomeCampo = normalizarTexto(field.name);
          const valorCampo = field.value || "";

          // LISTA NEGRA: Se for um desses campos, IGNORA, mesmo que tenha o ID
          const blacklist = [
            "ADVOGADO",
            "POLICIAL",
            "OFICIAL",
            "PARTICIPANTE",
            "TESTEMUNHA",
            "QRA",
            "RESPONSAVEL",
          ];
          if (blacklist.some((bad) => nomeCampo.includes(bad))) return false;

          // LISTA BRANCA: Só aceita se o campo tiver nomes relacionados ao Preso
          const whitelist = [
            "PRESO",
            "DETENTO",
            "INDICIADO",
            "REU",
            "ACUSADO",
            "CIDADAO",
            "NOME",
          ];

          if (whitelist.some((good) => nomeCampo.includes(good))) {
            // Verifica se o ID está no valor deste campo específico
            return regexIdEstrita.test(valorCampo);
          }

          return false;
        });
      });

      if (pertence) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

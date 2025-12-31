const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // Configuração CORS padrão
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

  // Array para guardar o histórico do que aconteceu (Debug para Vercel)
  let debugLog = [];

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
      true, // Busca ampla na limpeza
      "LIMPEZA",
      debugLog
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
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false,
      "PRISOES",
      debugLog
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false,
      "FIANCAS",
      debugLog
    );
    const todosRegistros = [...prisoes, ...fiancas];

    // 3. CÁLCULO
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

        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          const matchMulta = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (matchMulta && matchMulta[1]) {
            somaMultas += parseInt(matchMulta[1].replace(/\./g, "")) || 0;
          }
        }

        if (nomeCampo.includes("CRIMES")) {
          const linhas = normalizarTexto(f.value).split("\n");
          linhas.forEach((linha) => {
            const ehInafiancavel = listaKeywordsInafiancaveis.some((keyword) =>
              linha.includes(keyword)
            );
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

    // Retorna tudo, incluindo o LOG DE DEBUG
    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      totalGeral,
      registrosEncontrados: todosRegistros.length,
      debugLog: debugLog, // <--- AQUI ESTÁ A CHAVE PARA VOCÊ VER O ERRO
    });
  } catch (error) {
    res.status(500).json({ error: error.message, debugLog });
  }
};

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
  buscaAmpla = false,
  tipoCanal = "",
  logArray = []
) {
  let filtradas = [];
  let ultimoId = null;
  let processadas = 0;

  if (!channelId) return [];

  // Regex Estrita
  const safeId = idCidadao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexIdEstrita = new RegExp(`(?:^|[^0-9])${safeId}(?:$|[^0-9])`);

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) break;

    const mensagens = await res.json();
    if (!mensagens || !Array.isArray(mensagens) || mensagens.length === 0)
      break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertence = (msg.embeds || []).some((embed) => {
        // MODO 1: LIMPEZA (Amplo)
        if (buscaAmpla) {
          return JSON.stringify(embed)
            .toLowerCase()
            .includes(idCidadao.toLowerCase());
        }

        // MODO 2: FICHA CRIMINAL (Blindado)
        const fields = embed.fields || [];

        // ESTRATÉGIA A: Se tem campos, FILTRA RIGOROSAMENTE
        if (fields.length > 0) {
          for (const field of fields) {
            const nomeCampo = normalizarTexto(field.name);
            const valorCampo = field.value || "";

            // 1. LISTA NEGRA (BLACKLIST) - SE TIVER ISSO NO NOME, PULA!
            // Aqui removemos "Participantes", "Oficial", "Advogado"
            const titulosProibidos = [
              "PARTICIPANTE",
              "OFICIAL",
              "ADVOGADO",
              "POLICIAL",
              "QRA",
              "TESTEMUNHA",
              "RESPONSAVEL",
            ];

            if (
              titulosProibidos.some((proibido) => nomeCampo.includes(proibido))
            ) {
              // Se o ID estiver aqui, nós registramos no log que foi IGNORADO
              if (regexIdEstrita.test(valorCampo)) {
                logArray.push(
                  `[IGNORADO] ID encontrado em campo proibido: '${field.name}' (Msg ID: ${msg.id})`
                );
              }
              continue; // Pula para o próximo campo
            }

            // 2. LISTA BRANCA - Só aceita se tiver nome de Preso
            const titulosPermitidos = [
              "PRESO",
              "DETENTO",
              "INDICIADO",
              "REU",
              "ACUSADO",
              "CIDADAO",
              "NOME",
            ];
            const ehCampoDePreso = titulosPermitidos.some((permitido) =>
              nomeCampo.includes(permitido)
            );

            if (ehCampoDePreso) {
              if (regexIdEstrita.test(valorCampo)) {
                logArray.push(
                  `[MATCH] ✅ ID encontrado como PRESO. Campo: '${field.name}' (Msg ID: ${msg.id})`
                );
                return true;
              }
            }
          }
          return false; // Se varreu os campos e não achou no campo "Preso", retorna false
        }

        // ESTRATÉGIA B: Fallback (apenas se não tiver fields)
        if (embed.description && fields.length === 0) {
          const desc = embed.description;
          // Tenta cortar o texto antes da palavra "Preso"
          const matchInicio = desc.match(/(?:\n|^).*(?:PRESO|DETENTO|REU).*/i);

          if (matchInicio) {
            const textoLimpo = desc.substring(matchInicio.index);
            if (regexIdEstrita.test(textoLimpo)) {
              logArray.push(
                `[MATCH] ✅ ID encontrado na Descrição (Fallback). (Msg ID: ${msg.id})`
              );
              return true;
            }
          }
          return false;
        }

        return false;
      });

      if (pertence) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

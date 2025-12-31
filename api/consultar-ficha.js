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
    EXONERACAO_CHANNEL_ID, // <--- REQUER ESTA VARIÁVEL NO VERCEL
  } = process.env;

  if (!idCidadao) return res.status(400).json({ error: "ID não fornecido" });

  try {
    // === DATA ZERO (INÍCIO DO SISTEMA) ===
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let origemCorte = "Início do Sistema (10/12)";

    // =================================================================================
    // 1. VERIFICAR EXONERAÇÃO (CRUCIAL PARA EX-POLICIAIS)
    // =================================================================================
    if (EXONERACAO_CHANNEL_ID) {
      // Busca as últimas 50 exonerações para ver se ele está lá
      const msgsExoneracao = await buscarMensagensDiscord(
        EXONERACAO_CHANNEL_ID,
        idCidadao,
        Discord_Bot_Token,
        null, // Sem data de corte inicial
        50,
        true // Busca ampla para achar a mensagem primeiro
      );

      // Analisa o CONTEÚDO da mensagem para extrair a data exata
      for (const msg of msgsExoneracao) {
        // Pega texto do conteúdo ou da descrição do embed
        const texto =
          (msg.content || "") + "\n" + (msg.embeds?.[0]?.description || "");

        // REGEX ESPECÍFICA PARA O SEU MODELO: "**ID:**2337" e "**Data:** 31/12/2025"
        // \s* permite ter espaço ou não ter espaço depois dos dois pontos
        const matchID = texto.match(/\*\*ID:\*\*\s*(\d+)/i);
        const matchData = texto.match(/\*\*Data:\*\*\s*(\d{2}\/\d{2}\/\d{4})/i);

        if (matchID && matchID[1] === idCidadao && matchData) {
          const dataExoneracao = converterDataBrasileira(matchData[1]);

          // Se a data de exoneração for válida e mais recente que a data atual
          if (dataExoneracao && dataExoneracao > dataCorteFinal) {
            dataCorteFinal = dataExoneracao;
            origemCorte = `Exonerado em ${matchData[1]}`;
          }
        }
      }
    }

    // =================================================================================
    // 2. VERIFICAR LIMPEZA DE FICHA (Pode ser mais recente que a exoneração)
    // =================================================================================
    const msgsLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal, // Só busca limpezas DEPOIS da exoneração/inicio
      100,
      true
    );

    if (msgsLimpeza.length > 0) {
      const dataLimpeza = new Date(msgsLimpeza[0].timestamp);
      if (dataLimpeza > dataCorteFinal) {
        dataCorteFinal = dataLimpeza;
        origemCorte = "Limpeza de Ficha Recente";
      }
    }

    // =================================================================================
    // 3. BUSCAR PRISÕES E FIANÇAS (APÓS A DATA DE CORTE)
    // =================================================================================
    // Aqui usamos 'false' para busca estrita (Ignorar ID em participantes)
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false
    );
    const todosRegistros = [...prisoes, ...fiancas];

    // =================================================================================
    // 4. CÁLCULOS
    // =================================================================================
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

    const taxaBase = 1000000; // Taxa fixa base, já que limpeza reseta o contador
    const custoInafiancaveis = totalInafiancaveis * 400000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral,
      origemCorte, // Para você saber por que filtrou
      dataCorte: dataCorteFinal.toLocaleString("pt-BR"),
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    console.error("Erro API:", error);
    res.status(500).json({ error: error.message });
  }
};

// =================================================================================
// HELPERS
// =================================================================================

// Converte "31/12/2025" para Objeto Date Javascript
function converterDataBrasileira(dataStr) {
  if (!dataStr) return null;
  const partes = dataStr.split("/");
  if (partes.length !== 3) return null;
  // Mês em JS começa em 0 (Janeiro = 0), então subtraímos 1
  return new Date(partes[2], partes[1] - 1, partes[0], 23, 59, 59);
}

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

  // Regex de ID Estrito
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

      // FILTRO DE DATA: Ignora tudo antes da data de corte (Exoneração/Limpeza/Início)
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertence = (msg.embeds || []).some((embed) => {
        // MODO 1: BUSCA AMPLA (Para achar a mensagem de Exoneração/Limpeza)
        if (buscaAmpla) {
          // Verifica no conteúdo da mensagem (texto fora do embed)
          if (msg.content && msg.content.includes(idCidadao)) return true;
          // Verifica no embed inteiro
          return JSON.stringify(embed).toLowerCase().includes(idCidadao);
        }

        // MODO 2: FICHA CRIMINAL (Proteção contra Policiais)
        const fields = embed.fields || [];

        // Estratégia A: Campos com Whitelist/Blacklist
        if (fields.length > 0) {
          return fields.some((field) => {
            const nome = normalizarTexto(field.name);
            const valor = field.value || "";

            const blacklist = [
              "PARTICIPANTE",
              "OFICIAL",
              "ADVOGADO",
              "POLICIAL",
              "QRA",
              "TESTEMUNHA",
            ];
            if (blacklist.some((bad) => nome.includes(bad))) return false;

            const whitelist = [
              "PRESO",
              "DETENTO",
              "INDICIADO",
              "REU",
              "ACUSADO",
              "CIDADAO",
              "NOME",
              "RG",
              "PASSAPORTE",
            ];
            if (whitelist.some((good) => nome.includes(good))) {
              return regexIdEstrita.test(valor);
            }
            return false;
          });
        }

        // Estratégia B: Descrição (corte de texto)
        if (embed.description && fields.length === 0) {
          const desc = embed.description;
          const matchInicio = desc.match(/(?:\n|^).*(?:PRESO|DETENTO|REU).*/i);
          if (matchInicio) {
            const textoFiltrado = desc.substring(matchInicio.index);
            return regexIdEstrita.test(textoFiltrado);
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

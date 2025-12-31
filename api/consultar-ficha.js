const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // Configuração CORS
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

    // 1. BUSCAR LIMPEZA (Aqui a busca pode ser ampla, pois a msg é simples)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA,
      100,
      true // TRUE = Busca em tudo (apenas para limpeza)
    );

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      const dataRecenteLimpeza = new Date(mensagensLimpeza[0].timestamp);
      if (dataRecenteLimpeza > dataCorteFinal) {
        dataCorteFinal = dataRecenteLimpeza;
      }
    }

    // 2. BUSCAR PRISÕES E FIANÇAS (Busca ESTRITA = FALSE)
    // ATENÇÃO: O false aqui ativa o modo "Cirúrgico" da função abaixo
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

        // Somar Multas
        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          const matchMulta = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (matchMulta && matchMulta[1]) {
            somaMultas += parseInt(matchMulta[1].replace(/\./g, "")) || 0;
          }
        }

        // Contar Crimes Graves
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

  // Regex "Estrita": Garante que o ID é o número exato.
  // Evita que ID "2337" seja encontrado dentro de "12337".
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
        // MODO 1: LIMPEZA (Busca Ampla em todo o texto)
        if (buscaAmpla) {
          return JSON.stringify(embed).toLowerCase().includes(idCidadao);
        }

        // MODO 2: FICHA CRIMINAL (Proteção contra ID de Policial)
        const fields = embed.fields || [];

        // CASO A: O embed tem campos (Fields) - Padrão novo
        if (fields.length > 0) {
          // Percorre todos os campos
          return fields.some((field) => {
            const nomeCampo = normalizarTexto(field.name);

            // 🚫 BLOQUEIO DE SEGURANÇA (Blacklist)
            // Se o campo for "Participantes" ou "Oficial", IGNORA IMEDIATAMENTE
            const blacklist = [
              "PARTICIPANTE",
              "OFICIAL",
              "ADVOGADO",
              "POLICIAL",
              "QRA",
              "TESTEMUNHA",
            ];
            if (blacklist.some((bad) => nomeCampo.includes(bad))) {
              return false; // Sai e diz "Não achei aqui"
            }

            // ✅ LISTA BRANCA (Whitelist)
            // Só aceita ler o ID se o campo for explicitamente do preso
            const whitelist = [
              "PRESO",
              "DETENTO",
              "INDICIADO",
              "REU",
              "ACUSADO",
              "CIDADAO",
              "NOME",
              "RG",
            ];

            if (whitelist.some((good) => nomeCampo.includes(good))) {
              // Se o título for válido, verifica se o ID está no valor
              return regexIdEstrita.test(field.value || "");
            }

            return false; // Campo neutro (ex: "Crimes"), ignora.
          });
        }

        // CASO B: O embed NÃO tem campos (Layout muito antigo ou bugado)
        // Só entra aqui se fields.length === 0.
        if (embed.description && fields.length === 0) {
          const desc = embed.description;
          // Tenta achar onde começa a parte do preso para ignorar o cabeçalho de oficiais
          const matchInicio = desc.match(/(?:\n|^).*(?:PRESO|DETENTO|REU).*/i);

          if (matchInicio) {
            // Corta o texto e pega só do "Preso" para baixo
            const textoFiltrado = desc.substring(matchInicio.index);
            return regexIdEstrita.test(textoFiltrado);
          }
          // Se não achou separação clara, retorna false por segurança
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

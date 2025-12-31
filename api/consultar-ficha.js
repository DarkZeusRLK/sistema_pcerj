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
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    // 1. BUSCAR LIMPEZA (Busca Ampla permitida aqui, pois a msg é simples)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA,
      100,
      true
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
    // Aqui garantimos que só olhe campos permitidos
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

  // Regex para garantir que o ID é exato (Ex: "2337" e não "12337")
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
        // MODO 1: LIMPEZA (Busca Ampla - Procura em tudo)
        if (buscaAmpla) {
          return JSON.stringify(embed).toLowerCase().includes(idCidadao);
        }

        // MODO 2: PRISÃO/FIANÇA (Busca CRITERIOSA)
        const fields = embed.fields || [];

        // Se houver campos, percorre um por um
        if (fields.length > 0) {
          return fields.some((field) => {
            const nomeCampo = normalizarTexto(field.name);

            // 1. LISTA NEGRA EXPLÍCITA (Para garantir que policial nunca caia aqui)
            // Se o campo tiver qualquer uma dessas palavras, IGNORA O CONTEÚDO
            const blacklist = [
              "PARTICIPANTE",
              "OFICIAL",
              "ADVOGADO",
              "POLICIAL",
              "QRA",
              "TESTEMUNHA",
            ];
            if (blacklist.some((bad) => nomeCampo.includes(bad))) {
              return false; // Sai imediatamente, não verifica o ID
            }

            // 2. LISTA BRANCA OBRIGATÓRIA
            // Só verifica o ID se o campo for um desses:
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

            if (whitelist.some((good) => nomeCampo.includes(good))) {
              // Só agora verificamos se o ID está aqui dentro
              return regexIdEstrita.test(field.value || "");
            }

            // Se não for Lista Negra nem Lista Branca (ex: "Sentença", "Crimes"), ignora.
            return false;
          });
        }

        // Fallback: Se NÃO tem fields (layout muito antigo), verifica descrição
        // Mas APENAS se não tiver fields.
        if (embed.description && fields.length === 0) {
          // Tenta achar onde começa a parte do preso para ignorar cabeçalho
          const desc = embed.description;
          const matchInicio = desc.match(/(?:\n|^).*(?:PRESO|DETENTO|REU).*/i);

          if (matchInicio) {
            const textoFiltrado = desc.substring(matchInicio.index);
            return regexIdEstrita.test(textoFiltrado);
          }
          // Se não achou marcador de preso, não arrisca pegar ID de policial
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

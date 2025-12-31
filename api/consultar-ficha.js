const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // Configurações de CORS
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
    EXONERACAO_CHANNEL_ID, // <--- NOVA VARIÁVEL
  } = process.env;

  if (!idCidadao) return res.status(400).json({ error: "ID não fornecido" });

  try {
    // === CONFIGURAÇÃO DE DATA INICIAL (10/12/2025) ===
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");
    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let origemCorte = "Início do Sistema";

    // 1. VERIFICAR EXONERAÇÃO (Prioridade 1)
    // Se ele foi exonerado, ignoramos tudo antes dessa data (tempo de polícia)
    if (EXONERACAO_CHANNEL_ID) {
      const mensagensExoneracao = await buscarMensagensDiscord(
        EXONERACAO_CHANNEL_ID,
        idCidadao,
        Discord_Bot_Token,
        DATA_INICIO_SISTEMA,
        50,
        true // Busca ampla na exoneração
      );

      if (mensagensExoneracao.length > 0) {
        // Pega a exoneração mais recente
        const dataExoneracao = new Date(mensagensExoneracao[0].timestamp);
        if (dataExoneracao > dataCorteFinal) {
          dataCorteFinal = dataExoneracao;
          origemCorte = "Exoneração";
        }
      }
    }

    // 2. BUSCAR ÚLTIMA LIMPEZA (Prioridade 2 - Sobrescreve Exoneração se for mais recente)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal, // Só busca limpezas após a data de corte atual
      100,
      true // Busca ampla na limpeza
    );

    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      const dataRecenteLimpeza = new Date(mensagensLimpeza[0].timestamp);
      if (dataRecenteLimpeza > dataCorteFinal) {
        dataCorteFinal = dataRecenteLimpeza;
        origemCorte = "Limpeza de Ficha";
      }
    }

    // 3. BUSCAR PRISÕES E FIANÇAS (Usando a DATA DE CORTE DEFINITIVA)
    // Se foi exonerado dia 20, só pega crimes do dia 21 em diante.
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false // Busca estrita nos campos
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false // Busca estrita nos campos
    );
    const todosRegistros = [...prisoes, ...fiancas];

    // 4. CÁLCULOS FINANCEIROS E PENAIS
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
        const valorCampo = normalizarTexto(f.value);

        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          const matchMulta = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (matchMulta && matchMulta[1]) {
            somaMultas += parseInt(matchMulta[1].replace(/\./g, "")) || 0;
          }
        }

        if (nomeCampo.includes("CRIMES")) {
          const linhas = valorCampo.split("\n");
          linhas.forEach((linha) => {
            const ehInafiancavel = listaKeywordsInafiancaveis.some((keyword) =>
              linha.includes(keyword)
            );
            if (ehInafiancavel && linha.replace(/[*`\s]/g, "").length > 3) {
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
      totalLimpezasAnteriores,
      ultimaLimpeza:
        totalLimpezasAnteriores > 0 || origemCorte !== "Início do Sistema"
          ? `${dataCorteFinal.toLocaleString("pt-BR")} (${origemCorte})`
          : "Nunca Limpou (Desde Início)",
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    console.error(error);
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

  // Regex para garantir ID exato (não pegar 123 em 12345)
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

      // Se a mensagem for anterior à data de corte (Exoneração ou Limpeza), PARA DE BUSCAR.
      // Isso é o que impede de pegar as prisões antigas do ex-policial.
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertenceAoCidadao = (msg.embeds || []).some((embed) => {
        // 1. Busca Ampla (Para Exoneração e Limpeza)
        // Aqui aceitamos qualquer menção ao ID no embed
        if (buscaAmpla) {
          return JSON.stringify(embed).toLowerCase().includes(idCidadao);
        }

        // 2. Busca Estrita (Para Prisões e Fianças)
        // Mantemos a segurança de campo para evitar falsos positivos
        // caso o ex-policial seja mencionado como advogado/testemunha HOJE.
        const fields = embed.fields || [];

        // Se tiver fields, verifica se está no campo permitido
        if (fields.length > 0) {
          return fields.some((field) => {
            const nome = normalizarTexto(field.name);
            const valor = field.value || "";

            // Lista Branca: Campos onde o ID do CRIMINOSO aparece
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

            if (whitelist.some((w) => nome.includes(w))) {
              return regexIdEstrita.test(valor);
            }
            return false;
          });
        }

        // Fallback para descrição se não houver fields
        if (embed.description && fields.length === 0) {
          const desc = embed.description;
          // Tenta achar marcador de preso
          if (/PRESO|DETENTO|REU/i.test(desc)) {
            // Aqui usamos regex estrita na descrição inteira se parecer ser um relatório antigo
            return regexIdEstrita.test(desc);
          }
        }

        return false;
      });

      if (pertenceAoCidadao) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

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
  } = process.env;

  if (!idCidadao) return res.status(400).json({ error: "ID não fornecido" });

  try {
    // === CONFIGURAÇÃO DE DATA INICIAL (10/12/2025) ===
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    // 1. BUSCAR ÚLTIMA LIMPEZA
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA,
      100,
      true // Busca ampla na limpeza é aceitável, pois geralmente só tem o nome do limpo
    );

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      const dataRecenteLimpeza = new Date(mensagensLimpeza[0].timestamp);
      if (dataRecenteLimpeza > dataCorteFinal) {
        dataCorteFinal = dataRecenteLimpeza;
      }
    }

    // 2. BUSCAR PRISÕES E FIANÇAS
    // Aqui usamos o false para busca estrita (apenas campo PRESO)
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

    // 3. CÁLCULO DE MULTAS E INAFIANÇÁVEIS
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

        // Soma Multas
        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          const matchMulta = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (matchMulta && matchMulta[1]) {
            const valorLimpo = parseInt(matchMulta[1].replace(/\./g, "")) || 0;
            somaMultas += valorLimpo;
          }
        }

        // Conta Crimes Inafiançáveis
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
        totalLimpezasAnteriores > 0
          ? dataCorteFinal.toLocaleString("pt-BR")
          : "Nunca Limpou (Busca desde 10/12)",
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    console.error("Erro API:", error);
    res.status(500).json({ error: error.message });
  }
};

// Função auxiliar para limpar acentos e caixa alta
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

  // Helper para verificar se um texto contém o ID exato
  // Evita que ID "12" dê match em "12345"
  const contemIdExato = (texto, id) => {
    // Procura o ID cercado por qualquer coisa que não seja número
    // ou se o texto for exatamente o número
    const regex = new RegExp(`(?:^|[^0-9])${id}(?:$|[^0-9])`);
    return regex.test(texto);
  };

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!res.ok) {
      console.error(`Erro Discord ${res.status}: ${res.statusText}`);
      break;
    }

    const mensagens = await res.json();

    if (!mensagens || !Array.isArray(mensagens) || mensagens.length === 0)
      break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;

      // Se a mensagem for anterior à data de corte, para tudo
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertenceAoCidadao = (msg.embeds || []).some((embed) => {
        // --- CASO 1: BUSCA AMPLA (Para limpezas) ---
        // Na limpeza, geralmente não tem structure de fields complexa, apenas descrição
        if (buscaAmpla) {
          const tudo = JSON.stringify(embed).toLowerCase();
          return tudo.includes(idCidadao.toLowerCase());
        }

        // --- CASO 2: BUSCA ESTRITA (Para Prisões/Fianças) ---
        // Aqui está a correção para ignorar o policial
        const fields = embed.fields || [];

        // Verifica cada campo do embed individualmente
        const encontrouNoCampoPreso = fields.some((field) => {
          const nomeCampo = normalizarTexto(field.name); // ex: "PRESO", "DETENTO"

          // Lista de títulos de campos que indicam o CRIMINOSO
          const titulosAlvo = [
            "PRESO",
            "DETENTO",
            "CIDADAO",
            "INDICIADO",
            "REU",
          ];

          // Se o título do campo for um desses...
          if (titulosAlvo.some((t) => nomeCampo.includes(t))) {
            // ...verificamos se o ID está no VALOR deste campo
            const valorCampo = field.value || "";
            // Usamos includes simples ou regex. Como o formato é "RG: 22825", includes é seguro
            // desde que o campo seja específico do preso.
            return valorCampo.includes(idCidadao);
          }
          return false;
        });

        // Backup: Se não achou nos fields, mas tem description (layouts antigos)
        // Só aceita se NÃO tiver fields de "Oficial" para evitar falso positivo
        if (
          !encontrouNoCampoPreso &&
          embed.description &&
          fields.length === 0
        ) {
          return embed.description.includes(idCidadao);
        }

        return encontrouNoCampoPreso;
      });

      if (pertenceAoCidadao) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

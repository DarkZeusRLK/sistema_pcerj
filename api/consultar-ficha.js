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
    // (Na limpeza a busca é ampla pois geralmente é apenas uma mensagem simples)
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

    // 2. BUSCAR PRISÕES E FIANÇAS
    // ATENÇÃO: buscaAmpla = false para garantir que só olhe o campo PRESO
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
            // Verifica tamanho mínimo para evitar falsos positivos com palavras curtas
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

// Função auxiliar para padronizar texto (caixa alta e sem acentos)
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

  // Regex estrita: Garante que o ID é um número isolado
  // Evita que ID "2337" dê match dentro de "12337" ou "RG 23370"
  const safeId = idCidadao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexIdEstrita = new RegExp(`(?:^|[^0-9])${safeId}(?:$|[^0-9])`);

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

      // Respeita a data de corte (última limpeza)
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertenceAoCidadao = (msg.embeds || []).some((embed) => {
        // --- MODO 1: LIMPEZA (Busca Ampla) ---
        // Na limpeza, aceitamos achar o ID em qualquer lugar do embed/descrição
        if (buscaAmpla) {
          const tudo = JSON.stringify(embed).toLowerCase();
          return tudo.includes(idCidadao.toLowerCase());
        }

        // --- MODO 2: AUDITORIA CRIMINAL (Busca Estrita) ---
        const fields = embed.fields || [];

        // Passo A: Identificar o campo "PRESO"
        const campoPreso = fields.find((field) => {
          const nomeCampo = normalizarTexto(field.name);
          // Lista de títulos aceitos para o campo do criminoso
          const titulosAlvo = [
            "PRESO",
            "DETENTO",
            "CIDADAO",
            "INDICIADO",
            "REU",
          ];
          return titulosAlvo.some((t) => nomeCampo.includes(t));
        });

        // Passo B: Se achou o campo PRESO, verifica se o ID está DENTRO DELE
        if (campoPreso) {
          const valorCampo = campoPreso.value || "";
          // Usa regex para garantir que não é parte de outro número
          return regexIdEstrita.test(valorCampo);
        }

        // Passo C: Fallback para embeds antigos sem Fields (apenas Description)
        // MAS CUIDADO: Só aceita se NÃO tiver fields de "Oficial/Participantes"
        // Se tiver fields e não achou "Preso", ignoramos para não pegar o ID do oficial
        if (embed.description && fields.length === 0) {
          return regexIdEstrita.test(embed.description);
        }

        // Se tem fields (ex: Oficial, Participantes) mas não achou o campo PRESO,
        // ou achou o campo PRESO mas o ID não estava lá => RETORNA FALSO.
        // Isso garante que se o ID estiver em "Participantes", retorna false.
        return false;
      });

      if (pertenceAoCidadao) filtradas.push(msg);
    }
    // Proteção de loop infinito
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

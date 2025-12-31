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
    EXONERACAO_CHANNEL_ID,
  } = process.env;

  if (!idCidadao) return res.status(400).json({ error: "ID não fornecido" });

  try {
    // === DATA ZERO (INÍCIO DO SISTEMA) ===
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let origemCorte = "Início do Sistema";

    // =================================================================================
    // 1. VERIFICAR EXONERAÇÃO (MODO UNIVERSAL: BOT OU USUÁRIO)
    // =================================================================================
    if (EXONERACAO_CHANNEL_ID) {
      // Busca as últimas 100 mensagens (aumentado para garantir)
      const msgsExoneracao = await buscarMensagensDiscord(
        EXONERACAO_CHANNEL_ID,
        Discord_Bot_Token,
        100
      );

      for (const msg of msgsExoneracao) {
        // 1. Extrai TODO o texto da mensagem (Seja embed, seja texto normal, seja bot ou user)
        let textoBruto = extrairTextoCompleto(msg);

        // 2. Limpa formatação do Discord (**negr**, __subl__, `cod`)
        let textoLimpo = textoBruto.replace(/[\*_`]/g, "");

        // 3. Procura pelo ID e pela Data no mesmo bloco de texto
        // Regex: Procura "ID" seguido de não-números, depois o ID do cidadão
        const regexID = new RegExp(`ID\\D*${idCidadao}(?:\\D|$)`, "i");

        if (regexID.test(textoLimpo)) {
          // Regex: Procura padrão de data DD/MM/AAAA
          const matchData = textoLimpo.match(/(\d{2}\/\d{2}\/\d{4})/);

          if (matchData) {
            const dataLida = converterDataBrasileira(matchData[1]);
            // Se achou uma data válida e ela é mais recente que a atual
            if (dataLida && dataLida > dataCorteFinal) {
              dataCorteFinal = dataLida;
              origemCorte = `Exonerado em ${matchData[1]}`;
            }
          }
        }
      }
    }

    // =================================================================================
    // 2. VERIFICAR LIMPEZA DE FICHA
    // =================================================================================
    const msgsLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      Discord_Bot_Token,
      100
    );

    // Filtra localmente para achar a limpeza deste cidadão
    const msgLimpezaRecente = msgsLimpeza.find((msg) => {
      const txt = extrairTextoCompleto(msg).toLowerCase();
      return txt.includes(idCidadao);
    });

    if (msgLimpezaRecente) {
      const dataLimpeza = new Date(msgLimpezaRecente.timestamp);
      if (dataLimpeza > dataCorteFinal) {
        dataCorteFinal = dataLimpeza;
        origemCorte = "Limpeza de Ficha";
      }
    }

    // =================================================================================
    // 3. BUSCAR PRISÕES E FIANÇAS (APÓS A DATA DE CORTE)
    // =================================================================================
    // Aqui usamos a função específica que filtra campos para evitar falsos positivos
    const prisoes = await buscarCrimesDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000
    );

    const fiancas = await buscarCrimesDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000
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
      "TENTATIVA DE HOMICIDIO",
    ];

    todosRegistros.forEach((msg) => {
      // Extrai texto para procurar valores e crimes, priorizando Embeds
      const embed = msg.embeds && msg.embeds[0];

      // Lógica de extração de valores (Prioriza campos, mas aceita texto se não tiver campos)
      if (embed && embed.fields) {
        embed.fields.forEach((f) => {
          const nome = normalizarTexto(f.name);
          const valor = f.value;

          // Soma Multa
          if (
            nome.includes("MULTA") ||
            nome.includes("SENTENCA") ||
            nome.includes("VALOR")
          ) {
            const numeros = valor.replace(/\D/g, ""); // Pega só digitos
            if (numeros) somaMultas += parseInt(numeros) || 0;
          }

          // Conta Inafiançáveis
          if (nome.includes("CRIME") || nome.includes("MOTIVO")) {
            const linhas = normalizarTexto(valor).split("\n");
            linhas.forEach((l) => {
              if (
                listaKeywordsInafiancaveis.some((k) => l.includes(k)) &&
                l.length > 4
              ) {
                totalInafiancaveis++;
              }
            });
          }
        });
      }
    });

    const taxaBase = 1000000;
    const custoInafiancaveis = totalInafiancaveis * 400000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral,
      origemCorte,
      dataCorte: dataCorteFinal.toLocaleString("pt-BR"),
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    console.error("Erro API:", error);
    res.status(500).json({ error: error.message });
  }
};

// =================================================================================
// HELPERS E FUNÇÕES AUXILIARES
// =================================================================================

// 1. Função Universal para pegar texto de QUALQUER tipo de mensagem
function extrairTextoCompleto(msg) {
  let texto = (msg.content || "") + " ";
  if (msg.embeds && msg.embeds.length > 0) {
    msg.embeds.forEach((emb) => {
      texto += (emb.title || "") + " ";
      texto += (emb.description || "") + " ";
      if (emb.fields) {
        emb.fields.forEach((f) => (texto += f.name + " " + f.value + " "));
      }
      if (emb.footer) texto += emb.footer.text + " ";
    });
  }
  return texto;
}

function converterDataBrasileira(dataStr) {
  if (!dataStr) return null;
  const partes = dataStr.split("/");
  if (partes.length !== 3) return null;
  // Define data para 23:59:59 do dia mencionado
  return new Date(partes[2], partes[1] - 1, partes[0], 23, 59, 59);
}

function normalizarTexto(texto) {
  if (!texto) return "";
  return texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// 2. Função Simples para BUSCAR TUDO (Usada na Exoneração/Limpeza)
async function buscarMensagensDiscord(channelId, token, limite) {
  let filtradas = [];
  let ultimoId = null;
  let processadas = 0;
  if (!channelId) return [];

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bot ${token}` },
      });
      if (!res.ok) break;
      const mensagens = await res.json();
      if (!mensagens || !Array.isArray(mensagens) || mensagens.length === 0)
        break;

      filtradas.push(...mensagens);
      processadas += mensagens.length;
      ultimoId = mensagens[mensagens.length - 1].id;
    } catch (e) {
      break;
    }
  }
  return filtradas;
}

// 3. Função Específica para CRIMES (Com lógica de proteção ID de Policial)
async function buscarCrimesDiscord(
  channelId,
  idCidadao,
  token,
  dataCorte,
  limite
) {
  let crimesEncontrados = [];
  let ultimoId = null;
  let processadas = 0;
  if (!channelId) return [];

  // Regex Estrita do ID
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

      // FILTRO DE DATA
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) continue;

      // LÓGICA DE DETECÇÃO DO CRIMINOSO
      let ehCriminoso = false;

      // A) Se for Embed (Formato Padrão)
      if (msg.embeds && msg.embeds.length > 0) {
        const embed = msg.embeds[0];
        const fields = embed.fields || [];

        if (fields.length > 0) {
          // Verifica Campos (Whitelist / Blacklist)
          ehCriminoso = fields.some((field) => {
            const nome = normalizarTexto(field.name);
            const valor = field.value || "";

            // 🚫 BLACKLIST (Policial, Advogado, etc) - IGNORA
            const blacklist = [
              "PARTICIPANTE",
              "OFICIAL",
              "ADVOGADO",
              "POLICIAL",
              "QRA",
              "TESTEMUNHA",
              "RESPONSAVEL",
            ];
            if (blacklist.some((bad) => nome.includes(bad))) return false;

            // ✅ WHITELIST (Preso, Réu) - ACEITA
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
        } else if (embed.description) {
          // Se não tem fields, tenta descrição cortada (Fallback)
          const desc = embed.description;
          const matchInicio = desc.match(/(?:\n|^).*(?:PRESO|DETENTO|REU).*/i);
          if (matchInicio) {
            const textoFiltrado = desc.substring(matchInicio.index);
            ehCriminoso = regexIdEstrita.test(textoFiltrado);
          }
        }
      }

      // B) Se for Texto Puro (Usuário mandou relatório manual)
      // CUIDADO: Só aceita se tiver palavra chave "Preso" ou "Detento" na mensagem
      else if (msg.content) {
        const contentNorm = normalizarTexto(msg.content);
        // Se tiver "PRESO" e o ID, assumimos que é válido, a menos que tenha "OFICIAL" perto
        // Simplificação: Se o usuário digitou e não é embed, verificamos se tem o ID
        // MAS para segurança, exigimos a palavra chave.
        if (
          contentNorm.includes("PRESO") ||
          contentNorm.includes("DETENTO") ||
          contentNorm.includes("REU")
        ) {
          ehCriminoso = regexIdEstrita.test(msg.content);
        }
      }

      if (ehCriminoso) {
        crimesEncontrados.push(msg);
      }
    }
    if (mensagens.length < 100) break;
  }
  return crimesEncontrados;
}

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
    EXONERACAO_CHANNEL_ID,
    CHANNEL_BANCO_DADOS_ID,
    BANCO_DADOS_CHANNEL_ID,
  } = process.env;
  const canalBancoDadosId =
    CHANNEL_BANCO_DADOS_ID || BANCO_DADOS_CHANNEL_ID || "";

  if (!idCidadao) return res.status(400).json({ error: "ID não fornecido" });

  try {
    // === DATA ZERO ===
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");
    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let origemCorte = "Início do Sistema";

    // =================================================================================
    // 1. VERIFICAR EXONERAÇÃO
    // =================================================================================
    if (EXONERACAO_CHANNEL_ID) {
      const msgsExoneracao = await buscarMensagensDiscord(
        EXONERACAO_CHANNEL_ID,
        Discord_Bot_Token,
        100
      );
      for (const msg of msgsExoneracao) {
        let textoBruto = extrairTextoCompleto(msg);
        let textoLimpo = textoBruto.replace(/[\*_`]/g, "");

        const idsMensagem = extrairIdentificadoresDoTexto(textoLimpo).map((id) =>
          String(id).replace(/\D/g, "")
        );
        if (idsMensagem.includes(String(idCidadao).replace(/\D/g, ""))) {
          const matchData = textoLimpo.match(/(\d{2}\/\d{2}\/\d{4})/);
          if (matchData) {
            const dataLida = converterDataBrasileira(matchData[1]);
            if (dataLida && dataLida > dataCorteFinal) {
              dataCorteFinal = dataLida;
              origemCorte = `Exonerado em ${matchData[1]}`;
            }
          }
        }
      }
    }

    // =================================================================================
    // 2. VERIFICAR LIMPEZA (CORRIGIDO: CONTAGEM DE LIMPEZAS)
    // =================================================================================
    const msgsLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      Discord_Bot_Token,
      100
    );

    // Filtra TODAS as mensagens de limpeza desse cidadão para contar
    const limpezasEncontradas = msgsLimpeza.filter((msg) => {
      const idsMensagem = extrairIdentificadoresDaMensagem(msg).map((id) =>
        String(id).replace(/\D/g, "")
      );
      return idsMensagem.includes(String(idCidadao).replace(/\D/g, ""));
    });

    // Define a variável que estava faltando
    const totalLimpezasAnteriores = limpezasEncontradas.length;

    // Pega a mais recente para definir a data de corte (se houver)
    if (limpezasEncontradas.length > 0) {
      // A API do Discord geralmente retorna da mais recente para a mais antiga.
      // Pegamos a primeira da lista filtrada.
      const msgLimpezaRecente = limpezasEncontradas[0];

      const dataLimpeza = new Date(msgLimpezaRecente.timestamp);
      if (dataLimpeza > dataCorteFinal) {
        dataCorteFinal = dataLimpeza;
        origemCorte = "Limpeza de Ficha";
      }
    }

    // =================================================================================
    // 3. BUSCAR REGISTROS
    // =================================================================================
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
    const registrosBancoDados = await buscarRegistrosBancoDadosDiscord(
      canalBancoDadosId,
      idCidadao,
      Discord_Bot_Token,
      null,
      2000
    );
    const todosRegistros = [...prisoes, ...fiancas];
    const totalRegistrosEncontrados =
      todosRegistros.length + registrosBancoDados.length;

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
      const embed = msg.embeds && msg.embeds[0];

      if (embed && embed.fields) {
        embed.fields.forEach((f) => {
          const nome = normalizarTexto(f.name);
          const valor = f.value;

          // --- LEITURA DE MULTA ---
          if (
            nome.includes("SENTENCA") ||
            nome.includes("MULTA") ||
            nome.includes("VALOR")
          ) {
            const matchMultaExplicita = valor.match(/Multa[:\s\D]*([\d.]+)/i);

            if (matchMultaExplicita) {
              const valorLimpo = matchMultaExplicita[1].replace(/\./g, "");
              somaMultas += parseInt(valorLimpo) || 0;
            } else if (
              (nome.includes("MULTA") || nome.includes("VALOR")) &&
              !nome.includes("SENTENCA")
            ) {
              const apenasNumeros = valor.replace(/\D/g, "");
              somaMultas += parseInt(apenasNumeros) || 0;
            }
          }

          // --- CONTAGEM DE INAFIANÇÁVEIS ---
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

    // CÁLCULO DA TAXA (Se quiser fixo em 1 milhão, mude a linha abaixo)
    // Lógica progressiva: 1M + (400k por limpeza anterior)
    const taxaBase = 1600000 + totalLimpezasAnteriores * 500000;

    const custoInafiancaveis = totalInafiancaveis * 500000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral,
      origemCorte,
      totalLimpezasAnteriores, // <--- ADICIONADO AQUI PARA O FRONT NÃO DAR UNDEFINED
      dataCorte: dataCorteFinal.toLocaleString("pt-BR"),
      registrosCriminaisEncontrados: todosRegistros.length,
      registrosBancoDadosEncontrados: registrosBancoDados.length,
      registrosEncontrados: totalRegistrosEncontrados,
      precisaRevogar: totalRegistrosEncontrados > 0,
    });
  } catch (error) {
    console.error("Erro API:", error);
    res.status(500).json({ error: error.message });
  }
};

// =================================================================================
// HELPERS (MANTIDOS IGUAIS)
// =================================================================================

function coletarTextoDosComponents(components, bucket = []) {
  if (!Array.isArray(components)) return bucket;

  components.forEach((component) => {
    if (!component || typeof component !== "object") return;

    const textosDiretos = [
      component.content,
      component.text,
      component.label,
      component.title,
      component.description,
      component.placeholder,
      component.filename,
      component.name,
    ];

    textosDiretos.forEach((value) => {
      if (typeof value === "string" && value.trim()) bucket.push(value);
    });

    if (component.footer?.text) bucket.push(component.footer.text);
    if (component.media?.url) bucket.push(component.media.url);
    if (component.file?.url) bucket.push(component.file.url);

    if (Array.isArray(component.fields)) {
      component.fields.forEach((field) => {
        if (field?.name) bucket.push(field.name);
        if (field?.value) bucket.push(field.value);
      });
    }

    if (Array.isArray(component.items)) {
      component.items.forEach((item) => {
        if (item?.description) bucket.push(item.description);
      });
    }

    if (Array.isArray(component.components)) {
      coletarTextoDosComponents(component.components, bucket);
    }

    if (component.accessory) {
      coletarTextoDosComponents([component.accessory], bucket);
    }
  });

  return bucket;
}

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

  if (msg.components && msg.components.length > 0) {
    texto += coletarTextoDosComponents(msg.components).join(" ") + " ";
  }

  return texto;
}

function converterDataBrasileira(dataStr) {
  if (!dataStr) return null;
  const partes = dataStr.split("/");
  if (partes.length !== 3) return null;
  return new Date(partes[2], partes[1] - 1, partes[0], 23, 59, 59);
}

function normalizarTexto(texto) {
  if (!texto) return "";
  return texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

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

function extrairIdentificadoresDoTexto(texto) {
  const textoLimpo = String(texto || "")
    .replace(/[\*_`]/g, "")
    .replace(/\r/g, "\n");

  const encontrados = new Set();
  const padroes = [
    /PASSAPORTE\s*[:#-]?\s*(\d{1,12})/gi,
    /PASSAPORTE\s*[:#-]?\s*\n+\s*(\d{1,12})/gi,
    /RG\s*[:#-]?\s*(\d{1,12})/gi,
    /RG\s*[:#-]?\s*\n+\s*(\d{1,12})/gi,
    /(?:^|\W)ID\s*[:#-]?\s*(\d{1,12})(?:\W|$)/gi,
    /CIDADAO\s*\(ID\)\s*[:#-]?\s*(\d{1,12})/gi,
  ];

  for (const regex of padroes) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(textoLimpo)) !== null) {
      if (match[1]) encontrados.add(match[1]);
    }
  }

  return [...encontrados];
}

function extrairIdentificadoresDaMensagem(msg) {
  const identificadores = new Set();

  if (msg.embeds && msg.embeds.length > 0) {
    msg.embeds.forEach((embed) => {
      const fields = embed.fields || [];
      fields.forEach((field) => {
        const nome = normalizarTexto(field.name || "");
        const valor = String(field.value || "");
        if (
          !nome.includes("PASSAPORTE") &&
          !nome.includes("RG") &&
          nome !== "ID" &&
          !nome.endsWith(" ID")
        ) {
          return;
        }

        const valorNumerico = valor.replace(/\D/g, "");
        if (valorNumerico) identificadores.add(valorNumerico);

        extrairIdentificadoresDoTexto(valor).forEach((id) =>
          identificadores.add(id)
        );
      });
    });
  }

  const textoCompleto = extrairTextoCompleto(msg);
  extrairIdentificadoresDoTexto(textoCompleto).forEach((id) =>
    identificadores.add(id)
  );

  return [...identificadores];
}

async function buscarRegistrosBancoDadosDiscord(
  channelId,
  idCidadao,
  token,
  dataCorte,
  limite
) {
  if (!channelId) return [];

  const registros = [];
  const idNormalizado = String(idCidadao || "").replace(/\D/g, "");
  let ultimoId = null;
  let processadas = 0;

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) break;

    const mensagens = await res.json();
    if (!Array.isArray(mensagens) || mensagens.length === 0) break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) continue;

      const passaportes = extrairIdentificadoresDaMensagem(msg).map((id) =>
        String(id).replace(/\D/g, ""),
      );
      if (passaportes.includes(idNormalizado)) registros.push(msg);
    }

    if (mensagens.length < 100) break;
  }

  return registros;
}

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

  const safeId = idCidadao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexIdEstrita = new RegExp(`(?:^|[^0-9])${safeId}(?:$|[^0-9])`);
  const idNormalizado = String(idCidadao || "").replace(/\D/g, "");

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
      if (dataCorte && new Date(msg.timestamp) <= dataCorte) continue;

      let ehCriminoso = false;
      const identificadores = extrairIdentificadoresDaMensagem(msg).map((id) =>
        String(id).replace(/\D/g, "")
      );

      if (identificadores.includes(idNormalizado)) {
        crimesEncontrados.push(msg);
        continue;
      }

      if (msg.embeds && msg.embeds.length > 0) {
        const embed = msg.embeds[0];
        const fields = embed.fields || [];
        if (fields.length > 0) {
          ehCriminoso = fields.some((field) => {
            const nome = normalizarTexto(field.name);
            const valor = field.value || "";
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
            if (whitelist.some((good) => nome.includes(good)))
              return regexIdEstrita.test(valor);
            return false;
          });
        } else if (embed.description) {
          const desc = embed.description;
          const matchInicio = desc.match(/(?:\n|^).*(?:PRESO|DETENTO|REU).*/i);
          if (matchInicio) {
            const textoFiltrado = desc.substring(matchInicio.index);
            ehCriminoso = regexIdEstrita.test(textoFiltrado);
          }
        }
      } else if (msg.content) {
        const contentNorm = normalizarTexto(msg.content);
        if (
          contentNorm.includes("PRESO") ||
          contentNorm.includes("DETENTO") ||
          contentNorm.includes("REU")
        ) {
          ehCriminoso = regexIdEstrita.test(msg.content);
        }
      }

      if (ehCriminoso) crimesEncontrados.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return crimesEncontrados;
}

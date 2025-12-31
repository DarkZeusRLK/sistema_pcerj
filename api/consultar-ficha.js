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

  console.log(
    `\n============== 🕵️ INICIANDO INVESTIGAÇÃO ID: ${idCidadao} ==============`
  );

  try {
    const DATA_INICIO_SISTEMA = new Date("2025-12-10T00:00:00");

    // 1. BUSCAR LIMPEZA
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      DATA_INICIO_SISTEMA,
      100,
      true, // Busca ampla
      "LIMPEZA"
    );

    let dataCorteFinal = DATA_INICIO_SISTEMA;
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      const dataRecenteLimpeza = new Date(mensagensLimpeza[0].timestamp);
      if (dataRecenteLimpeza > dataCorteFinal) {
        dataCorteFinal = dataRecenteLimpeza;
      }
    }
    console.log(
      `📅 Data de Corte (Última Limpeza/Inicio): ${dataCorteFinal.toLocaleString()}`
    );

    // 2. BUSCAR PRISÕES E FIANÇAS
    console.log(`🔎 Varrendo Canal de Prisões...`);
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false, // Busca ESTRITA
      "PRISOES"
    );

    console.log(`🔎 Varrendo Canal de Fianças...`);
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataCorteFinal,
      2000,
      false, // Busca ESTRITA
      "FIANCAS"
    );

    const todosRegistros = [...prisoes, ...fiancas];
    console.log(`🚨 Total de registros encontrados: ${todosRegistros.length}`);

    // 3. CÁLCULO DE PENAS
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
      "APOLOGIA",
    ];

    todosRegistros.forEach((msg) => {
      if (!msg.embeds || msg.embeds.length === 0) return;
      const embed = msg.embeds[0];

      // LOG PARA IDENTIFICAR O CULPADO
      console.log(`\n--- 📄 ANALISANDO MENSAGEM CULPADA (ID: ${msg.id}) ---`);

      embed.fields?.forEach((f) => {
        const nomeCampo = normalizarTexto(f.name);

        // DEBUG: Mostra valores monetários encontrados
        if (nomeCampo.includes("SENTENCA") || nomeCampo.includes("MULTA")) {
          const matchMulta = f.value.match(/Multa[:\* \s]+R?\$?\s*([\d.]+)/i);
          if (matchMulta && matchMulta[1]) {
            const valor = parseInt(matchMulta[1].replace(/\./g, "")) || 0;
            somaMultas += valor;
            console.log(
              `   💰 Multa encontrada: R$ ${valor} (Campo: ${f.name})`
            );
          }
        }

        // DEBUG: Mostra crimes encontrados
        if (nomeCampo.includes("CRIMES")) {
          const linhas = f.value.split("\n");
          linhas.forEach((linha) => {
            const ehInafiancavel = listaKeywordsInafiancaveis.some((keyword) =>
              normalizarTexto(linha).includes(keyword)
            );
            if (ehInafiancavel && linha.replace(/[*`\s]/g, "").length > 3) {
              totalInafiancaveis++;
              console.log(`   ⚖️ Crime Grave Contado: "${linha}"`);
            }
          });
        }
      });
    });

    const taxaBase = 1000000 + totalLimpezasAnteriores * 400000;
    const custoInafiancaveis = totalInafiancaveis * 400000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    console.log(`============== FIM DO DIAGNÓSTICO ==============\n`);

    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral,
      totalLimpezasAnteriores,
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
  buscaAmpla = false,
  tipoCanal = ""
) {
  let filtradas = [];
  let ultimoId = null;
  let processadas = 0;

  if (!channelId) return [];

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
        // MODO LIMPEZA (AMPLO)
        if (buscaAmpla) {
          return JSON.stringify(embed)
            .toLowerCase()
            .includes(idCidadao.toLowerCase());
        }

        // MODO FICHA CRIMINAL (ESTRITO)
        const fields = embed.fields || [];

        // ESTRATÉGIA: LISTA BRANCA (WHITELIST)
        // Só aceita se o ID estiver explicitamente dentro de um campo chamado "PRESO", "DETENTO", etc.
        const camposPermitidos = [
          "PRESO",
          "DETENTO",
          "INDICIADO",
          "REU",
          "ACUSADO",
          "CIDADAO",
        ];

        // Verifica todos os campos
        for (const field of fields) {
          const nomeCampoNorm = normalizarTexto(field.name);

          // 1. Verifica se é um campo permitido
          const ehCampoAlvo = camposPermitidos.some((p) =>
            nomeCampoNorm.includes(p)
          );

          if (ehCampoAlvo) {
            // 2. Verifica se o ID está no valor deste campo
            const match = regexIdEstrita.test(field.value || "");
            if (match) {
              console.log(
                `[MATCH] ✅ ID ${idCidadao} encontrado no canal ${tipoCanal}.`
              );
              console.log(
                `        Campo Válido: "${
                  field.name
                }" | Conteúdo: "${field.value.substring(0, 30)}..."`
              );
              console.log(
                `        Link msg: https://discord.com/channels/@me/${channelId}/${msg.id}`
              );
              return true;
            }
          } else {
            // LOG DE DEBUG PARA VER O QUE ESTÁ SENDO IGNORADO
            const matchIgnorado = regexIdEstrita.test(field.value || "");
            if (matchIgnorado) {
              console.log(
                `[IGNORADO] ❌ ID encontrado mas em campo proibido/não listado.`
              );
              console.log(
                `           Campo: "${
                  field.name
                }" | Conteúdo: "${field.value.substring(0, 30)}..."`
              );
            }
          }
        }
        return false;
      });

      if (pertence) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

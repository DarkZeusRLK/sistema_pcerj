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
    // 1. BUSCAR ÚLTIMA LIMPEZA (Busca ampla para achar o ID em qualquer lugar do log de limpeza)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      1000,
      true
    );

    let dataUltimaLimpeza = new Date(0);
    let totalLimpezasAnteriores = mensagensLimpeza.length;
    if (totalLimpezasAnteriores > 0) {
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCAR PRISÕES E FIANÇAS (Foco total no campo RG)
    const [prisoes, fiancas] = await Promise.all([
      buscarMensagensDiscord(
        CHANNEL_PRISOES_ID,
        idCidadao,
        Discord_Bot_Token,
        dataUltimaLimpeza,
        5000,
        false
      ),
      buscarMensagensDiscord(
        CHANNEL_FIANCAS_ID,
        idCidadao,
        Discord_Bot_Token,
        dataUltimaLimpeza,
        5000,
        false
      ),
    ]);

    const todosRegistros = [...prisoes, ...fiancas];
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
      if (!msg.embeds?.[0]) return;
      const embed = msg.embeds[0];

      embed.fields?.forEach((f) => {
        const nomeCampo = f.name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const valorCampo = f.value
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // EXTRAÇÃO DE MULTA: Procura apenas números em campos de valores financeiros
        if (
          nomeCampo.includes("SENTENCA") ||
          nomeCampo.includes("MULTA") ||
          nomeCampo.includes("VALOR") ||
          nomeCampo.includes("FIANCA")
        ) {
          // Pega o valor numérico após R$ ou cifrão, ou o primeiro número grande que achar
          const match = f.value.replace(/\./g, "").match(/(\d+)/);
          if (match) {
            const valorExtraido = parseInt(match[1]);
            // Segurança: Se o valor for IGUAL ao ID do cidadão, ignoramos (evita somar o RG como multa)
            if (valorExtraido !== parseInt(idCidadao)) {
              somaMultas += valorExtraido;
            }
          }
        }

        // CONTAGEM DE CRIMES: 1 por linha para evitar contagem errada
        if (nomeCampo.includes("CRIMES")) {
          const linhas = valorCampo.split("\n");
          linhas.forEach((linha) => {
            const ehInafiancavel = listaKeywordsInafiancaveis.some((k) =>
              linha.includes(k)
            );
            if (ehInafiancavel && linha.trim().length > 4) {
              totalInafiancaveis++;
            }
          });
        }
      });
    });

    // CÁLCULOS FINAIS
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
          ? dataUltimaLimpeza.toLocaleString("pt-BR")
          : "Nunca Limpou",
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

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

  while (processadas < limite) {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100${
      ultimoId ? `&before=${ultimoId}` : ""
    }`;
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!response.ok) break;
    const mensagens = await response.json();
    if (!mensagens || mensagens.length === 0) break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;

      if (dataCorte && new Date(msg.timestamp) <= dataCorte) return filtradas;

      const pertence = (msg.embeds || []).some((embed) => {
        // Se for canal de LIMPEZA, busca em tudo. Se for PRISÃO, foca no campo RG
        if (buscaAmpla) {
          return JSON.stringify(embed).includes(idCidadao);
        }

        return (embed.fields || []).some((f) => {
          const nome = f.name
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          const valor = f.value.trim();
          // VERIFICAÇÃO ESTRITA: O nome do campo deve ser exatamente "RG"
          return nome === "RG" && valor === idCidadao;
        });
      });

      if (pertence) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

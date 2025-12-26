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

  try {
    // 1. BUSCA ÚLTIMA LIMPEZA (ID no RG)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      1000
    );

    let dataUltimaLimpeza = new Date(0);
    let totalLimpezasAnteriores = mensagensLimpeza.length;
    if (totalLimpezasAnteriores > 0) {
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCA PRISÕES E FIANÇAS (Foco Total no Campo RG)
    const [prisoes, fiancas] = await Promise.all([
      buscarMensagensDiscord(
        CHANNEL_PRISOES_ID,
        idCidadao,
        Discord_Bot_Token,
        dataUltimaLimpeza,
        5000
      ),
      buscarMensagensDiscord(
        CHANNEL_FIANCAS_ID,
        idCidadao,
        Discord_Bot_Token,
        dataUltimaLimpeza,
        5000
      ),
    ]);

    const todosRegistros = [...prisoes, ...fiancas];
    let somaMultas = 0;
    let totalInafiancaveis = 0;

    // Lista de crimes que aumentam o valor
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

        // EXTRAÇÃO DE MULTA (Busca apenas números que venham após a palavra Multa ou Valor)
        if (
          nomeCampo.includes("SENTENCA") ||
          nomeCampo.includes("MULTA") ||
          nomeCampo.includes("VALOR") ||
          nomeCampo.includes("FIANCA")
        ) {
          // Regex que procura o valor financeiro ignorando o texto ao redor
          const match = f.value.match(/(?:MULTA|VALOR|R\$|FIANÇA).*?([\d.]+)/i);
          if (match && match[1]) {
            const valorLimpo = parseInt(match[1].replace(/\./g, "")) || 0;
            // Filtro de segurança: Se o valor for igual ao ID do cidadão, ignoramos (evita erro de leitura)
            if (valorLimpo !== parseInt(idCidadao)) {
              somaMultas += valorLimpo;
            }
          }
        }

        // CONTAGEM DE CRIMES (Apenas no campo de crimes e contando 1 por linha)
        if (nomeCampo.includes("CRIMES")) {
          const linhas = valorCampo.split("\n");
          linhas.forEach((linha) => {
            const temCrime = listaKeywordsInafiancaveis.some((k) =>
              linha.includes(k)
            );
            // Só conta se a linha tiver um crime e for uma linha de texto real
            if (temCrime && linha.trim().length > 4) {
              totalInafiancaveis++;
            }
          });
        }
      });
    });

    // CÁLCULO FINAL
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
  limite
) {
  let filtradas = [];
  let ultimoId = null;
  let processadas = 0;
  const regexID = new RegExp(
    `^${idCidadao}$|^\\D${idCidadao}$|^${idCidadao}\\D|\\D${idCidadao}\\D`
  );

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
        // VERIFICAÇÃO ESTRITA: O ID deve estar em um campo chamado "RG"
        return (embed.fields || []).some((f) => {
          const nome = f.name
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          const valor = f.value.trim();
          return nome === "RG" && valor === idCidadao;
        });
      });

      if (pertence) filtradas.push(msg);
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

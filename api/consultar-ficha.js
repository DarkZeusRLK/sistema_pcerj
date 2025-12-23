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
    // 1. BUSCAR ÚLTIMA LIMPEZA (Ponto de corte)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      100
    );
    let dataUltimaLimpeza = new Date(0);
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCAR REGISTROS (Prisões e Fianças)
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      500
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      500
    );

    const todosRegistros = [...prisoes, ...fiancas];

    let somaMultas = 0;
    let totalInafiancaveis = 0;

    // Lista de crimes inafiançáveis (ajustada para ignorar acentos)
    const listaCrimesInafiancaveis = [
      "HOMICIDIO",
      "DESACATO",
      "TRAFICO",
      "SEQUESTRO",
      "TENTATIVA",
    ];

    todosRegistros.forEach((msg) => {
      if (!msg.embeds || msg.embeds.length === 0) return;
      const embed = msg.embeds[0];

      embed.fields?.forEach((f) => {
        // Normalizamos o texto: Remove acentos e deixa tudo em maiúsculo
        const nomeCampo = f.name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const valorCampo = f.value
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // EXTRAÇÃO DA MULTA (Busca campos que contenham "MULTA" ou "VALOR")
        if (nomeCampo.includes("MULTA") || nomeCampo.includes("VALOR")) {
          const apenasNumeros = f.value.replace(/\D/g, ""); // Remove R$, pontos e espaços
          somaMultas += parseInt(apenasNumeros) || 0;
        }

        // CONTAGEM DE CRIMES INAFIANÇÁVEIS
        if (nomeCampo.includes("CRIME")) {
          listaCrimesInafiancaveis.forEach((crime) => {
            if (valorCampo.includes(crime)) {
              // Conta quantas vezes o crime aparece (caso tenha mais de um homicídio, por exemplo)
              const regex = new RegExp(crime, "gi");
              const count = (valorCampo.match(regex) || []).length;
              totalInafiancaveis += count;
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
          ? dataUltimaLimpeza.toLocaleString("pt-BR")
          : "Ficha Suja",
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

  if (!channelId) return [];

  while (processadas < limite) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    const mensagens = await res.json();

    if (!mensagens || !Array.isArray(mensagens) || mensagens.length === 0)
      break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;
      const dataMsg = new Date(msg.timestamp);

      // Se a mensagem for mais antiga que a última limpeza, para de procurar
      if (dataCorte && dataMsg <= dataCorte) return filtradas;

      // FILTRO DE SEGURANÇA: Verifica se o ID está no campo "Passaporte" do embed
      const temIdCerto = (msg.embeds || []).some((emb) =>
        (emb.fields || []).some(
          (f) => f.name.includes("Passaporte") && f.value.includes(idCidadao)
        )
      );

      if (temIdCerto) {
        filtradas.push(msg);
      }
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

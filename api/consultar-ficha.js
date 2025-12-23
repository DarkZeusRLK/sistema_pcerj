const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // Ajuste de CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // 1. Tratamento rigoroso do ID (Remove espaços e garante string)
  const idCidadao = String(req.body.idCidadao || "").trim();
  const {
    Discord_Bot_Token,
    CHANNEL_PRISOES_ID,
    CHANNEL_FIANCAS_ID,
    CHANNEL_LIMPEZA_ID,
  } = process.env;

  if (!idCidadao) return res.status(400).json({ error: "ID não fornecido" });

  try {
    // 2. BUSCAR ÚLTIMA LIMPEZA (Ponto de partida)
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null,
      200
    );

    let dataUltimaLimpeza = new Date(0); // 1970
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      // Pega a data da limpeza mais recente
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 3. BUSCAR REGISTROS (Prisões e Fianças)
    // Buscamos apenas o que aconteceu DEPOIS da última limpeza
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      1000
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      1000
    );

    const todosRegistros = [...prisoes, ...fiancas];

    let somaMultas = 0;
    let totalInafiancaveis = 0;
    const listaCrimesInafiancaveis = [
      "DESACATO",
      "HOMICIDIO",
      "TENTATIVA",
      "SEQUESTRO",
      "TRAFICO",
    ];

    todosRegistros.forEach((msg) => {
      if (!msg.embeds || msg.embeds.length === 0) return;

      const embed = msg.embeds[0];

      // Verificação de campos para somar multas
      embed.fields?.forEach((f) => {
        const nomeCampo = f.name.toUpperCase();

        // Identifica campos de valor (Independente de emoji)
        if (
          nomeCampo.includes("MULTA") ||
          nomeCampo.includes("VALOR") ||
          nomeCampo.includes("TOTAL")
        ) {
          // Remove R$, pontos, espaços e letras para isolar o número
          const valorNumerico = parseInt(f.value.replace(/\D/g, "")) || 0;
          somaMultas += valorNumerico;
        }

        // Identifica crimes inafiançáveis
        if (nomeCampo.includes("CRIME")) {
          const valorCampo = f.value.toUpperCase();
          listaCrimesInafiancaveis.forEach((crime) => {
            if (valorCampo.includes(crime)) {
              // Conta quantas vezes o crime aparece no texto
              const regex = new RegExp(crime, "gi");
              totalInafiancaveis += (valorCampo.match(regex) || []).length;
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
          : "Nenhuma (Ficha Suja)",
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    console.error("Erro na API:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Função de Busca Otimizada
 */
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

      // Se a mensagem for anterior ou igual à limpeza, para a busca aqui
      if (dataCorte && dataMsg <= dataCorte) return filtradas;

      // BUSCA PRECISA: Verifica se o ID está no campo de Passaporte
      const temIdNoEmbed = (msg.embeds || []).some((embed) => {
        // Verifica todos os campos (fields) do embed
        return (embed.fields || []).some((f) => {
          const nomeF = f.name.toLowerCase();
          // Verifica se o campo é de Passaporte ou ID e se o valor bate exatamente
          return (
            (nomeF.includes("passaporte") || nomeF.includes("id")) &&
            f.value.includes(idCidadao)
          );
        });
      });

      if (temIdNoEmbed) {
        filtradas.push(msg);
      }
    }
    if (mensagens.length < 100) break;
  }
  return filtradas;
}

// api/relatorio.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const {
    Discord_Bot_Token,
    Discord_Guild_ID,
    CHANNEL_PORTE_ID,
    CHANNEL_LOGS_ID,
    CARGOS_ADMIN_RELATORIO,
  } = process.env;
  const { roles, dataInicio, dataFim } = req.body || {};

  // ... (Validação de permissão mantida conforme seu código original)

  try {
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);
    const normalizar = (str) =>
      str
        ? str
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
        : "";

    async function fetchMessages(channelId) {
      // ... (Lógica de fetchMessages mantida igual ao seu original)
      //
    }

    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID];
    const statsPorID = {};

    for (const id of canais) {
      const msgs = await fetchMessages(id);
      msgs.forEach((msg) => {
        const dataMsg = new Date(msg.timestamp);
        if (dataMsg < startObj || dataMsg > endObj) return;
        if (!msg.embeds || msg.embeds.length === 0) return;

        const embed = msg.embeds[0];
        const title = normalizar(embed.title || "");

        // 🔍 BUSCA DE OFICIAL MELHORADA
        let oficialId = null;
        const campoOficial = embed.fields?.find((f) => {
          const nome = normalizar(f.name);
          return (
            nome.includes("OFICIAL") ||
            nome.includes("REVOGADO POR") ||
            nome.includes("RENOVADO POR") ||
            nome.includes("AUTOR")
          );
        });

        if (campoOficial) {
          const match = campoOficial.value.match(/<@!?(\d+)>/);
          if (match) oficialId = match[1];
        }

        if (!oficialId) return;
        if (!statsPorID[oficialId])
          statsPorID[oficialId] = {
            emissao: 0,
            revogacao: 0,
            limpeza: 0,
            renovacao: 0,
          };

        // 🏷️ CATEGORIZAÇÃO POR PALAVRAS-CHAVE ATUALIZADA
        if (
          title.includes("EMISSAO") ||
          title.includes("EMITIDO") ||
          title.includes("NOVO PORTE")
        ) {
          statsPorID[oficialId].emissao++;
        } else if (title.includes("REVOGADO") || title.includes("REVOGACAO")) {
          statsPorID[oficialId].revogacao++;
        } else if (
          title.includes("LIMPEZA") ||
          title.includes("BONS ANTECEDENTES") ||
          title.includes("CERTIFICADO")
        ) {
          statsPorID[oficialId].limpeza++;
        } else if (title.includes("RENOVACAO") || title.includes("RENOVADO")) {
          statsPorID[oficialId].renovacao++;
        }
      });
    }

    // ... (Resolução de nomes e montagem final mantida conforme seu código original)
    //
    res.status(200).json(relatorioFinal);
  } catch (error) {
    res.status(500).json({ error: "Erro interno no servidor." });
  }
}

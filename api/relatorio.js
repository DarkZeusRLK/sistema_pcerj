// api/relatorio.js
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const {
    Discord_Bot_Token,
    Discord_Guild_ID,
    CHANNEL_PORTE_ID,
    CHANNEL_REVOGACAO_ID, // Canal de Revogação
    CHANNEL_LIMPEZA_ID, // Canal de Limpeza
    CHANNEL_LOGS_ID,
    CARGOS_ADMIN_RELATORIO,
  } = process.env;

  const { roles, dataInicio, dataFim } = req.body || {};

  try {
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);
    const statsPorID = {};

    async function fetchMessages(channelId) {
      if (!channelId) return [];
      try {
        const response = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
          {
            headers: { Authorization: `Bot ${Discord_Bot_Token}` },
          }
        );
        return response.ok ? await response.json() : [];
      } catch (err) {
        console.error("Erro ao buscar canal " + channelId, err);
        return [];
      }
    }

    // LISTA DE CANAIS AMPLIADA: Agora lê Portes, Revogações e Limpezas
    const canais = [
      CHANNEL_PORTE_ID,
      CHANNEL_REVOGACAO_ID,
      CHANNEL_LIMPEZA_ID,
      CHANNEL_LOGS_ID,
    ].filter(Boolean);

    for (const channelId of canais) {
      const msgs = await fetchMessages(channelId);
      msgs.forEach((msg) => {
        const dataMsg = new Date(msg.timestamp);
        if (dataMsg < startObj || dataMsg > endObj) return;
        if (!msg.embeds || msg.embeds.length === 0) return;

        const embed = msg.embeds[0];
        const title = (embed.title || "")
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // 👮 BUSCA DO OFICIAL QUE REALIZOU A AÇÃO
        let oficialId = null;
        const campoOficial = embed.fields?.find((f) =>
          // Regex expandida para pegar "Revogado por", "Emissor", etc.
          /OFICIAL|RESPONSAVEL|POLICIAL|EMISSOR|AUTOR|REVOGADO POR/i.test(
            f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          )
        );

        if (campoOficial) {
          const match = campoOficial.value.match(/<@!?(\d+)>/);
          if (match) oficialId = match[1];
        }

        // Se não achou oficial, mas a mensagem é do bot, tentamos pegar o autor da mensagem se for log
        if (!oficialId && msg.author) oficialId = msg.author.id;
        if (!oficialId) return;

        if (!statsPorID[oficialId])
          statsPorID[oficialId] = {
            emissao: 0,
            revogacao: 0,
            limpeza: 0,
            renovacao: 0,
          };

        // --- CLASSIFICAÇÃO DOS LOGS ---

        // 1. EMISSÃO
        if (
          title.includes("EMISSAO") ||
          title.includes("EMITIDO") ||
          title.includes("PORTE DE ARMA")
        ) {
          statsPorID[oficialId].emissao++;
        }

        // 2. REVOGAÇÃO (E COMPENSAÇÃO DA META)
        else if (title.includes("REVOGA")) {
          statsPorID[oficialId].revogacao++;

          // Lógica para não tirar o ponto do oficial original:
          const campoOrig = embed.fields?.find((f) =>
            /ORIGINAL|EMITIDO POR/i.test(f.name.toUpperCase())
          );
          if (campoOrig) {
            const matchO = campoOrig.value.match(/<@!?(\d+)>/);
            if (matchO) {
              const idO = matchO[1];
              if (!statsPorID[idO])
                statsPorID[idO] = {
                  emissao: 0,
                  revogacao: 0,
                  limpeza: 0,
                  renovacao: 0,
                };

              // Devolvemos o ponto de emissão para o oficial original aqui!
              statsPorID[idO].emissao++;
            }
          }
        }

        // 3. LIMPEZA DE FICHA
        else if (
          title.includes("LIMPEZA") ||
          title.includes("CERTIFICADO") ||
          title.includes("BONS") ||
          title.includes("ANTECEDENTES")
        ) {
          statsPorID[oficialId].limpeza++;
        }

        // 4. RENOVAÇÃO
        else if (title.includes("RENOVA")) {
          statsPorID[oficialId].renovacao++;
        }
      });
    }

    // Tradução de IDs para Nomes
    const ids = Object.keys(statsPorID);
    const mapaNomes = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(
            `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${id}`,
            { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
          );
          const d = await r.json();
          mapaNomes[id] = d.nick || d.user.global_name || d.user.username;
        } catch {
          mapaNomes[id] = `Oficial (${id})`;
        }
      })
    );

    const final = {};
    ids.forEach((id) => {
      final[mapaNomes[id] || id] = statsPorID[id];
    });

    res.status(200).json(final);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro interno ao gerar relatório" });
  }
};

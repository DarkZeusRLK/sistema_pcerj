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
      const response = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
        {
          headers: { Authorization: `Bot ${Discord_Bot_Token}` },
        }
      );
      return response.ok ? await response.json() : [];
    }

    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID].filter(Boolean);

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

        // 👮 BUSCA DO OFICIAL (Melhorada para Limpezas)
        let oficialId = null;
        const campoOficial = embed.fields?.find((f) =>
          /OFICIAL|RESPONSAVEL|POLICIAL|EMISSOR|AUTOR/i.test(
            f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          )
        );

        if (campoOficial) {
          const match = campoOficial.value.match(/<@!?(\d+)>/);
          if (match) oficialId = match[1];
        }

        if (!oficialId) return; // Se não achou o ID do oficial, ignora o log
        if (!statsPorID[oficialId])
          statsPorID[oficialId] = {
            emissao: 0,
            revogacao: 0,
            limpeza: 0,
            renovacao: 0,
          };

        // --- CLASSIFICAÇÃO DOS LOGS ---
        if (title.includes("EMISSAO") || title.includes("EMITIDO")) {
          statsPorID[oficialId].emissao++;
        } else if (title.includes("REVOGA")) {
          statsPorID[oficialId].revogacao++;
          // Devolve o ponto de emissão para o oficial original
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
              statsPorID[idO].emissao++;
            }
          }
        }
        // ✅ CONTAGEM DE LIMPEZA (Título do seu sistema: "CERTIFICADO DE BONS ANTECEDENTES")
        else if (
          title.includes("LIMPEZA") ||
          title.includes("CERTIFICADO") ||
          title.includes("ANTECEDENTES") ||
          title.includes("BONS")
        ) {
          statsPorID[oficialId].limpeza++;
        } else if (title.includes("RENOVA")) {
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
            {
              headers: { Authorization: `Bot ${Discord_Bot_Token}` },
            }
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
      final[mapaNomes[id]] = statsPorID[id];
    });
    res.status(200).json(final);
  } catch (e) {
    res.status(500).json({ error: "Erro interno" });
  }
};

// api/relatorio.js
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // --- Configuração de CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const {
    Discord_Bot_Token,
    Discord_Guild_ID,
    CHANNEL_PORTE_ID,
    CHANNEL_REVOGACAO_ID,
    CHANNEL_LIMPEZA_ID,
  } = process.env;

  const { dataInicio, dataFim } = req.body || {};

  try {
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);
    const statsPorID = {};

    // --- Função para buscar mensagens com paginação segura ---
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      try {
        const response = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
          { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
        );
        return response.ok ? await response.json() : [];
      } catch (err) {
        return [];
      }
    }

    const canais = [
      CHANNEL_PORTE_ID,
      CHANNEL_REVOGACAO_ID,
      CHANNEL_LIMPEZA_ID,
    ].filter(Boolean);

    // --- Processamento das Mensagens ---
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

        // 1. Identificar Oficial (ID)
        let oficialId = null;
        const campoOficial = embed.fields?.find((f) =>
          /OFICIAL|RESPONSAVEL|POLICIAL|EMISSOR|AUTOR|REVOGADO POR/i.test(
            f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          )
        );

        if (campoOficial) {
          const match = campoOficial.value.match(/<@!?(\d+)>/);
          if (match) oficialId = match[1];
        }
        if (!oficialId && msg.author) oficialId = msg.author.id;
        if (!oficialId) return;

        // Inicializar objeto
        if (!statsPorID[oficialId]) {
          statsPorID[oficialId] = {
            emissao: 0,
            revogacao: 0,
            limpeza: 0,
            renovacao: 0,
          };
        }

        // --- Contagem ---
        if (
          title.includes("EMISSAO") ||
          title.includes("EMITIDO") ||
          title.includes("PORTE DE ARMA")
        ) {
          statsPorID[oficialId].emissao++;
        } else if (title.includes("REVOGA")) {
          statsPorID[oficialId].revogacao++;
          // Recuperar emissor original
          const campoEmissorOriginal = embed.fields?.find((f) =>
            /ORIGINAL|EMITIDO POR/i.test(
              f.name
                .toUpperCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
            )
          );
          if (campoEmissorOriginal) {
            const matchO = campoEmissorOriginal.value.match(/<@!?(\d+)>/);
            if (matchO) {
              const idOriginal = matchO[1];
              if (!statsPorID[idOriginal]) {
                statsPorID[idOriginal] = {
                  emissao: 0,
                  revogacao: 0,
                  limpeza: 0,
                  renovacao: 0,
                };
              }
              statsPorID[idOriginal].emissao++;
            }
          }
        } else if (
          title.includes("LIMPEZA") ||
          title.includes("CERTIFICADO") ||
          title.includes("ANTECEDENTES")
        ) {
          statsPorID[oficialId].limpeza++;
        } else if (title.includes("RENOVA")) {
          statsPorID[oficialId].renovacao++;
        }
      });
    }

    // --- TRADUÇÃO DE NOMES (Reforçada) ---
    const ids = Object.keys(statsPorID);
    const mapaNomes = {};

    await Promise.all(
      ids.map(async (id) => {
        try {
          // 1. Busca no Servidor (Guild) - Prioridade Máxima
          const rGuild = await fetch(
            `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${id}`,
            { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
          );

          if (rGuild.ok) {
            const memberData = await rGuild.json();
            // Tenta pegar o Apelido (nick). Se for null, pega o username.
            // O Discord retorna "nick": null se o usuário não tiver apelido neste servidor específico.
            mapaNomes[id] =
              memberData.nick ||
              memberData.user?.global_name ||
              memberData.user?.username;
            return;
          }

          // 2. Fallback: Busca Global (se o usuário saiu do servidor)
          const rUser = await fetch(`https://discord.com/api/v10/users/${id}`, {
            headers: { Authorization: `Bot ${Discord_Bot_Token}` },
          });

          if (rUser.ok) {
            const userData = await rUser.json();
            mapaNomes[id] = userData.global_name || userData.username;
            return;
          }

          mapaNomes[id] = `Oficial (${id})`;
        } catch (error) {
          mapaNomes[id] = `Oficial (${id})`;
        }
      })
    );

    const final = {};
    ids.forEach((id) => {
      final[mapaNomes[id] || `Oficial (${id})`] = statsPorID[id];
    });

    res.status(200).json(final);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro interno no relatório" });
  }
};

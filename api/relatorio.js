// api/relatorio.js
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método não permitido" });

  const {
    Discord_Bot_Token,
    Discord_Guild_ID,
    CHANNEL_PORTE_ID,
    CHANNEL_LOGS_ID,
    CARGOS_ADMIN_RELATORIO,
  } = process.env;

  const { roles, dataInicio, dataFim } = req.body || {};

  // Validação de Segurança e Variáveis
  if (!Discord_Bot_Token)
    return res.status(500).json({ error: "Token ausente no servidor." });

  const listaPermitida = (CARGOS_ADMIN_RELATORIO || "")
    .split(",")
    .map((c) => c.trim());
  const temPermissao =
    Array.isArray(roles) && roles.some((r) => listaPermitida.includes(r));

  if (!temPermissao) return res.status(403).json({ error: "Acesso negado." });
  if (!dataInicio || !dataFim)
    return res.status(400).json({ error: "Datas obrigatórias." });

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

        // Identifica o Oficial que postou o log
        let oficialId = null;
        const campoOficial = embed.fields?.find((f) =>
          /OFICIAL|RESPONSAVEL|REVOGADO POR|RENOVADO POR/i.test(
            f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          )
        );
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

        // Contagem
        if (title.includes("EMISSAO") || title.includes("EMITIDO")) {
          statsPorID[oficialId].emissao++;
        } else if (title.includes("REVOGA")) {
          statsPorID[oficialId].revogacao++;

          // 🛡️ PRESERVAÇÃO DE META: Recupera o emissor original
          const campoOrig = embed.fields?.find((f) =>
            /EMISSOR ORIGINAL|EMITIDO POR/i.test(
              f.name
                .toUpperCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
            )
          );
          if (campoOrig) {
            const matchOrig = campoOrig.value.match(/<@!?(\d+)>/);
            if (matchOrig) {
              const idOrig = matchOrig[1];
              if (!statsPorID[idOrig])
                statsPorID[idOrig] = {
                  emissao: 0,
                  revogacao: 0,
                  limpeza: 0,
                  renovacao: 0,
                };
              statsPorID[idOrig].emissao++;
            }
          }
        } else if (title.includes("LIMPEZA")) statsPorID[oficialId].limpeza++;
        else if (title.includes("RENOVACAO")) statsPorID[oficialId].renovacao++;
      });
    }

    // Traduz IDs para nomes
    const ids = Object.keys(statsPorID);
    const mapaNomes = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          const resMem = await fetch(
            `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${id}`,
            {
              headers: { Authorization: `Bot ${Discord_Bot_Token}` },
            }
          );
          const d = await resMem.json();
          mapaNomes[id] = d.nick || d.user.global_name || d.user.username;
        } catch {
          mapaNomes[id] = `ID: ${id}`;
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
    res.status(500).json({ error: "Erro interno no servidor." });
  }
};

export default async function handler(req, res) {
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

  // Validação de Permissão
  const listaPermitida = (CARGOS_ADMIN_RELATORIO || "")
    .split(",")
    .map((c) => c.trim());
  const temPermissao = roles && roles.some((r) => listaPermitida.includes(r));
  if (!temPermissao) return res.status(403).json({ error: "Acesso negado." });

  if (!dataInicio || !dataFim)
    return res.status(400).json({ error: "Datas obrigatórias." });

  try {
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);

    // Função auxiliar para limpar textos (Remove acentos e emojis)
    const normalizar = (str) => {
      if (!str) return "";
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
    };

    // Função de Fetch (com paginação)
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      let allMessages = [];
      let lastId = null;
      let keepFetching = true;
      let attempts = 0;

      while (keepFetching && attempts < 8) {
        // Aumentei tentativas
        try {
          let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
          if (lastId) url += `&before=${lastId}`;

          const response = await fetch(url, {
            headers: { Authorization: `Bot ${Discord_Bot_Token}` },
          });

          if (!response.ok) break;
          const msgs = await response.json();

          if (!msgs || msgs.length === 0) {
            keepFetching = false;
          } else {
            allMessages = allMessages.concat(msgs);
            lastId = msgs[msgs.length - 1].id;
            const lastMsgDate = new Date(msgs[msgs.length - 1].timestamp);
            if (lastMsgDate < startObj) keepFetching = false;
          }
          attempts++;
        } catch (e) {
          keepFetching = false;
        }
      }
      return allMessages;
    }

    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID];
    let todasMensagens = [];
    for (const id of canais) {
      const msgs = await fetchMessages(id);
      if (Array.isArray(msgs)) todasMensagens = todasMensagens.concat(msgs);
    }

    const statsPorID = {};

    todasMensagens.forEach((msg) => {
      const dataMsg = new Date(msg.timestamp);
      if (dataMsg < startObj || dataMsg > endObj) return;

      if (!msg.embeds || msg.embeds.length === 0) return;

      const embed = msg.embeds[0];

      // AQUI ESTÁ O SEGREDO: Normalizamos o título para comparar
      const rawTitle = embed.title || "";
      const title = normalizar(rawTitle); // Vira "PORTE EMITIDO", "RENOVACAO", etc.

      // Busca ID do Oficial
      let oficialId = null;
      const campoOficial = embed.fields?.find((f) => {
        const nome = normalizar(f.name);
        return nome.includes("OFICIAL") || nome.includes("REVOGADO POR");
      });

      if (campoOficial) {
        const match = campoOficial.value.match(/<@!?(\d+)>/);
        if (match) oficialId = match[1];
      }

      if (!oficialId) return;

      if (!statsPorID[oficialId]) {
        statsPorID[oficialId] = {
          emissao: 0,
          revogacao: 0,
          limpeza: 0,
          renovacao: 0,
        };
      }

      // LÓGICA DE CONTAGEM BLINDADA
      // Verifica palavras-chave no Título normalizado
      if (title.includes("EMITIDO") || title.includes("NOVO PORTE")) {
        statsPorID[oficialId].emissao++;
      } else if (title.includes("REVOGADO")) {
        statsPorID[oficialId].revogacao++;
      } else if (title.includes("LIMPEZA")) {
        statsPorID[oficialId].limpeza++;
      } else if (title.includes("RENOVACAO") || title.includes("RENOVAÇÃO")) {
        statsPorID[oficialId].renovacao++;
      }
    });

    // Busca Apelidos
    const relatorioFinal = {};
    const idsEncontrados = Object.keys(statsPorID);

    await Promise.all(
      idsEncontrados.map(async (userId) => {
        let nomeExibicao = `Oficial (${userId})`;

        if (Discord_Guild_ID) {
          try {
            const resMember = await fetch(
              `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${userId}`,
              { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
            );
            if (resMember.ok) {
              const memberData = await resMember.json();
              nomeExibicao =
                memberData.nick ||
                memberData.user.global_name ||
                memberData.user.username;
            }
          } catch (e) {}
        }

        if (!relatorioFinal[nomeExibicao]) {
          relatorioFinal[nomeExibicao] = statsPorID[userId];
        } else {
          const atual = relatorioFinal[nomeExibicao];
          const novo = statsPorID[userId];
          atual.emissao += novo.emissao;
          atual.renovacao += novo.renovacao;
          atual.limpeza += novo.limpeza;
          atual.revogacao += novo.revogacao;
        }
      })
    );

    res.status(200).json(relatorioFinal);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro interno." });
  }
}

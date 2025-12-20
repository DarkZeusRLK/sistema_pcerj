export default async function handler(req, res) {
  // --- Configurações de CORS e Headers ---
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

  // 1. Validação de Permissão
  const listaPermitida = (CARGOS_ADMIN_RELATORIO || "")
    .split(",")
    .map((c) => c.trim());
  const temPermissao = roles && roles.some((r) => listaPermitida.includes(r));

  if (!temPermissao) return res.status(403).json({ error: "Acesso negado." });

  if (!dataInicio || !dataFim)
    return res.status(400).json({ error: "Datas obrigatórias." });

  try {
    // Datas de Corte
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);

    const normalizar = (str) => {
      if (!str) return "";
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
    };

    // --- Função de Busca "Infinita" (Até a Data Início) ---
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      let allMessages = [];
      let lastId = null;
      let keepFetching = true;
      let attempts = 0;

      // Aumentei o limite para 500 páginas (50.000 mensagens)
      // O loop só para quando encontrar uma mensagem mais velha que a Data Início
      while (keepFetching && attempts < 500) {
        try {
          let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
          if (lastId) url += `&before=${lastId}`;

          const response = await fetch(url, {
            headers: { Authorization: `Bot ${Discord_Bot_Token}` },
          });

          // Rate Limit (Espera 1s se o Discord bloquear)
          if (response.status === 429) {
            await new Promise((r) => setTimeout(r, 1000));
            continue; // Tenta de novo
          }

          if (!response.ok) break;
          const msgs = await response.json();

          if (!msgs || msgs.length === 0) {
            keepFetching = false; // Acabaram as mensagens do canal
          } else {
            allMessages = allMessages.concat(msgs);
            lastId = msgs[msgs.length - 1].id;

            // VERIFICAÇÃO CRUCIAL:
            // Pega a data da mensagem mais velha desse pacote
            const oldestMsgDate = new Date(msgs[msgs.length - 1].timestamp);

            // Se a mensagem mais velha já for anterior à Data de Início escolhida,
            // podemos parar de buscar, pois já temos tudo o que precisamos.
            if (oldestMsgDate < startObj) {
              keepFetching = false;
            }
          }
          attempts++;
        } catch (e) {
          console.error("Erro no fetch loop:", e);
          keepFetching = false;
        }
      }
      return allMessages;
    }

    // 2. Busca e Contagem (Lógica separada para não perder dados)
    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID];
    const statsPorID = {}; // { "12345": { emissao: 1, ... } }

    // Busca sequencial para evitar sobrecarga
    for (const id of canais) {
      const msgs = await fetchMessages(id);

      msgs.forEach((msg) => {
        const dataMsg = new Date(msg.timestamp);

        // Filtro Exato: Só conta se estiver DENTRO do período
        if (dataMsg < startObj || dataMsg > endObj) return;

        if (!msg.embeds || msg.embeds.length === 0) return;

        const embed = msg.embeds[0];
        const title = normalizar(embed.title || "");

        // Busca ID do Oficial (Compatível com vários formatos)
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

        // Contabilização
        if (title.includes("EMITIDO") || title.includes("NOVO PORTE")) {
          statsPorID[oficialId].emissao++;
        } else if (title.includes("REVOGADO")) {
          statsPorID[oficialId].revogacao++;
        } else if (title.includes("LIMPEZA")) {
          statsPorID[oficialId].limpeza++;
        } else if (title.includes("RENOVACAO")) {
          statsPorID[oficialId].renovacao++;
        }
      });
    }

    // 3. Resolução de Nomes (Busca os Nicks do Servidor)
    const idsEncontrados = Object.keys(statsPorID);
    const mapaNomes = {};

    await Promise.all(
      idsEncontrados.map(async (userId) => {
        let nomeFinal = `Oficial (${userId})`;

        if (Discord_Guild_ID) {
          try {
            const resMember = await fetch(
              `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${userId}`,
              { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
            );

            if (resMember.ok) {
              const memberData = await resMember.json();
              nomeFinal =
                memberData.nick ||
                memberData.user.global_name ||
                memberData.user.username;
            }
          } catch (e) {
            console.error(`Erro nome ${userId}`);
          }
        }
        mapaNomes[userId] = nomeFinal;
      })
    );

    // 4. Montagem Final (Consolidação)
    const relatorioFinal = {};

    idsEncontrados.forEach((id) => {
      const nome = mapaNomes[id] || `Oficial ${id}`;
      const stats = statsPorID[id];

      if (!relatorioFinal[nome]) {
        relatorioFinal[nome] = { ...stats };
      } else {
        relatorioFinal[nome].emissao += stats.emissao;
        relatorioFinal[nome].revogacao += stats.revogacao;
        relatorioFinal[nome].limpeza += stats.limpeza;
        relatorioFinal[nome].renovacao += stats.renovacao;
      }
    });

    res.status(200).json(relatorioFinal);
  } catch (error) {
    console.error("Erro Relatório:", error);
    res.status(500).json({ error: "Erro interno. Verifique logs da Vercel." });
  }
}

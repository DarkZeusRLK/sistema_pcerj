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

  // 1. Validação de Permissão (Suporta múltiplos cargos no .env)
  const listaPermitida = (CARGOS_ADMIN_RELATORIO || "")
    .split(",")
    .map((c) => c.trim());
  const temPermissao = roles && roles.some((r) => listaPermitida.includes(r));

  if (!temPermissao) return res.status(403).json({ error: "Acesso negado." });

  if (!dataInicio || !dataFim)
    return res.status(400).json({ error: "Datas obrigatórias." });

  try {
    // Ajuste de datas (Início do dia 00:00 até Fim do dia 23:59)
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);

    const normalizar = (str) => {
      if (!str) return "";
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
    };

    // --- Função de Busca com Paginação (Loop) ---
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      let allMessages = [];
      let lastId = null;
      let keepFetching = true;
      let attempts = 0;

      // Busca até 10 páginas (1000 msgs) para garantir que pega todos
      while (keepFetching && attempts < 10) {
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

            // Se a última mensagem do lote for mais velha que a data inicial, pode parar
            const lastMsgDate = new Date(msgs[msgs.length - 1].timestamp);
            if (lastMsgDate < startObj) keepFetching = false;
          }
          attempts++;
        } catch (e) {
          console.error("Erro no fetch loop:", e);
          keepFetching = false;
        }
      }
      return allMessages;
    }

    // 2. Busca e Agregação Inicial (Por ID)
    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID];
    const statsPorID = {}; // { "12345": { emissao: 1, ... } }

    for (const id of canais) {
      const msgs = await fetchMessages(id);

      msgs.forEach((msg) => {
        const dataMsg = new Date(msg.timestamp);
        // Filtro de Data
        if (dataMsg < startObj || dataMsg > endObj) return;

        if (!msg.embeds || msg.embeds.length === 0) return;

        const embed = msg.embeds[0];
        const title = normalizar(embed.title || "");

        // Tenta achar o ID do Oficial
        let oficialId = null;
        const campoOficial = embed.fields?.find((f) => {
          const nome = normalizar(f.name);
          return nome.includes("OFICIAL") || nome.includes("REVOGADO POR");
        });

        if (campoOficial) {
          const match = campoOficial.value.match(/<@!?(\d+)>/);
          if (match) oficialId = match[1];
        }

        if (!oficialId) return; // Se não achou ID, ignora

        if (!statsPorID[oficialId]) {
          statsPorID[oficialId] = {
            emissao: 0,
            revogacao: 0,
            limpeza: 0,
            renovacao: 0,
          };
        }

        // Contabiliza
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

    // 3. Resolução de Nomes (Separada e Segura)
    const idsEncontrados = Object.keys(statsPorID);
    const mapaNomes = {}; // { "12345": "[CMD] Dark" }

    // Busca todos os nomes em paralelo
    await Promise.all(
      idsEncontrados.map(async (userId) => {
        let nomeFinal = `Oficial (${userId})`; // Fallback

        if (Discord_Guild_ID) {
          try {
            const resMember = await fetch(
              `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${userId}`,
              { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
            );

            if (resMember.ok) {
              const memberData = await resMember.json();
              // Pega o Apelido (nick) ou Username
              nomeFinal =
                memberData.nick ||
                memberData.user.global_name ||
                memberData.user.username;
            }
          } catch (e) {
            console.error(`Erro ao buscar nome para ${userId}`);
          }
        }
        mapaNomes[userId] = nomeFinal;
      })
    );

    // 4. Montagem do Relatório Final (Síncrona)
    const relatorioFinal = {};

    idsEncontrados.forEach((id) => {
      const nome = mapaNomes[id] || `Oficial ${id}`;
      const stats = statsPorID[id];

      // Se o nome já existe (ex: duas contas com mesmo nick?), soma.
      if (!relatorioFinal[nome]) {
        relatorioFinal[nome] = { ...stats }; // Cria cópia
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
    res.status(500).json({ error: "Erro interno ao gerar relatório." });
  }
}

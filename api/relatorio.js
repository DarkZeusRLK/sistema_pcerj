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
    // Ajusta datas para cobrir o dia inteiro
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);

    // Função que remove acentos e deixa tudo MAIÚSCULO para facilitar comparação
    const normalizar = (str) => {
      if (!str) return "";
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
    };

    // --- FETCH COM LOOP INFINITO (Até a data selecionada) ---
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      let allMessages = [];
      let lastId = null;
      let keepFetching = true;
      let attempts = 0;

      // Limite de segurança: 500 páginas (50k mensagens)
      while (keepFetching && attempts < 500) {
        try {
          let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
          if (lastId) url += `&before=${lastId}`;

          const response = await fetch(url, {
            headers: { Authorization: `Bot ${Discord_Bot_Token}` },
          });

          // Se der Rate Limit (429), espera um pouco
          if (response.status === 429) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }

          if (!response.ok) break;
          const msgs = await response.json();

          if (!msgs || msgs.length === 0) {
            keepFetching = false;
          } else {
            allMessages = allMessages.concat(msgs);
            lastId = msgs[msgs.length - 1].id;

            // Se chegamos em mensagens mais velhas que o filtro, para.
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
    const statsPorID = {};

    // --- LOOP PRINCIPAL DE CONTAGEM ---
    for (const id of canais) {
      const msgs = await fetchMessages(id);

      msgs.forEach((msg) => {
        const dataMsg = new Date(msg.timestamp);

        // 1. Filtro de Data
        if (dataMsg < startObj || dataMsg > endObj) return;

        // 2. Validação de Embed
        if (!msg.embeds || msg.embeds.length === 0) return;
        const embed = msg.embeds[0];

        // Normaliza o Título (Ex: "Revogação" vira "REVOGACAO")
        const title = normalizar(embed.title || "");

        // 3. Busca o ID do Oficial
        let oficialId = null;
        const campoOficial = embed.fields?.find((f) => {
          const nome = normalizar(f.name);
          return (
            nome.includes("OFICIAL") ||
            nome.includes("REVOGADO POR") ||
            nome.includes("AUTOR")
          );
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

        // ====================================================
        // 4. LÓGICA DE PALAVRAS-CHAVE (CORRIGIDA E AMPLIADA)
        // ====================================================

        // EMISSÃO
        if (
          title.includes("EMITIDO") ||
          title.includes("NOVO PORTE") ||
          title.includes("CONCESSAO")
        ) {
          statsPorID[oficialId].emissao++;
        }
        // REVOGAÇÃO (Agora aceita REVOGACAO, REVOGADO, CANCELADO)
        else if (
          title.includes("REVOGADO") ||
          title.includes("REVOGACAO") ||
          title.includes("CANCELADO")
        ) {
          statsPorID[oficialId].revogacao++;
        }
        // LIMPEZA
        else if (title.includes("LIMPEZA") || title.includes("LIMPO")) {
          statsPorID[oficialId].limpeza++;
        }
        // RENOVAÇÃO
        else if (title.includes("RENOVACAO") || title.includes("RENOVADO")) {
          statsPorID[oficialId].renovacao++;
        }
      });
    }

    // --- RESOLUÇÃO DE NOMES ---
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
          } catch (e) {}
        }
        mapaNomes[userId] = nomeFinal;
      })
    );

    // --- MONTAGEM FINAL ---
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
    console.error("Erro API Relatorio:", error);
    res.status(500).json({ error: "Erro interno no servidor." });
  }
}

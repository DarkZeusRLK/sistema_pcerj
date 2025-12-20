export default async function handler(req, res) {
  // Configurações CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const {
    Discord_Bot_Token,
    Discord_Guild_ID, // Necessário para pegar o apelido
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

  // 2. Validação das Datas (Ajuste de Fuso Horário)
  if (!dataInicio || !dataFim) {
    return res.status(400).json({ error: "Datas obrigatórias." });
  }

  try {
    // Força o início do dia e fim do dia para capturar tudo
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);

    // ====================================================
    // FUNÇÃO: Buscar mensagens com paginação (limite seguro)
    // ====================================================
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      let allMessages = [];
      let lastId = null;
      let keepFetching = true;
      let attempts = 0;

      // Busca até 500 mensagens por canal para garantir que pegamos os testes
      while (keepFetching && attempts < 5) {
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

            // Otimização: Se a última mensagem já for mais velha que a dataInicio, paramos.
            const lastMsgDate = new Date(msgs[msgs.length - 1].timestamp);
            if (lastMsgDate < startObj) keepFetching = false;
          }
          attempts++;
        } catch (e) {
          console.error("Erro fetch loop:", e);
          keepFetching = false;
        }
      }
      return allMessages;
    }

    // ====================================================
    // PROCESSAMENTO
    // ====================================================
    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID];
    let todasMensagens = [];

    // Busca mensagens de todos os canais configurados
    for (const id of canais) {
      const msgs = await fetchMessages(id);
      if (Array.isArray(msgs)) todasMensagens = todasMensagens.concat(msgs);
    }

    // Dicionário temporário usando o ID do usuário como chave
    // Ex: { "123456789": { emissao: 1, nome: "Dark", ... } }
    const statsPorID = {};

    todasMensagens.forEach((msg) => {
      // 1. Filtro de Data
      const dataMsg = new Date(msg.timestamp);
      if (dataMsg < startObj || dataMsg > endObj) return;

      // 2. Verifica se tem Embed
      if (!msg.embeds || msg.embeds.length === 0) return;

      const embed = msg.embeds[0];
      const title = embed.title?.toUpperCase() || "";

      // 3. Identifica o ID do Oficial dentro do Embed
      let oficialId = null;

      // Procura campo "Oficial" ou "Revogado por"
      const campoOficial = embed.fields?.find(
        (f) =>
          f.name.toUpperCase().includes("OFICIAL") ||
          f.name.toUpperCase().includes("REVOGADO POR")
      );

      if (campoOficial) {
        // Tenta extrair ID da menção <@123456>
        const match = campoOficial.value.match(/<@!?(\d+)>/);
        if (match) {
          oficialId = match[1];
        }
      }

      // Se não achou ID, pula (não conseguimos pegar apelido sem ID)
      if (!oficialId) return;

      // Inicializa contador
      if (!statsPorID[oficialId]) {
        statsPorID[oficialId] = {
          emissao: 0,
          revogacao: 0,
          limpeza: 0,
          renovacao: 0,
        };
      }

      // 4. Contabiliza baseado no Título
      if (title.includes("PORTE EMITIDO") || title.includes("NOVO PORTE")) {
        statsPorID[oficialId].emissao++;
      } else if (title.includes("REVOGADO")) {
        statsPorID[oficialId].revogacao++;
      } else if (title.includes("LIMPEZA")) {
        statsPorID[oficialId].limpeza++;
      } else if (title.includes("RENOVAÇÃO")) {
        statsPorID[oficialId].renovacao++;
      }
    });

    // ====================================================
    // RESOLUÇÃO DE NOMES (APELIDO DO SERVIDOR)
    // ====================================================
    const relatorioFinal = {};
    const idsEncontrados = Object.keys(statsPorID);

    // Busca os dados de cada membro no servidor para pegar o "nickname"
    await Promise.all(
      idsEncontrados.map(async (userId) => {
        let nomeExibicao = "Desconhecido";

        if (Discord_Guild_ID) {
          try {
            const resMember = await fetch(
              `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${userId}`,
              { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
            );

            if (resMember.ok) {
              const memberData = await resMember.json();
              // Prioridade: Nickname do servidor > Global Name > Username
              nomeExibicao =
                memberData.nick ||
                memberData.user.global_name ||
                memberData.user.username;
            } else {
              // Se falhar (ex: saiu do server), tenta pegar dados básicos do user
              // Tenta fallback simples se tiver cache, senão usa ID
              nomeExibicao = `Oficial (${userId})`;
            }
          } catch (e) {
            console.error(`Erro ao buscar member ${userId}`, e);
            nomeExibicao = `ID: ${userId}`;
          }
        }

        // Salva no objeto final usando o NOME formatado como chave
        // Se o nome se repetir (improvável), soma.
        if (!relatorioFinal[nomeExibicao]) {
          relatorioFinal[nomeExibicao] = statsPorID[userId];
        } else {
          // Merge de contagem caso nomes sejam iguais
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
    console.error("Erro interno relatório:", error);
    res.status(500).json({ error: "Erro ao processar dados." });
  }
}

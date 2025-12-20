export default async function handler(req, res) {
  // Configurações CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const {
    Discord_Bot_Token,
    CHANNEL_PORTE_ID,
    CHANNEL_LOGS_ID,
    CARGOS_ADMIN_RELATORIO,
  } = process.env;

  // Recebe roles E as datas do frontend
  const { roles, dataInicio, dataFim } = req.body || {};

  // Validação de Permissão
  const listaPermitida = (CARGOS_ADMIN_RELATORIO || "")
    .split(",")
    .map((c) => c.trim());
  const temPermissao = roles && roles.some((r) => listaPermitida.includes(r));

  if (!temPermissao) return res.status(403).json({ error: "Acesso negado." });

  // Validação das Datas
  if (!dataInicio || !dataFim) {
    return res
      .status(400)
      .json({ error: "Datas de início e fim são obrigatórias." });
  }

  try {
    // Configura o filtro de tempo
    // start: 00:00:00 do dia escolhido
    // end: 23:59:59 do dia escolhido
    const startObj = new Date(dataInicio + "T00:00:00");
    const endObj = new Date(dataFim + "T23:59:59");

    // Função Fetch Mensagens (Discord API)
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      try {
        const response = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
          { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
        );
        if (!response.ok) return [];
        return await response.json();
      } catch (e) {
        return [];
      }
    }

    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID];
    let todasMensagens = [];

    // Busca mensagens
    for (const id of canais) {
      const msgs = await fetchMessages(id);
      if (Array.isArray(msgs)) todasMensagens = todasMensagens.concat(msgs);
    }

    const relatorio = {};

    todasMensagens.forEach((msg) => {
      // 1. Filtro de Data Personalizado
      const dataMsg = new Date(msg.timestamp);

      // Se a mensagem for antes do inicio OU depois do fim, ignora
      if (dataMsg < startObj || dataMsg > endObj) return;

      // 2. Identifica o Oficial (Bot é autor, oficial está no Embed)
      let oficialNome = "Desconhecido";

      if (msg.embeds && msg.embeds.length > 0) {
        const embed = msg.embeds[0];
        const campoOficial = embed.fields?.find(
          (f) =>
            f.name.toUpperCase().includes("OFICIAL") ||
            f.name.toUpperCase().includes("REVOGADO POR")
        );

        if (campoOficial) {
          const valor = campoOficial.value;
          // Tenta limpar menções <@123>
          const matchId = valor.match(/<@!?(\d+)>/);

          if (matchId) {
            // Tenta achar username real
            const userObj = msg.mentions.find((u) => u.id === matchId[1]);
            oficialNome = userObj ? userObj.username : valor;
          } else {
            // Remove formatação markdown (**Nome**)
            oficialNome = valor.replace(/[\*`]/g, "").trim();
          }
        }
      } else {
        return; // Sem embed, sem contagem
      }

      // 3. Contagem
      if (!relatorio[oficialNome]) {
        relatorio[oficialNome] = {
          emissao: 0,
          revogacao: 0,
          limpeza: 0,
          renovacao: 0,
        };
      }

      const title = msg.embeds[0]?.title?.toUpperCase() || "";

      if (title.includes("PORTE EMITIDO") || title.includes("NOVO PORTE"))
        relatorio[oficialNome].emissao++;
      else if (title.includes("REVOGADO")) relatorio[oficialNome].revogacao++;
      else if (title.includes("LIMPEZA")) relatorio[oficialNome].limpeza++;
      else if (title.includes("RENOVAÇÃO")) relatorio[oficialNome].renovacao++;
    });

    res.status(200).json(relatorio);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro interno no relatório." });
  }
}

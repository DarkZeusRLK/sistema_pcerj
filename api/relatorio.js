module.exports = async (req, res) => {
  const {
    Discord_Bot_Token,
    CHANNEL_PORTE_ID,
    CHANNEL_LOGS_ID,
    CARGOS_ADMIN_RELATORIO,
  } = process.env;
  const cargosPermitidos = CARGOS_ADMIN_RELATORIO.split(",");

  // Validação de cargo (enviado pelo front-end na requisição)
  const userCargos = req.body.userCargos || [];
  const temPermissao = userCargos.some((cargo) =>
    cargosPermitidos.includes(cargo)
  );

  if (!temPermissao) return res.status(403).json({ error: "Acesso negado." });

  try {
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

    // Função para buscar mensagens de um canal
    async function fetchMessages(channelId) {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
        {
          headers: { Authorization: `Bot ${Discord_Bot_Token}` },
        }
      );
      return await response.json();
    }

    // Buscamos em todos os canais relevantes
    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID]; // Adicione outros se houver
    let todasMensagens = [];

    for (const id of canais) {
      const msgs = await fetchMessages(id);
      todasMensagens = todasMensagens.concat(msgs);
    }

    const relatorio = {};

    todasMensagens.forEach((msg) => {
      const dataMsg = new Date(msg.timestamp);
      if (dataMsg < seteDiasAtras) return;

      // Identifica o oficial (autor ou menção no embed)
      const oficial = msg.mentions[0]?.username || msg.author.username;
      if (!relatorio[oficial])
        relatorio[oficial] = {
          emissao: 0,
          revogacao: 0,
          limpeza: 0,
          renovacao: 0,
        };

      const content = msg.content.toUpperCase();
      const title = msg.embeds[0]?.title?.toUpperCase() || "";

      if (title.includes("PORTE EMITIDO")) relatorio[oficial].emissao++;
      if (title.includes("REVOGADO")) relatorio[oficial].revogacao++;
      if (title.includes("LIMPEZA")) relatorio[oficial].limpeza++;
      if (title.includes("RENOVAÇÃO")) relatorio[oficial].renovacao++;
    });

    res.status(200).json(relatorio);
  } catch (error) {
    res.status(500).json({ error: "Falha ao gerar relatório" });
  }
};

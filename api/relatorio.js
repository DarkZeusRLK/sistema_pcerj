export default async function handler(req, res) {
  // Configurações de CORS para evitar bloqueios
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

  // 1. CORREÇÃO: Receber 'roles' (igual ao frontend) em vez de 'userCargos'
  const { roles } = req.body || {};

  // Validação de segurança
  const listaPermitida = (CARGOS_ADMIN_RELATORIO || "")
    .split(",")
    .map((c) => c.trim());
  const temPermissao = roles && roles.some((r) => listaPermitida.includes(r));

  if (!temPermissao) {
    return res
      .status(403)
      .json({ error: "Acesso negado: Cargos insuficientes." });
  }

  try {
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

    // Função para buscar mensagens
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      try {
        const response = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
          { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
        );
        if (!response.ok) {
          console.error(`Erro ao ler canal ${channelId}: ${response.status}`);
          return [];
        }
        return await response.json();
      } catch (e) {
        console.error("Erro fetch:", e);
        return [];
      }
    }

    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID];
    let todasMensagens = [];

    for (const id of canais) {
      const msgs = await fetchMessages(id);
      if (Array.isArray(msgs)) {
        todasMensagens = todasMensagens.concat(msgs);
      }
    }

    const relatorio = {};

    todasMensagens.forEach((msg) => {
      // Filtro de Data
      const dataMsg = new Date(msg.timestamp);
      if (dataMsg < seteDiasAtras) return;

      // 2. CORREÇÃO: Ler o oficial de dentro do Embed (Fields)
      // O Bot é o autor, então não podemos usar msg.author
      let oficialNome = "Desconhecido";

      if (msg.embeds && msg.embeds.length > 0) {
        const embed = msg.embeds[0];

        // Procura nos campos do embed por "Oficial" ou "Revogado por"
        const campoOficial = embed.fields?.find(
          (f) => f.name.includes("Oficial") || f.name.includes("Revogado por")
        );

        if (campoOficial) {
          // Tenta limpar a string para pegar o nome ou ID
          // Se for menção <@123>, tenta achar no array de mentions para pegar o username real
          const valor = campoOficial.value;
          const matchId = valor.match(/<@!?(\d+)>/);

          if (matchId) {
            const idProcurado = matchId[1];
            // Tenta achar o usuário na lista de menções da mensagem para pegar o nome bonito
            const userObj = msg.mentions.find((u) => u.id === idProcurado);
            oficialNome = userObj ? userObj.username : valor; // Se não achar, usa a menção bruta
          } else {
            oficialNome = valor.replace(/\*\*/g, "").trim(); // Remove negrito (**Nome**)
          }
        }
      } else {
        // Fallback: Se não tiver embed, ignora ou usa autor (cuidado com mensagens do bot)
        return;
      }

      // Inicializa o objeto do oficial se não existir
      if (!relatorio[oficialNome]) {
        relatorio[oficialNome] = {
          emissao: 0,
          revogacao: 0,
          limpeza: 0,
          renovacao: 0,
        };
      }

      const title = msg.embeds[0]?.title?.toUpperCase() || "";

      // Contagem baseada no Título do Embed
      if (title.includes("PORTE EMITIDO") || title.includes("NOVO PORTE"))
        relatorio[oficialNome].emissao++;
      if (title.includes("REVOGADO")) relatorio[oficialNome].revogacao++;
      if (title.includes("LIMPEZA")) relatorio[oficialNome].limpeza++;
      if (title.includes("RENOVAÇÃO")) relatorio[oficialNome].renovacao++;
    });

    res.status(200).json(relatorio);
  } catch (error) {
    console.error("Erro geral no relatório:", error);
    res.status(500).json({ error: "Falha interna ao gerar relatório." });
  }
}

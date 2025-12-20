// api/relatorio.js
import fetch from "node-fetch"; // 👈 Certifique-se de que o node-fetch está instalado

export default async function handler(req, res) {
  // Configuração de CORS
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

  // Validação de Segurança básica
  if (!Discord_Bot_Token) {
    console.error(
      "ERRO: Discord_Bot_Token não configurado nas variáveis de ambiente."
    );
    return res
      .status(500)
      .json({ error: "Configuração do servidor incompleta." });
  }

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
    const statsPorID = {};

    // Função auxiliar para buscar mensagens
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
      const response = await fetch(url, {
        headers: { Authorization: `Bot ${Discord_Bot_Token}` },
      });
      if (!response.ok) {
        console.error(`Erro ao buscar canal ${channelId}: ${response.status}`);
        return [];
      }
      return await response.json();
    }

    const canais = [CHANNEL_PORTE_ID, CHANNEL_LOGS_ID].filter(Boolean);

    for (const channelId of canais) {
      const msgs = await fetchMessages(channelId);

      msgs.forEach((msg) => {
        const dataMsg = new Date(msg.timestamp);
        if (dataMsg < startObj || dataMsg > endObj) return;
        if (!msg.embeds || msg.embeds.length === 0) return;

        const embed = msg.embeds[0];
        const title = (embed.title || "").toUpperCase();

        // Busca o ID do oficial no campo do Embed
        let oficialId = null;
        const campoOficial = embed.fields?.find((f) =>
          /OFICIAL|RESPONSÁVEL|REVOGADO POR|RENOVADO POR/i.test(f.name)
        );

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

        // Categorização (Normalizada para evitar erros de acento)
        const t = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (t.includes("EMISSAO") || t.includes("EMITIDO"))
          statsPorID[oficialId].emissao++;
        else if (t.includes("REVOGA")) statsPorID[oficialId].revogacao++;
        else if (t.includes("LIMPEZA") || t.includes("ANTECEDENTES"))
          statsPorID[oficialId].limpeza++;
        else if (t.includes("RENOVACAO") || t.includes("RENOVADO"))
          statsPorID[oficialId].renovacao++;
      });
    }

    // Resolver nomes dos oficiais
    const idsEncontrados = Object.keys(statsPorID);
    const mapaNomes = {};

    await Promise.all(
      idsEncontrados.map(async (userId) => {
        try {
          const resMember = await fetch(
            `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${userId}`,
            { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
          );
          if (resMember.ok) {
            const memberData = await resMember.json();
            mapaNomes[userId] =
              memberData.nick ||
              memberData.user.global_name ||
              memberData.user.username;
          } else {
            mapaNomes[userId] = `ID: ${userId}`;
          }
        } catch {
          mapaNomes[userId] = `ID: ${userId}`;
        }
      })
    );

    const relatorioFinal = {};
    idsEncontrados.forEach((id) => {
      relatorioFinal[mapaNomes[id]] = statsPorID[id];
    });

    res.status(200).json(relatorioFinal);
  } catch (error) {
    console.error("Erro no Handler:", error);
    res
      .status(500)
      .json({ error: "Erro interno no processamento do relatório." });
  }
}

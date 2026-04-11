const fetch = require("node-fetch");
const { requireAdmin } = require("../admin");

const PAGE_SIZE = 20;

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanValue(text) {
  return String(text || "")
    .replace(/[*`]/g, "")
    .trim();
}

function extractMentionId(value) {
  const match = String(value || "").match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function findField(fields, key) {
  const keyNorm = normalize(key);
  const field = (fields || []).find((item) =>
    normalize(item.name).includes(keyNorm)
  );
  return field ? cleanValue(field.value) : null;
}

function formatDateInfo(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { data: "N/A", horario: "N/A" };
  }

  return {
    data: date.toLocaleDateString("pt-BR"),
    horario: date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

async function fetchAllMessages(channelId, botToken) {
  const mensagens = [];
  let before = null;

  while (true) {
    const params = new URLSearchParams({ limit: "100" });
    if (before) params.set("before", before);

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?${params.toString()}`,
      {
        headers: { Authorization: `Bot ${botToken}` },
      }
    );

    if (response.status === 429) {
      const data = await response.json().catch(() => null);
      const waitMs = Math.ceil((data?.retry_after || 1) * 1000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Erro ao buscar mensagens do Discord: ${text}`);
    }

    const batch = await response.json();
    mensagens.push(...batch);

    if (batch.length < 100) break;
    before = batch[batch.length - 1].id;
  }

  return mensagens;
}

function parsePorteLog(message) {
  const embed = message.embeds?.[0];
  if (!embed) return null;

  const fields = embed.fields || [];
  const oficial = findField(fields, "Oficial");
  const armamento = findField(fields, "Armamento") || "N/A";
  const oficialId = extractMentionId(oficial) || "N/A";
  const { data, horario } = formatDateInfo(embed.timestamp || message.timestamp);

  if (!oficial) return null;

  return {
    id: message.id,
    tipo: "Porte",
    itemEmitido: armamento,
    emitidoPor: oficial,
    emitidoPorIdDiscord: oficialId,
    data,
    horario,
  };
}

function compareDiscordIdsDesc(a, b) {
  const idA = BigInt(a.id);
  const idB = BigInt(b.id);
  if (idA === idB) return 0;
  return idA > idB ? -1 : 1;
}

function parseLimpezaLog(message) {
  const embed = message.embeds?.[0];
  if (!embed) return null;

  const titleNorm = normalize(embed.title);
  if (!titleNorm.includes("certificado de bons antecedentes")) return null;

  const fields = embed.fields || [];
  const oficial = findField(fields, "Oficial");
  const oficialId = extractMentionId(oficial) || "N/A";
  const { data, horario } = formatDateInfo(embed.timestamp || message.timestamp);

  if (!oficial) return null;

  return {
    id: message.id,
    tipo: "Limpeza",
    itemEmitido: "LIMPEZA",
    emitidoPor: oficial,
    emitidoPorIdDiscord: oficialId,
    data,
    horario,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "X-Session-User-Id");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await requireAdmin(req);

    const botToken = process.env.Discord_Bot_Token;
    const porteChannelId = process.env.CHANNEL_PORTE_ID;
    const limpezaChannelId = process.env.CHANNEL_LIMPEZA_ID;

    if (!botToken || !porteChannelId || !limpezaChannelId) {
      return res.status(500).json({ error: "Configuracao de logs incompleta." });
    }

    const page = Math.max(parseInt(req.query?.page || "1", 10) || 1, 1);

    const [porteMessages, limpezaMessages] = await Promise.all([
      fetchAllMessages(porteChannelId, botToken),
      fetchAllMessages(limpezaChannelId, botToken),
    ]);

    const logs = [
      ...porteMessages.map(parsePorteLog),
      ...limpezaMessages.map(parseLimpezaLog),
    ]
      .filter(Boolean)
      .sort(compareDiscordIdsDesc);

    const totalItems = logs.length;
    const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const items = logs.slice(start, start + PAGE_SIZE);

    return res.status(200).json({
      items,
      pagination: {
        page: currentPage,
        pageSize: PAGE_SIZE,
        totalItems,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

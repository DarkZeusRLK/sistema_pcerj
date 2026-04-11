const fetch = require("node-fetch");

function parseRoles(value) {
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function getMemberRoles(userId) {
  const botToken = process.env.Discord_Bot_Token;
  const guildId = process.env.Discord_Guild_ID;

  if (!botToken || !guildId) {
    const error = new Error("Configuracao do Discord incompleta.");
    error.status = 500;
    throw error;
  }

  if (!userId) {
    const error = new Error("ID do usuario nao informado.");
    error.status = 401;
    throw error;
  }

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    {
      headers: { Authorization: `Bot ${botToken}` },
    }
  );

  if (response.status === 404) {
    const error = new Error("Usuario nao esta mais no servidor.");
    error.status = 403;
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Erro ao consultar membro: ${text}`);
    error.status = 500;
    throw error;
  }

  const member = await response.json();
  return member.roles || [];
}

async function requireAdmin(req) {
  const adminRoles = parseRoles(process.env.ADMIN_ROLES);

  if (adminRoles.length === 0) {
    const error = new Error("ADMIN_ROLES nao configurado.");
    error.status = 500;
    throw error;
  }

  const userId =
    req.headers["x-session-user-id"] ||
    req.query?.userId ||
    req.body?.userId ||
    null;

  const userRoles = await getMemberRoles(userId);
  const isAdmin = userRoles.some((role) => adminRoles.includes(role));

  if (!isAdmin) {
    const error = new Error("Acesso restrito a cargos administrativos.");
    error.status = 403;
    throw error;
  }

  return { userId, userRoles, adminRoles };
}

module.exports = {
  parseRoles,
  getMemberRoles,
  requireAdmin,
};

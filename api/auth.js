const parseRoles = (value) =>
  (value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

async function resolveUserData(userToken, userId) {
  if (userToken) {
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: userToken },
    });

    if (!userRes.ok) {
      const error = new Error("Token do usuario invalido/expirado.");
      error.status = 401;
      throw error;
    }

    return userRes.json();
  }

  if (!userId) {
    const error = new Error("Sessao sem identificacao do usuario.");
    error.status = 401;
    throw error;
  }

  return {
    id: userId,
    username: "Usuario Discord",
    avatar: null,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-User-Id"
  );

  if (req.method === "OPTIONS") return res.status(200).end();

  const userToken = req.headers.authorization;
  const sessionUserId =
    req.headers["x-session-user-id"] || req.query?.userId || null;

  const botToken = process.env.Discord_Bot_Token;
  const guildId = process.env.Discord_Guild_ID;
  const roleIdEnv = process.env.Discord_Role_ID;
  const pfRolesEnv = process.env.PF_ROLES_IDS;

  if (!botToken) {
    return res.status(500).json({ error: "DEBUG: Faltando Discord_Bot_Token" });
  }

  if (!guildId) {
    return res.status(500).json({ error: "DEBUG: Faltando Discord_Guild_ID" });
  }

  const cargosPermitidosPC = parseRoles(roleIdEnv);
  const cargosPermitidosPF = parseRoles(pfRolesEnv);

  if (cargosPermitidosPC.length === 0 && cargosPermitidosPF.length === 0) {
    return res.status(500).json({
      error: "DEBUG: Faltando Discord_Role_ID e/ou PF_ROLES_IDS",
    });
  }

  if (!userToken && !sessionUserId) {
    return res
      .status(401)
      .json({ error: "Token do usuario ou ID da sessao nao chegou." });
  }

  try {
    const userData = await resolveUserData(userToken, sessionUserId);

    const memberUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${userData.id}`;
    const memberRes = await fetch(memberUrl, {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (memberRes.status === 404) {
      return res.status(403).json({
        error: `DEBUG: O usuario ${userData.username} nao esta no servidor (ID: ${guildId}).`,
      });
    }

    if (!memberRes.ok) {
      const erroTexto = await memberRes.text();
      return res.status(500).json({
        error: `DEBUG: Erro ao buscar membro. Status: ${memberRes.status}. Msg: ${erroTexto}`,
      });
    }

    const memberData = await memberRes.json();
    const userRoles = memberData.roles || [];

    const temAcessoPC = userRoles.some((roleDoUsuario) =>
      cargosPermitidosPC.includes(roleDoUsuario)
    );
    const temAcessoPF = userRoles.some((roleDoUsuario) =>
      cargosPermitidosPF.includes(roleDoUsuario)
    );

    if (temAcessoPC || temAcessoPF) {
      return res.status(200).json({
        authorized: true,
        username: memberData.user?.username || userData.username,
        avatar: memberData.user?.avatar ?? userData.avatar ?? null,
        id: userData.id,
        roles: userRoles,
        org: temAcessoPF ? "PF" : "PCERJ",
        checkedAt: new Date().toISOString(),
      });
    }

    return res.status(403).json({
      error: `DEBUG (Acesso Negado): O usuario nao possui nenhum dos cargos permitidos. \nCargos Permitidos (PCERJ): [${cargosPermitidosPC.join(
        ", "
      )}] \nCargos Permitidos (PF): [${cargosPermitidosPF.join(
        ", "
      )}] \nCargos do Usuario: [${userRoles.join(", ")}]`,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: "Erro interno: " + error.message,
    });
  }
}

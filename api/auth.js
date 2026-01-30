export default async function handler(req, res) {
  // Configurações padrão
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const userToken = req.headers.authorization;

  // Variáveis da Vercel
  const botToken = process.env.Discord_Bot_Token;
  const guildId = process.env.Discord_Guild_ID;
  const roleIdEnv = process.env.Discord_Role_ID; // PCERJ
  const pfRolesEnv = process.env.PF_ROLES_IDS; // PF

  // 1. CHECAGEM DE VARIÁVEIS
  if (!botToken)
    return res.status(500).json({ error: "DEBUG: Faltando Discord_Bot_Token" });
  if (!guildId)
    return res.status(500).json({ error: "DEBUG: Faltando Discord_Guild_ID" });
  const parseRoles = (value) =>
    (value || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

  const cargosPermitidosPC = parseRoles(roleIdEnv);
  const cargosPermitidosPF = parseRoles(pfRolesEnv);

  if (cargosPermitidosPC.length === 0 && cargosPermitidosPF.length === 0) {
    return res.status(500).json({
      error: "DEBUG: Faltando Discord_Role_ID e/ou PF_ROLES_IDS",
    });
  }

  if (!userToken)
    return res.status(401).json({ error: "Token do usuário não chegou." });

  try {
    // 2. DESCOBRIR QUEM É O USUÁRIO
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: userToken },
    });

    if (!userRes.ok)
      return res
        .status(401)
        .json({ error: "Token do usuário inválido/expirado." });
    const userData = await userRes.json();

    // 3. PERGUNTAR PRO DISCORD QUAIS CARGOS ELE TEM
    const memberUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${userData.id}`;
    const memberRes = await fetch(memberUrl, {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (memberRes.status === 404) {
      return res.status(403).json({
        error: `DEBUG: O usuário ${userData.username} NÃO está no servidor (ID: ${guildId}). O Bot está no servidor correto?`,
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

    // -----------------------------------------------------------
    // 4. A HORA DA VERDADE (ADAPTADO PARA MÚLTIPLOS CARGOS)
    // -----------------------------------------------------------

    const temAcessoPC = userRoles.some((roleDoUsuario) =>
      cargosPermitidosPC.includes(roleDoUsuario)
    );
    const temAcessoPF = userRoles.some((roleDoUsuario) =>
      cargosPermitidosPF.includes(roleDoUsuario)
    );
    const temAcesso = temAcessoPC || temAcessoPF;

    if (temAcesso) {
      // SUCESSO
      return res.status(200).json({
        authorized: true,
        username: userData.username,
        avatar: userData.avatar,
        id: userData.id,
        roles: userRoles, // Envia lista de cargos para o frontend (Importante para o relatório)
        org: temAcessoPF ? "PF" : "PCERJ",
      });
    } else {
      // FALHA
      return res.status(403).json({
        error: `DEBUG (Acesso Negado): O usuário não possui nenhum dos cargos permitidos. \nCargos Permitidos (PCERJ): [${cargosPermitidosPC.join(
          ", "
        )}] \nCargos Permitidos (PF): [${cargosPermitidosPF.join(
          ", "
        )}] \nCargos do Usuário: [${userRoles.join(", ")}]`,
      });
    }
  } catch (error) {
    return res.status(500).json({ error: "Erro interno: " + error.message });
  }
}

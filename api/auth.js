export default async function handler(req, res) {
  // Configurações de segurança (CORS)
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Pega o token do usuário vindo do site
  const userToken = req.headers.authorization;

  // Pega as chaves secretas da Vercel
  const botToken = process.env.Discord_Bot_Token;
  const guildId = process.env.Discord_Guild_ID;
  const roleId = process.env.Discord_Role_ID; // ID do Cargo da PCERJ

  if (!botToken || !guildId || !roleId) {
    return res.status(500).json({
      error: "Erro de Configuração: Variáveis de Ambiente faltando na Vercel.",
    });
  }

  if (!userToken) {
    return res.status(401).json({ error: "Token de usuário não fornecido." });
  }

  try {
    // 1. Descobre quem é o usuário que está tentando logar
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: userToken }, // Usa o token do usuário ("Bearer ...")
    });

    if (!userRes.ok)
      return res.status(401).json({ error: "Token inválido ou expirado." });
    const userData = await userRes.json();

    // 2. Verifica se ele está no servidor e tem o CARGO usando o BOT
    const memberUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${userData.id}`;
    const memberRes = await fetch(memberUrl, {
      headers: { Authorization: `Bot ${botToken}` }, // Usa o token do BOT aqui
    });

    if (memberRes.status === 404) {
      return res
        .status(403)
        .json({ error: "Você não está no servidor do Discord da Polícia." });
    }

    const memberData = await memberRes.json();

    // 3. Verifica se o array de cargos contém o ID da PCERJ
    if (memberData.roles && memberData.roles.includes(roleId)) {
      // SUCESSO!
      return res.status(200).json({
        authorized: true,
        username: userData.username,
        avatar: userData.avatar,
        id: userData.id,
      });
    } else {
      // FALHA: Está no servidor, mas sem o cargo
      return res
        .status(403)
        .json({ error: "Acesso Negado: Você não possui a tag da PCERJ." });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Erro interno no servidor de autenticação." });
  }
}

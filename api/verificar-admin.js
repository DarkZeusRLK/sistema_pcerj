module.exports = async (req, res) => {
  // 1. Pega os cargos que o usuário tem (enviados pelo front)
  const { roles } = req.body || {};

  // 2. Pega a lista do seu .env
  const ENV_CARGOS = process.env.CARGOS_ADMIN_RELATORIO || "";

  // 3. Transforma a string do .env em uma lista (array) limpa
  // O split(',') separa por vírgula e o trim() remove espaços em branco se houver
  const cargosPermitidos = ENV_CARGOS.split(",").map((id) => id.trim());

  console.log("Cargos Permitidos:", cargosPermitidos);
  console.log("Cargos do Usuário:", roles);

  // 4. Verificação de Segurança
  if (!roles || !Array.isArray(roles)) {
    return res.status(200).json({ isAdmin: false });
  }

  // 5. Verifica se o usuário tem ALGUM dos cargos permitidos
  // A função .some() retorna true se pelo menos um item coincidir
  const isAdmin = roles.some((userRole) => cargosPermitidos.includes(userRole));

  // 6. Responde para o site
  return res.status(200).json({ isAdmin });
};

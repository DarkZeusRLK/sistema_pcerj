// api/deletar.js
module.exports = async (req, res) => {
  // 1. Log para saber que a função foi chamada
  console.log("🔄 API DELETAR INICIADA");

  // Apenas aceita POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message_id } = req.body;

    // 2. Pega as credenciais
    const Bot_Token = process.env.Discord_Bot_Token;
    const CHANNEL_PORTE_ID = process.env.CHANNEL_PORTE_ID;

    // Logs de Debug (Não mostre o Token inteiro por segurança)
    console.log("🆔 Message ID recebido:", message_id);
    console.log(
      "📺 Channel ID configurado:",
      CHANNEL__PORTE_ID ? "Sim" : "Não"
    );
    console.log("🤖 Bot Token configurado:", Bot_Token ? "Sim" : "Não");

    // 3. Validação
    if (!message_id) {
      console.error("❌ Erro: Message ID faltando.");
      return res.status(400).json({ error: "Message ID não fornecido." });
    }

    if (!CHANNEL_ID || !Bot_Token) {
      console.error("❌ Erro: Variáveis de ambiente faltando na Vercel.");
      return res.status(500).json({
        error:
          "Configuração do servidor incompleta (Falta Token ou Channel ID).",
      });
    }

    // 4. Chama a API do Discord
    console.log(
      `🗑️ Tentando deletar mensagem ${message_id} no canal ${CHANNEL_PORTE_ID}...`
    );

    const response = await fetch(
      `https://discord.com/api/v10/channels/${CHANNEL_PORTE_ID}/messages/${message_id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bot ${Bot_Token}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 5. Verifica o resultado
    if (response.ok) {
      console.log("✅ Sucesso: Mensagem deletada.");
      return res.status(200).json({ success: true });
    } else if (response.status === 404) {
      console.log("⚠️ Aviso: Mensagem já não existia (404).");
      return res
        .status(200)
        .json({ success: true, note: "Mensagem já estava apagada." });
    } else {
      const errorText = await response.text();
      console.error("❌ Erro do Discord:", response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }
  } catch (error) {
    console.error("❌ Erro Interno Crítico:", error);
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
};

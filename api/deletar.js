export default async function handler(req, res) {
  // 1. Apenas aceita POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message_id } = req.body;

    // 2. Pega as credenciais das Variáveis de Ambiente
    const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

    // IMPORTANTE: Este ID deve ser do canal onde os PORTES ATIVOS são postados
    // Se você usa o mesmo canal para tudo, use a mesma variável.
    // Se usa canais separados, crie uma variável específica para o canal de "Ativos".
    const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

    // 3. Validação Básica
    if (!message_id) {
      return res.status(400).json({ error: "Message ID não fornecido." });
    }

    if (!CHANNEL_ID || !BOT_TOKEN) {
      return res.status(500).json({
        error: "Configuração de API incompleta (Token ou Channel ID).",
      });
    }

    // 4. Chama a API do Discord para Deletar
    // Endpoint: DELETE /channels/{channel.id}/messages/{message.id}
    const response = await fetch(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages/${message_id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 5. Verifica o resultado
    if (response.ok) {
      return res.status(200).json({ success: true });
    } else if (response.status === 404) {
      // Se der 404, a mensagem já não existe mais (já foi apagada), então consideramos sucesso.
      return res
        .status(200)
        .json({ success: true, note: "Mensagem já estava apagada." });
    } else {
      const errorText = await response.text();
      console.error("Erro ao deletar no Discord:", errorText);
      return res.status(response.status).json({ error: errorText });
    }
  } catch (error) {
    console.error("Erro interno:", error);
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
}

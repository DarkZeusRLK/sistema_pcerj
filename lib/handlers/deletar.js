// api/deletar.js
module.exports = async (req, res) => {
  console.log("🔄 API DELETAR INICIADA");

  // Apenas aceita POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let body = req.body;

    if (!body || Buffer.isBuffer(body)) {
      body = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const raw = Buffer.concat(chunks).toString("utf8");
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            reject(error);
          }
        });
        req.on("error", reject);
      });
    } else if (typeof body === "string") {
      body = body ? JSON.parse(body) : {};
    }

    const { message_id } = body || {};

    // 👇 AQUI ESTAVA O ERRO: AGORA USA OS NOMES CERTOS
    const BOT_TOKEN = process.env.Discord_Bot_Token;
    const CHANNEL_ID = process.env.CHANNEL_PORTE_ID;

    // Debug nos logs da Vercel
    console.log("🆔 Msg ID:", message_id);
    console.log("📺 Channel:", CHANNEL_ID ? "Configurado (OK)" : "Faltando");
    console.log("🤖 Token:", BOT_TOKEN ? "Configurado (OK)" : "Faltando");

    // Validação
    if (!message_id) {
      return res.status(400).json({ error: "Message ID não fornecido." });
    }

    if (!CHANNEL_ID || !BOT_TOKEN) {
      console.error("❌ ERRO: Variáveis de ambiente faltando na Vercel.");
      return res.status(500).json({
        error: "Configuração incompleta. Verifique as Variáveis de Ambiente.",
      });
    }

    // Chama a API do Discord para apagar
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

    if (response.ok) {
      console.log("✅ Mensagem apagada com sucesso!");
      return res.status(200).json({ success: true });
    } else if (response.status === 404) {
      console.log("?? Mensagem já não existia.");
      return res
        .status(200)
        .json({ success: true, note: "Já estava apagada." });
    } else {
      const errorText = await response.text();
      console.error("❌ Erro Discord:", response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }
  } catch (error) {
    console.error("❌ Erro Interno:", error);
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
};

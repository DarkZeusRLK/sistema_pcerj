// api/enviar.js
import Busboy from "busboy";
import FormData from "form-data";
import fetch from "node-fetch";

// Desativa o parser padrão da Vercel para podermos processar o arquivo manualmente
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método não permitido" });

  const busboy = Busboy({ headers: req.headers });
  const discordForm = new FormData();

  // Variáveis para guardar os dados enquanto processa
  let payloadJson = null;
  let channelId = null;

  // Mapeamento
  const CANAIS = {
    porte: process.env.CHANNEL_PORTE_ID,
    revogacao: process.env.CHANNEL_REVOGACAO_ID,
    limpeza: process.env.CHANNEL_LIMPEZA_ID,
  };

  const { tipo } = req.query;
  channelId = CANAIS[tipo];

  // 1. Processa Arquivos (Imagem)
  busboy.on("file", (fieldname, file, filename) => {
    discordForm.append("file", file, filename.filename);
  });

  // 2. Processa Campos (JSON do Embed)
  busboy.on("field", (fieldname, val) => {
    if (fieldname === "payload_json") {
      discordForm.append("payload_json", val);
    }
  });

  // 3. Quando terminar de ler tudo, envia pro Discord
  busboy.on("finish", async () => {
    if (!process.env.Discord_Bot_Token || !channelId) {
      return res
        .status(500)
        .json({ error: "Configuração de Token ou Canal inválida." });
    }

    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${process.env.Discord_Bot_Token}`,
            ...discordForm.getHeaders(), // Importante: Headers do form-data
          },
          body: discordForm,
        }
      );

      if (!response.ok) {
        const erroAPI = await response.text();
        console.error("Erro Discord Enviar:", erroAPI);
        return res.status(500).json({ error: erroAPI });
      }

      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      console.error("Erro Fetch:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Inicia o processamento
  req.pipe(busboy);
}

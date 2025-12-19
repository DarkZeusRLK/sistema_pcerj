import Busboy from "busboy";
import FormData from "form-data";
import fetch from "node-fetch";

// Desativa o processamento automático da Vercel para lidarmos com o arquivo manualmente
export const config = {
  api: { bodyParser: false },
};

export default function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método inválido" });

  const busboy = Busboy({ headers: req.headers });
  const discordForm = new FormData();
  let channelId = "";

  // Mapeamento dos canais (Suas variáveis)
  const CANAIS = {
    porte: process.env.CHANNEL_PORTE_ID,
    revogacao: process.env.CHANNEL_REVOGACAO_ID,
    limpeza: process.env.CHANNEL_LIMPEZA_ID,
  };

  // 1. Pega o tipo da URL (?tipo=revogacao)
  const { tipo } = req.query;
  channelId = CANAIS[tipo];

  // 2. Processa o arquivo (imagem)
  busboy.on("file", (name, file, info) => {
    discordForm.append("file", file, info.filename);
  });

  // 3. Processa os campos de texto (o JSON do embed)
  busboy.on("field", (name, val) => {
    if (name === "payload_json") discordForm.append("payload_json", val);
  });

  // 4. Quando terminar de ler, envia pro Discord
  busboy.on("finish", async () => {
    if (!channelId || !process.env.Discord_Bot_Token) {
      return res
        .status(500)
        .json({ error: "Configuração de Canal ou Token faltando." });
    }

    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${process.env.Discord_Bot_Token}`,
            ...discordForm.getHeaders(), // Headers obrigatórios para arquivos
          },
          body: discordForm,
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return res.status(500).json({ error: text });
      }

      const data = await response.json();
      res.status(200).json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  req.pipe(busboy);
}

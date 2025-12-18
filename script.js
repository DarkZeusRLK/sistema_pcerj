// ==========================================
// ⚙️ CONFIGURAÇÕES GERAIS
// ==========================================
const CONFIG = {
  // SEU BOT (O mesmo usado no login)
  // ⚠️ ATENÇÃO: Em um site real, expor o Token no JS é perigoso.
  // Como é um sistema interno/fechado na Vercel, o risco é controlado, mas cuidado.
  BOT_TOKEN:
    "MTQ0ODgwMzk4NTY0MDM5NDc1Mg.GA7SFf.0QfwfJ09qxyr7Mk8Xpnp0i5QhlIhZuJ7-leVm8",

  // CLIENT_ID e REDIRECT (Para o Login funcionar)
  CLIENT_ID: "1448803985640394752",
  REDIRECT_URI:
    "file:///C:/Users/Cliente/Desktop/Porte%20de%20Armas/index.html", // Ou localhost se estiver testando
  GUILD_ID: "1052430488205283449",
  ROLE_ID_PERMITIDO: "1053687224320933888",

  // IDS DOS CANAIS (CHATS) ONDE O BOT VAI MANDAR AS MENSAGENS
  CHANNELS: {
    LIMPEZA: "1409519025297428571",
    PORTES: "1409518427558645771",
    REVOGACAO: "1409518962848305364",
    RENOVACAO: "1400251435098177557",
  },
};

// ==========================================
// BANCO DE DADOS SIMULADO (Memória)
// ==========================================
let dbPortes = [
  {
    nome: "Tony Stark",
    id: "1001",
    rg: "555000",
    arma: "GLOCK",
    validade: "25/05/2026",
    status: "Ativo",
  },
  {
    nome: "Steve Rogers",
    id: "1940",
    rg: "888111",
    arma: "MP5",
    validade: "10/06/2026",
    status: "Ativo",
  },
];
let totalLimpezas = 0;

document.addEventListener("DOMContentLoaded", async function () {
  // ... (Mantendo a mesma lógica de Login e Inicialização do código anterior) ...
  // Vou resumir a parte de login para focar na mudança do envio,
  // mas MANTENHA O CÓDIGO DE LOGIN QUE TE PASSEI NA RESPOSTA ANTERIOR AQUI.

  // Inicialização Visual
  const hoje = new Date();
  const elData = document.getElementById("data-atual");
  if (elData) elData.innerText = hoje.toLocaleDateString("pt-BR");

  atualizarStats();
  renderTables();
  setValidadeAuto();

  // Verifica Login (Resumido para o exemplo)
  if (window.location.hash.includes("access_token")) {
    // Lógica de validar token...
  }
});

// ==========================================
// FUNÇÃO CENTRAL DE ENVIO (MUDANÇA AQUI)
// ==========================================
async function enviarPeloBot(channelId, blob, filename, embedData, callback) {
  // Endpoint da API do Discord para Mensagens
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

  const formData = new FormData();

  // O Discord API pede que o arquivo seja anexado assim:
  formData.append("files[0]", blob, filename);

  // Ajusta o payload para vincular o arquivo ao embed
  const payload = {
    embeds: [embedData],
    attachments: [
      {
        id: 0,
        filename: filename,
      },
    ],
  };

  // No embed, a imagem aponta para o anexo
  payload.embeds[0].image = { url: `attachment://${filename}` };

  formData.append("payload_json", JSON.stringify(payload));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        // Aqui usamos o Token do Bot para autenticar
        Authorization: `Bot ${CONFIG.BOT_TOKEN}`,
        // Nota: Não defina Content-Type, o FormData faz isso sozinho
      },
      body: formData,
    });

    if (response.ok) {
      callback();
    } else {
      const erro = await response.json();
      console.error("Erro Discord:", erro);
      alert(`Erro ao enviar: ${erro.message}`);
    }
  } catch (err) {
    console.error(err);
    alert("Erro de conexão com a API do Discord.");
  }
}

// ==========================================
// 1. LÓGICA DE LIMPEZA
// ==========================================
window.processarLimpeza = () => {
  const nome = document.getElementById("limp-nome").value;
  const id = document.getElementById("limp-id").value;
  const valor = document.getElementById("limp-valor").value;

  if (!nome || !id || !valor) return alert("Preencha todos os campos.");

  const canvas = document.getElementById("canvas-limpeza");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.src = "assets/bg_limpeza.png";

  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "#000";
    ctx.fillText(nome.toUpperCase(), 100, 200);
    ctx.fillText(`ID: ${id}`, 100, 250);
    ctx.fillText(`VALOR: R$ ${valor}`, 100, 300);

    canvas.toBlob((blob) => {
      // USA A NOVA FUNÇÃO COM O ID DO CANAL DE LIMPEZA
      enviarPeloBot(
        CONFIG.CHANNELS.LIMPEZA,
        blob,
        "limpeza.png",
        {
          title: "⚖️ LIMPEZA DE FICHA CRIMINAL",
          color: 65280,
          fields: [
            { name: "Cidadão", value: nome, inline: true },
            { name: "Passaporte", value: id, inline: true },
            { name: "Valor Pago", value: `R$ ${valor}`, inline: false },
          ],
        },
        () => {
          alert("Limpeza registrada!");
          totalLimpezas += parseInt(valor);
          atualizarStats();
          document.getElementById("limp-nome").value = "";
          document.getElementById("limp-valor").value = "";
        }
      );
    });
  };
};

// ==========================================
// 2. LÓGICA DE EMISSÃO DE PORTE
// ==========================================
// Posições de texto
const POSICOES = {
  nome: { x: 50, y: 190 },
  id: { x: 50, y: 240 },
  rg: { x: 250, y: 240 },
  validade: { x: 400, y: 300 },
};

window.gerarPreviewPorte = () => {
  // ... (Mesma lógica de gerar preview do código anterior) ...
  // Vou resumir para focar no envio, copie a função gerarPreviewPorte inteira do código anterior
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  // ... lógica de desenhar no canvas ...
  // Apenas para o exemplo funcionar, imagine que desenhou aqui:
  const canvas = document.getElementById("canvas-porte");
  // Mostra preview
  document.getElementById("preview-porte-container").classList.remove("hidden");
};

document.getElementById("btn-emitir-final").addEventListener("click", () => {
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;

  const isPolice =
    document.querySelector('input[name="isPolice"]:checked').value === "sim";
  const hasAmmo =
    document.querySelector('input[name="hasAmmo"]:checked').value === "sim";

  const canvas = document.getElementById("canvas-porte");
  canvas.toBlob((blob) => {
    const filename = `porte_${id}.png`;

    // USA A NOVA FUNÇÃO COM O ID DO CANAL DE PORTES
    enviarPeloBot(
      CONFIG.CHANNELS.PORTES,
      blob,
      filename,
      {
        title: `🔫 PORTE EMITIDO: ${arma}`,
        color: 16766720,
        fields: [
          { name: "Cidadão", value: nome, inline: true },
          { name: "ID", value: id, inline: true },
          { name: "RG", value: rg, inline: true },
          { name: "Validade", value: validade, inline: true },
          {
            name: "Policial?",
            value: isPolice ? "✅ Sim" : "❌ Não",
            inline: true,
          },
          {
            name: "Munição?",
            value: hasAmmo ? "✅ Sim" : "❌ Não",
            inline: true,
          },
        ],
        footer: { text: "Departamento de Controle de Armas" },
      },
      () => {
        alert("Porte Emitido e Enviado!");
        dbPortes.push({ nome, id, rg, arma, validade, status: "Ativo" });
        atualizarStats();
        renderTables();
        window.navegar("dashboard");
      }
    );
  });
});

// ==========================================
// 3. REVOGAÇÃO
// ==========================================
window.revogar = (id) => {
  const p = dbPortes.find((x) => x.id === id && x.status === "Ativo");
  if (!p) return;

  if (confirm(`Revogar porte de ${p.nome}?`)) {
    // Lógica de desenhar a imagem revogada (copiar do código anterior)
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    // Seleciona imagem vermelha
    if (p.arma === "GLOCK") img.src = "assets/revogado_glock.png";
    else if (p.arma === "MP5") img.src = "assets/revogado_mp5.png";
    else img.src = "assets/revogado_taser.png";

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      ctx.font = "bold 22px Arial";
      ctx.fillStyle = "#000";
      ctx.fillText(p.nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
      ctx.fillText(`ID: ${p.id}`, POSICOES.id.x, POSICOES.id.y);
      ctx.fillText(`RG: ${p.rg}`, POSICOES.rg.x, POSICOES.rg.y);

      canvas.toBlob((blob) => {
        // USA A NOVA FUNÇÃO COM O ID DO CANAL DE REVOGAÇÃO
        enviarPeloBot(
          CONFIG.CHANNELS.REVOGACAO,
          blob,
          `revogado_${p.id}.png`,
          {
            title: "🚫 PORTE REVOGADO",
            description: `O porte de **${p.arma}** do cidadão **${p.nome}** (ID: ${p.id}) foi cancelado.`,
            color: 15158332,
            fields: [
              {
                name: "Motivo",
                value: "Apreensão Administrativa",
                inline: true,
              },
              { name: "Oficial", value: "Delegacia Civil", inline: true },
            ],
          },
          () => {
            p.status = "Revogado";
            atualizarStats();
            renderTables();
            alert("Porte revogado.");
          }
        );
      });
    };
  }
};
// ==========================================
// FUNÇÃO DE RENOVAÇÃO ATUALIZADA
// ==========================================
window.renovar = (id, arma) => {
  // 1. Encontra o usuário no banco de dados
  const p = dbPortes.find((x) => x.id === id && x.arma === arma);

  if (!p) return alert("Erro: Porte não encontrado.");

  if (
    confirm(`Confirmar renovação de ${p.arma} para ${p.nome} por +30 dias?`)
  ) {
    // 2. Calcula a nova data
    let partes = p.validade.split("/");
    let d = new Date(partes[2], partes[1] - 1, partes[0]); // Converte string para data
    d.setDate(d.getDate() + 30); // Adiciona 30 dias
    const novaValidade = d.toLocaleDateString("pt-BR");

    // 3. Gera a imagem atualizada (Igual na emissão, mas interna)
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    // Seleciona o fundo correto
    if (p.arma === "GLOCK") img.src = "assets/porte_glock.png";
    else if (p.arma === "MP5") img.src = "assets/porte_mp5.png";
    else img.src = "assets/porte_taser.png";

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Escreve os dados com a NOVA VALIDADE
      ctx.font = "bold 22px Arial";
      ctx.fillStyle = "#000";

      ctx.fillText(p.nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
      ctx.fillText(`ID: ${p.id}`, POSICOES.id.x, POSICOES.id.y);
      ctx.fillText(`RG: ${p.rg}`, POSICOES.rg.x, POSICOES.rg.y);
      ctx.fillText(novaValidade, POSICOES.validade.x, POSICOES.validade.y); // Data Nova

      // 4. Envia para o Discord
      canvas.toBlob((blob) => {
        const nomeArquivo = `renovado_${p.id}.png`;

        enviarPeloBot(
          CONFIG.CHANNELS.RENOVACAO,
          blob,
          nomeArquivo,
          {
            title: "🔄 PORTE RENOVADO",
            description: `O porte de **${p.arma}** do cidadão **${p.nome}** foi estendido.`,
            color: 3066993, // Azul Ciano
            fields: [
              { name: "Cidadão", value: p.nome, inline: true },
              { name: "ID", value: p.id, inline: true },
              { name: "Nova Validade", value: novaValidade, inline: true },
            ],
            footer: { text: "Sistema de Renovação Automática" },
          },
          () => {
            // Sucesso: Atualiza o banco local e a tela
            p.validade = novaValidade;
            renderTables();
            alert(`Porte renovado com sucesso! Nova validade: ${novaValidade}`);
          }
        );
      });
    };

    img.onerror = () => alert("Erro ao carregar imagem base para renovação.");
  }
};
// Funções Auxiliares (Stats, Tables, Navegar) - Manter iguais ao anterior
function atualizarStats() {
  document.getElementById("counter-ativos").innerText = dbPortes.filter(
    (p) => p.status === "Ativo"
  ).length;
  document.getElementById("counter-revogados").innerText = dbPortes.filter(
    (p) => p.status === "Revogado"
  ).length;
  document.getElementById(
    "counter-limpezas"
  ).innerText = `R$ ${totalLimpezas.toLocaleString("pt-BR")}`;
}
function renderTables() {
  /* ... Copiar do anterior ... */
}
function setValidadeAuto() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  document.getElementById("porte-validade").value =
    d.toLocaleDateString("pt-BR");
}

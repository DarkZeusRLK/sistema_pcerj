// ==========================================
// ⚙️ CONFIGURAÇÕES GERAIS
// ==========================================
const CONFIG = {
  CLIENT_ID: "1451342682487259319",
  REDIRECT_URI: "https://sistema-emissao.vercel.app/",
};

// ==========================================
// 📍 CONFIGURAÇÃO DE POSIÇÕES (AJUSTE FINO)
// ==========================================
const POSICOES = {
  // X = Horizontal (Esquerda/Direita)
  // Y = Vertical (Cima/Baixo)

  nome: { x: 240, y: 310, max: 400 },
  id: { x: 740, y: 310 },

  // Linha de baixo
  rg: { x: 240, y: 440 },
  expedicao: { x: 500, y: 440 }, // <--- NOVA POSIÇÃO (Ajuste se ficar em cima de outro)
  validade: { x: 740, y: 440 },

  // Estilo da Fonte
  corTexto: "#000000",
  fonte: "bold 26px 'Arial'",
};

// Dados Mockados
let dbPortes = [
  {
    nome: "Tony Stark",
    id: "1001",
    rg: "555000",
    arma: "GLOCK",
    validade: "25/05/2026",
    status: "Ativo",
  },
];

// ==========================================
// 🚀 INICIALIZAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  const hash = window.location.hash;
  const isLoginPage = window.location.pathname.includes("login.html");

  // 1. Autenticação Discord
  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type");
    window.history.replaceState({}, document.title, window.location.pathname);
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
  } else {
    const sessao = localStorage.getItem("pc_session");
    if (sessao) {
      iniciarSistema(JSON.parse(sessao));
    } else if (!isLoginPage) {
      window.location.href = "login.html";
    }
  }

  // 2. Setup Inicial
  if (!isLoginPage) {
    configurarDatasAutomaticas(); // <--- Função nova de datas
    atualizarStats();
    renderTables();
  }
});

// --- Configura Data de Hoje e Validade ---
function configurarDatasAutomaticas() {
  const hoje = new Date();

  // 1. Define Data de Expedição (Hoje)
  const campoExpedicao = document.getElementById("porte-expedicao");
  if (campoExpedicao) {
    campoExpedicao.value = hoje.toLocaleDateString("pt-BR");
  }

  // 2. Define Validade (+30 dias)
  const campoValidade = document.getElementById("porte-validade");
  if (campoValidade) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    campoValidade.value = d.toLocaleDateString("pt-BR");
  }

  // 3. Data no Header (se houver)
  const elDataHeader = document.getElementById("data-atual");
  if (elDataHeader) elDataHeader.innerText = hoje.toLocaleDateString("pt-BR");
}

// ==========================================
// 🔐 LOGIN API
// ==========================================
async function validarLoginNaAPI(tokenCompleto) {
  try {
    const response = await fetch("/api/auth", {
      method: "GET",
      headers: { Authorization: tokenCompleto },
    });
    const data = await response.json();

    if (response.ok && data.authorized) {
      const userSession = {
        username: data.username,
        id: data.id,
        avatar: data.avatar,
        token: tokenCompleto,
      };
      localStorage.setItem("pc_session", JSON.stringify(userSession));
      window.location.href = "index.html";
    } else {
      alert(data.error || "Acesso negado.");
      window.location.href = "login.html?error=unauthorized";
    }
  } catch (error) {
    console.error(error);
    window.location.href = "login.html";
  }
}

function iniciarSistema(user) {
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : `assets/logo_pc.png`;

  const profileDiv = document.querySelector(".user-profile");
  if (profileDiv) {
    profileDiv.innerHTML = `
            <div class="avatar-circle"><img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%"></div>
            <div class="user-info"><p>${user.username}</p><small style="color:#04d361">● Online</small></div>
            <button onclick="logout()" style="background:none;border:none;color:#e52e4d;margin-left:auto;cursor:pointer;" title="Sair">
                <i class="fa-solid fa-right-from-bracket"></i>
            </button>
        `;
  }
  document.body.style.display = "block";
}

window.logout = function () {
  localStorage.removeItem("pc_session");
  window.location.href = "login.html";
};

// ==========================================
// 🎨 LÓGICA DO CANVAS (PRÉVIA)
// ==========================================
window.gerarPreviewPorte = function () {
  console.log("--- Gerando Prévia ---");

  const container = document.getElementById("preview-porte-container");
  const canvas = document.getElementById("canvas-porte");

  // Inputs
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;
  const expedicao = document.getElementById("porte-expedicao").value; // <--- Novo

  if (!container || !canvas)
    return console.error("Canvas container não encontrado!");
  if (!nome || !id) return alert("Preencha Nome e ID.");

  const ctx = canvas.getContext("2d");
  const img = new Image();

  if (arma === "GLOCK") img.src = "assets/porte_glock.png";
  else if (arma === "MP5") img.src = "assets/porte_mp5.png";
  else img.src = "assets/porte_taser.png";

  img.onload = function () {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    ctx.font = POSICOES.fonte;
    ctx.fillStyle = POSICOES.corTexto;
    ctx.textAlign = "left";

    // --- DESENHANDO OS DADOS ---
    ctx.fillText(
      nome.toUpperCase(),
      POSICOES.nome.x,
      POSICOES.nome.y,
      POSICOES.nome.max
    );
    ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
    ctx.fillText(rg, POSICOES.rg.x, POSICOES.rg.y);

    // Data de Expedição
    ctx.fillText(expedicao, POSICOES.expedicao.x, POSICOES.expedicao.y);

    // Validade
    ctx.fillText(validade, POSICOES.validade.x, POSICOES.validade.y);

    container.classList.remove("hidden");
    container.style.display = "block";
    container.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  img.onerror = function () {
    alert(`Erro: Imagem '${img.src}' não encontrada.`);
  };
};

// ==========================================
// 📨 ENVIO PARA O DISCORD
// ==========================================
const btnEmitir = document.getElementById("btn-emitir-final");

if (btnEmitir) {
  btnEmitir.addEventListener("click", () => {
    const nome = document.getElementById("porte-nome").value;
    const id = document.getElementById("porte-id").value;
    const rg = document.getElementById("porte-rg").value;
    const arma = document.getElementById("porte-arma").value;
    const validade = document.getElementById("porte-validade").value;
    const expedicao = document.getElementById("porte-expedicao").value; // <--- Novo

    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");

    const canvas = document.getElementById("canvas-porte");
    canvas.toBlob(async (blob) => {
      const nomeArquivo = `porte_${id}.png`;

      // --- EMBED DISCORD ---
      const embedData = {
        title: `📄 EMISSÃO DE PORTE: ${arma}`,
        description: `Documento oficial emitido pela **Polícia Civil**.`,
        color: 3447003,
        fields: [
          {
            name: "👤 Cidadão",
            value: `**${nome.toUpperCase()}**`,
            inline: true,
          },
          { name: "🆔 Passaporte", value: `\`${id}\``, inline: true },
          { name: "🪪 RG", value: rg, inline: true },

          // Linha de datas
          { name: "📅 Expedição", value: `\`${expedicao}\``, inline: true },
          { name: "📅 Validade", value: `\`${validade}\``, inline: true },

          { name: "🔫 Armamento", value: arma, inline: false },
        ],
        image: { url: `attachment://${nomeArquivo}` },
        footer: {
          text: `Emissor: ${sessao.username || "Oficial"} • Sistema Integrado`,
          icon_url: sessao.avatar
            ? `https://cdn.discordapp.com/avatars/${sessao.id}/${sessao.avatar}.png`
            : "",
        },
        timestamp: new Date().toISOString(),
      };

      const sucesso = await enviarParaAPI(
        blob,
        nomeArquivo,
        "porte",
        embedData
      );

      if (sucesso) {
        alert("✅ Porte emitido com sucesso!");
        dbPortes.push({ nome, id, rg, arma, validade, status: "Ativo" });
        renderTables();
        atualizarStats();
        window.navegar("dashboard");
        document.getElementById("preview-porte-container").style.display =
          "none";
        document.getElementById("porte-nome").value = "";
        document.getElementById("porte-id").value = "";
      }
    });
  });
}

// ==========================================
// 🛠️ FUNÇÕES DE API E NAVEGAÇÃO
// ==========================================
async function enviarParaAPI(blob, filename, tipoCanal, embedData) {
  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("payload_json", JSON.stringify({ embeds: [embedData] }));

  try {
    const res = await fetch(`/api/enviar?tipo=${tipoCanal}`, {
      method: "POST",
      body: formData,
    });
    if (res.ok) return true;

    const erro = await res.json();
    alert("Erro no envio: " + (erro.error || "Desconhecido"));
    return false;
  } catch (err) {
    console.error(err);
    return false;
  }
}

window.navegar = function (tela) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  document
    .querySelectorAll(".nav-links li")
    .forEach((l) => l.classList.remove("active"));
  const section = document.getElementById(`sec-${tela}`);
  if (section) section.classList.remove("hidden");

  // Recarrega as datas se voltar para a emissão
  if (tela === "emissao") configurarDatasAutomaticas();
};

window.renderTables = function () {
  const tbody = document.getElementById("lista-revogacao");
  if (!tbody) return;

  tbody.innerHTML = "";
  dbPortes.forEach((p) => {
    if (p.status === "Ativo") {
      tbody.innerHTML += `
                <tr>
                    <td>${p.nome}</td>
                    <td>${p.id}</td>
                    <td>${p.arma}</td>
                    <td><span class="badge active">Ativo</span></td>
                    <td><button class="btn-danger" onclick="revogar('${p.id}')">REVOGAR</button></td>
                </tr>`;
    }
  });
};

window.revogar = async function (id) {
  // 1. Acha o cidadão na lista local
  const p = dbPortes.find((x) => x.id === id);

  if (!p) return alert("Erro: Registro não encontrado.");

  if (
    confirm(
      `⚠️ ATENÇÃO: Tem certeza que deseja REVOGAR o porte de ${p.nome}?\nIsso enviará um alerta para o canal de Revogados no Discord.`
    )
  ) {
    // 2. Pega dados do Oficial logado
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const oficialNome = sessao.username || "Oficial";
    const oficialAvatar = sessao.avatar
      ? `https://cdn.discordapp.com/avatars/${sessao.id}/${sessao.avatar}.png`
      : "";

    // 3. Configura o Embed de Revogação (Vermelho Sangue)
    const embedRevogacao = {
      title: `🚫 PORTE REVOGADO`,
      description: `O porte de arma foi **CANCELADO** e consta como inválido a partir de agora.`,
      color: 15548997, // Vermelho (Red)
      fields: [
        { name: "👤 Cidadão", value: `**${p.nome}**`, inline: true },
        { name: "🆔 Passaporte", value: `\`${p.id}\``, inline: true },
        { name: "🔫 Arma", value: p.arma, inline: true },
        {
          name: "📅 Data da Revogação",
          value: new Date().toLocaleDateString("pt-BR"),
          inline: true,
        },
        { name: "👮 Responsável", value: oficialNome, inline: true },
      ],
      footer: {
        text: `Sistema de Segurança Pública • Ação Irreversível`,
        icon_url: oficialAvatar,
      },
      timestamp: new Date().toISOString(),
    };

    // 4. Cria um arquivo "fake" (Necessário porque sua API espera receber um arquivo)
    // Isso evita ter que reescrever todo o backend.
    const blob = new Blob([`Registro de Revogação: ${p.nome} - ID ${p.id}`], {
      type: "text/plain",
    });
    const nomeArquivoLog = `revogacao_${p.id}.txt`;

    // Avisa que está enviando...
    alert("Enviando solicitação ao sistema...");

    // 5. ENVIA PARA A API (Atenção ao tipo "revogacao")
    // O seu Backend precisa saber para qual webhook mandar quando recebe "revogacao"
    const sucesso = await enviarParaAPI(
      blob,
      nomeArquivoLog,
      "revogacao",
      embedRevogacao
    );

    if (sucesso) {
      // 6. Atualiza o banco local e a tela
      p.status = "Revogado";
      renderTables(); // Move para a tabela de baixo
      atualizarStats(); // Atualiza contadores
      alert("✅ Porte revogado e notificado no Discord com sucesso!");
    }
  }
};
window.processarLimpeza = function () {
  alert("Função de limpeza (Implementar igual ao porte).");
};

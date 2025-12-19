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

  nome: { x: 428, y: 250 },
  id: { x: 754, y: 433 },

  // Linha de baixo
  rg: { x: 576, y: 433 },
  expedicao: { x: 122, y: 435 }, // <--- NOVA POSIÇÃO (Ajuste se ficar em cima de outro)
  validade: { x: 304, y: 435 },

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
// 📨 ENVIO PARA O DISCORD (EMBED ATUALIZADO)
// ==========================================
const btnEmitir = document.getElementById("btn-emitir-final");

if (btnEmitir) {
  btnEmitir.addEventListener("click", () => {
    // 1. Pega os dados do formulário
    const nome = document.getElementById("porte-nome").value;
    const id = document.getElementById("porte-id").value;
    const rg = document.getElementById("porte-rg").value;
    const arma = document.getElementById("porte-arma").value;
    const validade = document.getElementById("porte-validade").value;
    const expedicao = document.getElementById("porte-expedicao").value;

    // 2. Pega a sessão do usuário logado (para pegar o ID do Discord)
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");

    // Verifica se tem ID, senão usa o nome como texto simples
    const mencaoOficial = sessao.id
      ? `<@${sessao.id}>`
      : `**${sessao.username || "Oficial"}**`;

    const canvas = document.getElementById("canvas-porte");

    canvas.toBlob(async (blob) => {
      const nomeArquivo = `porte_${id}.png`;

      // --- CONFIGURAÇÃO DO EMBED ---
      const embedData = {
        title: `📄 EMISSÃO DE PORTE: ${arma}`,

        // AQUI ESTÁ A MUDANÇA QUE VOCÊ PEDIU:
        description: `Emitido por ${mencaoOficial} oficial da Polícia Civil.`,

        color: 3447003, // Azul PCERJ
        fields: [
          {
            name: "👤 Cidadão",
            value: `**${nome.toUpperCase()}**`,
            inline: true,
          },
          { name: "🆔 Passaporte", value: `\`${id}\``, inline: true },
          { name: "🪪 RG", value: rg, inline: true },

          { name: "📅 Expedição", value: `\`${expedicao}\``, inline: true },
          { name: "📅 Validade", value: `\`${validade}\``, inline: true },

          { name: "🔫 Armamento", value: arma, inline: false },
        ],
        image: { url: `attachment://${nomeArquivo}` },
        footer: {
          text: `Sistema Integrado • Polícia Civil`,
          icon_url: sessao.avatar
            ? `https://cdn.discordapp.com/avatars/${sessao.id}/${sessao.avatar}.png`
            : "",
        },
        timestamp: new Date().toISOString(),
      };

      // Envia para API
      const sucesso = await enviarParaAPI(
        blob,
        nomeArquivo,
        "porte",
        embedData
      );

      if (sucesso) {
        await mostrarAlerta(
          "Sucesso",
          "Porte emitido e enviado para o Discord!",
          "success"
        );

        // Adiciona ao histórico local e limpa a tela
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

// ==========================================
// 🚫 FUNÇÃO DE REVOGAR (PADRÃO "SEGUNDO PRINT")
// ==========================================
window.revogar = async function (id) {
  const p = dbPortes.find((x) => x.id === id);
  if (!p) return mostrarAlerta("Erro", "Registro não encontrado.", "error");

  // SUBSTITUINDO O CONFIRM NATIVO:
  const confirmou = await confirmarAcao(
    "Revogar Porte?",
    `Tem certeza que deseja REVOGAR o porte de ${p.nome}? Isso enviará um alerta no Discord.`
  );

  if (confirmou) {
    // ... (código de preparação do embed igual antes) ...

    // SUBSTITUINDO O ALERT DE "PROCESSANDO":
    // Não usamos await aqui para ele não travar, ou podemos criar um "loading" simples.
    // Por enquanto, vamos pular o alert de processando ou usar um console.log
    console.log("Enviando...");

    const sucesso = await enviarParaAPI(
      blob,
      nomeArquivoLog,
      "revogacao",
      embedRevogacao
    );

    if (sucesso) {
      p.status = "Revogado";
      renderTables();
      atualizarStats();
      // SUBSTITUINDO O ALERT FINAL:
      mostrarAlerta("Sucesso", "Porte revogado com sucesso!", "success");
    } else {
      mostrarAlerta("Erro", "Falha ao comunicar com o servidor.", "error");
    }
  }
};
window.processarLimpeza = function () {
  alert("Função de limpeza (Implementar igual ao porte).");
};
// ==========================================
// 🔔 SISTEMA DE ALERTAS CUSTOMIZADOS
// ==========================================

// 1. Alerta Simples (Substitui o alert)
function mostrarAlerta(titulo, mensagem, tipo = "success") {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    const iconBox = document.getElementById("modal-icon");
    const btnCancel = document.getElementById("btn-modal-cancel");
    const btnConfirm = document.getElementById("btn-modal-confirm");

    // Configura Ícone e Cor
    iconBox.className = "fa-solid"; // Reseta
    document.getElementById("modal-icon-box").className = "modal-icon " + tipo;

    if (tipo === "success") iconBox.classList.add("fa-circle-check");
    else if (tipo === "error") iconBox.classList.add("fa-circle-xmark");
    else if (tipo === "warning")
      iconBox.classList.add("fa-triangle-exclamation");

    // Textos
    document.getElementById("modal-title").innerText = titulo;
    document.getElementById("modal-desc").innerText = mensagem;

    // Botões
    btnCancel.classList.add("hidden"); // Esconde cancelar
    btnConfirm.innerText = "OK";

    // Mostrar
    modal.classList.remove("hidden");

    // Ação ao fechar
    btnConfirm.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
  });
}

// 2. Confirmação (Substitui o confirm)
function confirmarAcao(titulo, mensagem) {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    const iconBox = document.getElementById("modal-icon");
    const btnCancel = document.getElementById("btn-modal-cancel");
    const btnConfirm = document.getElementById("btn-modal-confirm");

    // Configura visual de Perigo/Warning
    iconBox.className = "fa-solid fa-circle-question";
    document.getElementById("modal-icon-box").className = "modal-icon warning";

    document.getElementById("modal-title").innerText = titulo;
    document.getElementById("modal-desc").innerText = mensagem;

    // Botões
    btnCancel.classList.remove("hidden"); // Mostra cancelar
    btnConfirm.innerText = "Confirmar";

    // Mostrar
    modal.classList.remove("hidden");

    // Lógica de Resposta
    btnConfirm.onclick = () => {
      modal.classList.add("hidden");
      resolve(true); // Clicou em SIM
    };

    btnCancel.onclick = () => {
      modal.classList.add("hidden");
      resolve(false); // Clicou em NÃO
    };
  });
}

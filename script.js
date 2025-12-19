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
  // Coordenadas baseadas no template
  nome: { x: 370, y: 250, max: 400 },
  id: { x: 754, y: 433 },

  // Linha Inferior
  rg: { x: 576, y: 433 },
  expedicao: { x: 122, y: 435 },
  validade: { x: 304, y: 435 },

  corTexto: "#000000",
  fonte: "bold 26px 'Arial'",
};

// Dados Iniciais (Exemplo)
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
// 🚀 INICIALIZAÇÃO E AUTENTICAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  const hash = window.location.hash;
  const isLoginPage = window.location.pathname.includes("login.html");

  // 1. Processa retorno do Discord (Token na URL)
  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type");

    window.history.replaceState({}, document.title, window.location.pathname);
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
  }
  // 2. Verifica sessão existente ou erros
  else {
    const sessao = localStorage.getItem("pc_session");

    // Trata erro de URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("error") === "unauthorized" && isLoginPage) {
      await mostrarAlerta(
        "Acesso Negado",
        "Você não possui a tag necessária no Discord.",
        "error"
      );
    }

    if (sessao) {
      if (isLoginPage) window.location.href = "index.html";
      else iniciarSistema(JSON.parse(sessao));
    } else if (!isLoginPage) {
      window.location.href = "login.html";
    }
  }

  // 3. Setup de funcionalidades (Só no Index)
  if (!isLoginPage) {
    configurarDatasAutomaticas();
    atualizarStats();
    renderTables();
  }
});

async function validarLoginNaAPI(tokenCompleto) {
  try {
    // Opcional: Mostrar modal de loading aqui se desejar

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
      await mostrarAlerta(
        "Acesso Negado",
        data.error || "Permissão insuficiente.",
        "error"
      );
      window.location.href = "login.html?error=unauthorized";
    }
  } catch (error) {
    console.error(error);
    await mostrarAlerta("Erro", "Falha na conexão com o servidor.", "error");
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
// 🎨 GERADOR DE PRÉVIA (CANVAS)
// ==========================================
window.gerarPreviewPorte = async function () {
  console.log("--- Gerando Prévia ---");

  const container = document.getElementById("preview-porte-container");
  const canvas = document.getElementById("canvas-porte");
  const wrapper = document.querySelector(".canvas-wrapper");

  // Inputs
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;
  const expedicao = document.getElementById("porte-expedicao").value;

  if (!container || !canvas) return;

  // Validação Visual
  if (!nome || !id) {
    return mostrarAlerta(
      "Dados Incompletos",
      "Preencha Nome e ID para gerar o documento.",
      "warning"
    );
  }

  const ctx = canvas.getContext("2d");
  const img = new Image();

  // Seleciona background
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

    // Desenha textos
    ctx.fillText(
      nome.toUpperCase(),
      POSICOES.nome.x,
      POSICOES.nome.y,
      POSICOES.nome.max
    );
    ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
    ctx.fillText(rg, POSICOES.rg.x, POSICOES.rg.y);
    ctx.fillText(expedicao, POSICOES.expedicao.x, POSICOES.expedicao.y);
    ctx.fillText(validade, POSICOES.validade.x, POSICOES.validade.y);

    // Mostra e Rola
    container.classList.remove("hidden");
    container.style.display = "block";

    if (wrapper)
      wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    else container.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  img.onerror = function () {
    mostrarAlerta(
      "Erro de Recurso",
      `Imagem '${img.src}' não encontrada.`,
      "error"
    );
  };
};

// ==========================================
// 📨 EMISSÃO (ENVIO AZUL)
// ==========================================
const btnEmitir = document.getElementById("btn-emitir-final");

if (btnEmitir) {
  btnEmitir.addEventListener("click", () => {
    const nome = document.getElementById("porte-nome").value;
    const id = document.getElementById("porte-id").value;
    const rg = document.getElementById("porte-rg").value;
    const arma = document.getElementById("porte-arma").value;
    const validade = document.getElementById("porte-validade").value;
    const expedicao = document.getElementById("porte-expedicao").value;

    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    // Menção clicável
    const mencaoOficial = sessao.id
      ? `<@${sessao.id}>`
      : `**${sessao.username || "Oficial"}**`;

    const canvas = document.getElementById("canvas-porte");

    canvas.toBlob(async (blob) => {
      const nomeArquivo = `porte_${id}.png`;

      const embedData = {
        title: `📄 EMISSÃO DE PORTE: ${arma}`,
        description: `Emitido por ${mencaoOficial} oficial da Polícia Civil.`,
        color: 3447003, // Azul
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

        dbPortes.push({ nome, id, rg, arma, validade, status: "Ativo" });
        renderTables();
        atualizarStats();
        window.navegar("dashboard");

        // Limpeza
        document.getElementById("preview-porte-container").style.display =
          "none";
        document.getElementById("porte-nome").value = "";
        document.getElementById("porte-id").value = "";
      }
    });
  });
}

// ==========================================
// 🚫 REVOGAÇÃO (ENVIO VERMELHO)
// ==========================================
window.revogar = async function (id) {
  const p = dbPortes.find((x) => x.id === id);
  if (!p) return mostrarAlerta("Erro", "Registro não encontrado.", "error");

  const confirmou = await confirmarAcao(
    "Revogar Porte?",
    `Tem certeza que deseja REVOGAR o porte de ${p.nome}? Isso notificará o Discord.`
  );

  if (confirmou) {
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const mencaoOficial = sessao.id
      ? `<@${sessao.id}>`
      : `**${sessao.username || "Oficial"}**`;
    const oficialAvatar = sessao.avatar
      ? `https://cdn.discordapp.com/avatars/${sessao.id}/${sessao.avatar}.png`
      : "";

    const embedRevogacao = {
      title: `🚫 PORTE REVOGADO: ${p.arma}`,
      description: `Revogado por ${mencaoOficial} oficial da Polícia Civil.`,
      color: 15548997, // Vermelho
      fields: [
        {
          name: "👤 Cidadão",
          value: `**${p.nome.toUpperCase()}**`,
          inline: true,
        },
        { name: "🆔 Passaporte", value: `\`${p.id}\``, inline: true },
        { name: "🪪 RG", value: p.rg || "N/A", inline: true },
        {
          name: "📅 Data Revogação",
          value: `\`${new Date().toLocaleDateString("pt-BR")}\``,
          inline: true,
        },
        { name: "🔫 Armamento", value: p.arma, inline: true },
      ],
      footer: {
        text: `Sistema de Segurança Pública • Polícia Civil`,
        icon_url: oficialAvatar,
      },
      timestamp: new Date().toISOString(),
    };

    // Cria arquivo dummy para API aceitar o FormData
    const blob = new Blob([`LOG REVOGACAO ${id}`], { type: "text/plain" });
    const nomeArquivoLog = `revogacao_${id}.txt`;

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
      mostrarAlerta("Revogado", "Porte revogado com sucesso.", "success");
    }
  }
};

// ==========================================
// 🔔 SISTEMA DE ALERTAS (MODAL)
// ==========================================
window.mostrarAlerta = function (titulo, mensagem, tipo = "success") {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    if (!modal) {
      alert(mensagem);
      return resolve(true);
    } // Fallback

    const iconBox = document.getElementById("modal-icon");
    const boxColor = document.getElementById("modal-icon-box");
    const btnCancel = document.getElementById("btn-modal-cancel");
    const btnConfirm = document.getElementById("btn-modal-confirm");

    // Configura ícone
    iconBox.className = "fa-solid";
    boxColor.className = "modal-icon " + tipo;

    if (tipo === "success") iconBox.classList.add("fa-circle-check");
    else if (tipo === "error") iconBox.classList.add("fa-circle-xmark");
    else if (tipo === "warning")
      iconBox.classList.add("fa-triangle-exclamation");

    document.getElementById("modal-title").innerText = titulo;
    document.getElementById("modal-desc").innerText = mensagem;

    if (btnCancel) btnCancel.classList.add("hidden");
    btnConfirm.innerText = "OK";

    modal.classList.remove("hidden");

    btnConfirm.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
  });
};

window.confirmarAcao = function (titulo, mensagem) {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    const iconBox = document.getElementById("modal-icon");
    const boxColor = document.getElementById("modal-icon-box");
    const btnCancel = document.getElementById("btn-modal-cancel");
    const btnConfirm = document.getElementById("btn-modal-confirm");

    iconBox.className = "fa-solid fa-circle-question";
    boxColor.className = "modal-icon warning";

    document.getElementById("modal-title").innerText = titulo;
    document.getElementById("modal-desc").innerText = mensagem;

    if (btnCancel) btnCancel.classList.remove("hidden");
    btnConfirm.innerText = "Confirmar";

    modal.classList.remove("hidden");

    btnConfirm.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };

    if (btnCancel) {
      btnCancel.onclick = () => {
        modal.classList.add("hidden");
        resolve(false);
      };
    }
  });
};

// ==========================================
// 🛠️ FUNÇÕES AUXILIARES
// ==========================================
function configurarDatasAutomaticas() {
  const hoje = new Date();

  // Campo Expedição (Hoje)
  const campoExpedicao = document.getElementById("porte-expedicao");
  if (campoExpedicao) campoExpedicao.value = hoje.toLocaleDateString("pt-BR");

  // Campo Validade (+30 dias)
  const campoValidade = document.getElementById("porte-validade");
  if (campoValidade) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    campoValidade.value = d.toLocaleDateString("pt-BR");
  }

  // Header Data
  const elDataHeader = document.getElementById("data-atual");
  if (elDataHeader) elDataHeader.innerText = hoje.toLocaleDateString("pt-BR");
}

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
    mostrarAlerta("Erro na API", erro.error || "Erro desconhecido", "error");
    return false;
  } catch (err) {
    console.error(err);
    mostrarAlerta("Erro Crítico", "Falha de conexão com a API.", "error");
    return false;
  }
}

window.navegar = function (tela) {
  // Esconde telas
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  // Reseta menu
  document
    .querySelectorAll(".nav-links li")
    .forEach((l) => l.classList.remove("active"));

  // Mostra tela e ativa menu
  const section = document.getElementById(`sec-${tela}`);
  if (section) section.classList.remove("hidden");

  const menuLink = document.querySelector(
    `.nav-links li[onclick="navegar('${tela}')"]`
  );
  if (menuLink) menuLink.classList.add("active");

  if (tela === "emissao") configurarDatasAutomaticas();
};

window.renderTables = function () {
  const tbodyAtivos = document.getElementById("lista-ativos-para-revogar");
  const tbodyRevogados = document.getElementById("lista-ja-revogados");

  if (tbodyAtivos) tbodyAtivos.innerHTML = "";
  if (tbodyRevogados) tbodyRevogados.innerHTML = "";

  dbPortes.forEach((p) => {
    if (p.status === "Ativo") {
      if (tbodyAtivos) {
        tbodyAtivos.innerHTML += `
                <tr>
                    <td>${p.nome}</td>
                    <td>${p.id}</td>
                    <td>${p.arma}</td>
                    <td>
                        <button class="btn-danger" onclick="revogar('${p.id}')">
                            <i class="fa-solid fa-ban"></i>
                        </button>
                    </td>
                </tr>`;
      }
    } else if (p.status === "Revogado") {
      if (tbodyRevogados) {
        tbodyRevogados.innerHTML += `
                <tr style="opacity: 0.7;">
                    <td>${p.nome}</td>
                    <td>${p.id}</td>
                    <td>${new Date().toLocaleDateString("pt-BR")}</td>
                    <td><span class="badge revogado">REVOGADO</span></td>
                </tr>`;
      }
    }
  });
  atualizarStats();
};

function atualizarStats() {
  const elAtivos = document.getElementById("counter-ativos");
  const elRevogados = document.getElementById("counter-revogados");

  if (elAtivos)
    elAtivos.innerText = dbPortes.filter((p) => p.status === "Ativo").length;
  if (elRevogados)
    elRevogados.innerText = dbPortes.filter(
      (p) => p.status === "Revogado"
    ).length;
}

window.processarLimpeza = function () {
  mostrarAlerta(
    "Em Breve",
    "Funcionalidade de limpeza ainda não implementada.",
    "warning"
  );
};

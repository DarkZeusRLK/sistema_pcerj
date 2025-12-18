// ==========================================
// ⚙️ CONFIGURAÇÕES GERAIS
// ==========================================
const CONFIG = {
  CLIENT_ID: "1451342682487259319", // Seu ID novo
  REDIRECT_URI: "https://sistema-emissao.vercel.app/", // Sua URL Vercel
};

// ==========================================
// 📍 CONFIGURAÇÃO DE POSIÇÕES (AJUSTE FINO)
// ==========================================
// DICA: Abra sua imagem no Paint e passe o mouse para ver o X e Y.
const POSICOES = {
  // Posições X (horizontal) e Y (vertical)
  nome: { x: 240, y: 455, max: 239 },
  id: { x: 575, y: 424 },
  rg: { x: 687, y: 424 },
  validade: { x: 369, y: 420 },

  // Estilo da Fonte
  corTexto: "#000000",
  fonte: "bold 26px 'Arial'", // Ajuste o tamanho (26px, 30px, etc)
};

// Dados Mockados (Exemplo)
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

  // 1. Voltando do Discord (Login)
  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type");

    // Limpa URL
    window.history.replaceState({}, document.title, window.location.pathname);

    // Valida no Backend
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
  }
  // 2. Verificando Sessão Existente
  else {
    const sessao = localStorage.getItem("pc_session");
    if (sessao) {
      iniciarSistema(JSON.parse(sessao));
    } else if (!isLoginPage) {
      // Se não tem sessão e não tá no login, tchau
      window.location.href = "login.html";
    }
  }

  // 3. Setup Inicial (Se já estiver logado)
  if (!isLoginPage) {
    setValidadeAuto();
    atualizarStats();
    renderTables();

    // Data no Header
    const elData = document.getElementById("data-atual");
    if (elData) elData.innerText = new Date().toLocaleDateString("pt-BR");
  }
});

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
    alert("Erro de conexão com o servidor.");
    window.location.href = "login.html";
  }
}

function iniciarSistema(user) {
  // Atualiza Sidebar com foto e nome
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

  if (!container || !canvas)
    return console.error("Canvas container não encontrado!");
  if (!nome || !id) return alert("Preencha Nome e ID.");

  const ctx = canvas.getContext("2d");
  const img = new Image();

  // Seleciona background
  if (arma === "GLOCK") img.src = "assets/porte_glock.png";
  else if (arma === "MP5") img.src = "assets/porte_mp5.png";
  else img.src = "assets/porte_taser.png";

  img.onload = function () {
    // 1. Setup Canvas
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // 2. Configura Fonte
    ctx.font = POSICOES.fonte;
    ctx.fillStyle = POSICOES.corTexto;
    ctx.textAlign = "left";

    // 3. Escreve Texto (Usando as posições lá do topo)
    ctx.fillText(
      nome.toUpperCase(),
      POSICOES.nome.x,
      POSICOES.nome.y,
      POSICOES.nome.max
    );
    ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
    ctx.fillText(rg, POSICOES.rg.x, POSICOES.rg.y);
    ctx.fillText(validade, POSICOES.validade.x, POSICOES.validade.y);

    // 4. Mostra Container
    container.classList.remove("hidden");
    container.style.display = "block";
    container.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  img.onerror = function () {
    alert(
      `Erro: Imagem '${img.src}' não encontrada na pasta 'assets'. Verifique maiúsculas/minúsculas.`
    );
  };
};

// ==========================================
// 📨 ENVIO PARA O DISCORD (EMBED)
// ==========================================
const btnEmitir = document.getElementById("btn-emitir-final");

if (btnEmitir) {
  btnEmitir.addEventListener("click", () => {
    const nome = document.getElementById("porte-nome").value;
    const id = document.getElementById("porte-id").value;
    const rg = document.getElementById("porte-rg").value;
    const arma = document.getElementById("porte-arma").value;
    const validade = document.getElementById("porte-validade").value;

    // Pega info do usuário logado para o Footer
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const oficialNome = sessao.username || "Oficial";
    const oficialAvatar = sessao.avatar
      ? `https://cdn.discordapp.com/avatars/${sessao.id}/${sessao.avatar}.png`
      : "";

    const canvas = document.getElementById("canvas-porte");

    canvas.toBlob(async (blob) => {
      const nomeArquivo = `porte_${id}.png`;

      // --- CONFIGURAÇÃO DO EMBED ---
      const embedData = {
        title: `📄 EMISSÃO DE PORTE: ${arma}`,
        description: `O porte de arma foi concedido oficialmente conforme as diretrizes da **Polícia Civil**.`,
        color: 3447003, // Azul (PCERJ)
        fields: [
          {
            name: "👤 Cidadão",
            value: `**${nome.toUpperCase()}**`,
            inline: true,
          },
          { name: "🆔 Passaporte", value: `\`${id}\``, inline: true },
          { name: "📅 Validade", value: `\`${validade}\``, inline: true },
          { name: "🔫 Armamento", value: arma, inline: true },
          { name: "🪪 RG", value: rg, inline: true },
        ],
        image: { url: `attachment://${nomeArquivo}` },
        footer: {
          text: `Emissor: ${oficialNome} • Sistema Integrado`,
          icon_url: oficialAvatar,
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
        alert("✅ Porte emitido e enviado para o Discord!");
        // Adiciona ao histórico local (Visual apenas)
        dbPortes.push({ nome, id, rg, arma, validade, status: "Ativo" });
        renderTables();
        atualizarStats();
        window.navegar("dashboard");

        // Limpa campos e esconde prévia
        document.getElementById("preview-porte-container").style.display =
          "none";
        document.getElementById("porte-nome").value = "";
        document.getElementById("porte-id").value = "";
      }
    });
  });
}

// Função Genérica de Envio para API
async function enviarParaAPI(blob, filename, tipoCanal, embedData) {
  const formData = new FormData();
  formData.append("file", blob, filename);

  // Payload JSON obrigatório para Webhooks/Bots com Embeds
  formData.append(
    "payload_json",
    JSON.stringify({
      embeds: [embedData],
    })
  );

  try {
    const res = await fetch(`/api/enviar?tipo=${tipoCanal}`, {
      method: "POST",
      body: formData,
    });

    if (res.ok) return true;

    const erro = await res.json();
    alert("Erro no envio: " + (erro.error || "Erro desconhecido"));
    return false;
  } catch (err) {
    console.error(err);
    alert("Erro de conexão com a API.");
    return false;
  }
}

// ==========================================
// 🛠️ FUNÇÕES UTILITÁRIAS E NAVEGAÇÃO
// ==========================================

// Navegação entre Abas
window.navegar = function (tela) {
  // Esconde todas as telas
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));

  // Remove ativo dos botões
  document
    .querySelectorAll(".nav-links li")
    .forEach((l) => l.classList.remove("active"));

  // Mostra a tela certa
  const section = document.getElementById(`sec-${tela}`);
  if (section) section.classList.remove("hidden");

  // Marca botão como ativo (opcional, requer IDs nos LIs)
  // const btn = document.getElementById(`btn-${tela}`);
  // if(btn) btn.classList.add("active");

  if (tela === "emissao") setValidadeAuto();
};

// Data Automática (+30 dias)
function setValidadeAuto() {
  const el = document.getElementById("porte-validade");
  if (el) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    el.value = d.toLocaleDateString("pt-BR");
  }
}

// Renderiza Tabela de Revogação
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
                    <td>
                        <button class="btn-danger" onclick="revogar('${p.id}')">
                            <i class="fa-solid fa-ban"></i> REVOGAR
                        </button>
                    </td>
                </tr>`;
    }
  });
};

// Revogação Mockada
window.revogar = function (id) {
  if (confirm("Tem certeza que deseja REVOGAR este porte?")) {
    const index = dbPortes.findIndex((p) => p.id === id);
    if (index !== -1) {
      dbPortes[index].status = "Revogado";
      alert("Porte revogado com sucesso!");
      renderTables();
      atualizarStats();
    }
  }
};

// Atualiza Contadores da Dashboard
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

// --- LIMPEZA DE FICHA (Lógica Similar) ---
window.processarLimpeza = function () {
  // Implemente a lógica similar ao porte se necessário
  // Pegar inputs -> Canvas Limpeza -> enviarParaAPI('limpeza', embed)
  alert(
    "Função de limpeza pronta para ser implementada (Copie a lógica do Porte)."
  );
};

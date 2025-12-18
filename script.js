// ==========================================
// ⚙️ CONFIGURAÇÕES
// ==========================================
const CONFIG = {
  // URL do seu site (igual no Discord Developer Portal)
  CLIENT_ID: "1451342682487259319",
  REDIRECT_URI: "https://sistema-emissao.vercel.app/",
};

// Dados Mockados para teste visual (serão substituídos pelo fluxo real)
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

document.addEventListener("DOMContentLoaded", async function () {
  // --- 1. LÓGICA DE AUTENTICAÇÃO ---
  const hash = window.location.hash;
  const isLoginPage = window.location.pathname.includes("login.html");

  // A. Voltando do Discord com Token
  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type");
    window.history.replaceState({}, document.title, window.location.pathname);
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
  }
  // B. Verificando Sessão Salva
  else {
    const sessao = localStorage.getItem("pc_session");
    if (sessao) {
      iniciarSistema(JSON.parse(sessao));
    } else if (!isLoginPage) {
      window.location.href = "login.html";
    }
  }

  // --- 2. INICIALIZAÇÃO DO SISTEMA ---
  if (!isLoginPage) {
    setValidadeAuto();
    atualizarStats();
    renderTables();

    // Data no Header
    const elData = document.getElementById("data-atual");
    if (elData) elData.innerText = new Date().toLocaleDateString("pt-BR");
  }
});

// ==========================================
// FUNÇÕES DE SEGURANÇA (API)
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
    window.location.href = "login.html";
  }
}

function iniciarSistema(user) {
  // Atualiza Sidebar
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : `assets/logo_pc.png`;

  const profileDiv = document.querySelector(".user-profile");
  if (profileDiv) {
    profileDiv.innerHTML = `
            <div class="avatar-circle"><img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%"></div>
            <div class="user-info"><p>${user.username}</p><small style="color:#04d361">● Online</small></div>
            <button onclick="logout()" style="background:none;border:none;color:#e52e4d;margin-left:auto;cursor:pointer;"><i class="fa-solid fa-right-from-bracket"></i></button>
        `;
  }
  document.body.style.display = "block";
}

window.logout = function () {
  localStorage.removeItem("pc_session");
  window.location.href = "login.html";
};

// ==========================================
// FUNÇÃO DE ENVIO PARA API (BACKEND)
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
    else {
      const erro = await res.json();
      alert("Erro no envio: " + (erro.error || "Desconhecido"));
      return false;
    }
  } catch (err) {
    alert("Erro de conexão.");
    return false;
  }
}

// ==========================================
// NAVEGAÇÃO E LÓGICA VISUAL
// ==========================================
window.navegar = function (tela) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  document
    .querySelectorAll(".nav-links li")
    .forEach((l) => l.classList.remove("active"));

  const section = document.getElementById(`sec-${tela}`);
  if (section) section.classList.remove("hidden");

  if (tela === "emissao") setValidadeAuto();
};

// POSIÇÕES DO CANVAS (Ajuste conforme suas imagens)
const POSICOES = {
  nome: { x: 50, y: 190 },
  id: { x: 50, y: 240 },
  rg: { x: 250, y: 240 },
  validade: { x: 400, y: 300 },
};

window.gerarPreviewPorte = function () {
  console.log("--- INICIANDO PROCESSO DE PRÉVIA ---");

  // 1. Pega os elementos do HTML
  const container = document.getElementById("preview-porte-container");
  const canvas = document.getElementById("canvas-porte");

  // Inputs
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;

  // Validação básica
  if (!container || !canvas) {
    return alert(
      "ERRO: Não encontrei a 'div' ou o 'canvas' no HTML. Verifique os IDs."
    );
  }

  if (!nome || !id) {
    return alert("Por favor, preencha Nome e Passaporte/ID.");
  }

  // 2. Prepara o Canvas
  const ctx = canvas.getContext("2d");
  const img = new Image();

  // 3. Define a Imagem (CUIDADO COM MAIÚSCULAS/MINÚSCULAS NA VERCEL!)
  // O nome do arquivo tem que ser exato. Se for .PNG ou .png faz diferença.
  if (arma === "GLOCK") img.src = "assets/porte_glock.png";
  else if (arma === "MP5") img.src = "assets/porte_mp5.png";
  else img.src = "assets/porte_taser.png";

  console.log("Carregando imagem:", img.src);

  // 4. Quando a imagem carregar
  img.onload = function () {
    console.log("Imagem carregada! Desenhando...");

    // Ajusta o tamanho
    canvas.width = img.width;
    canvas.height = img.height;

    // Desenha o fundo
    ctx.drawImage(img, 0, 0);

    // Configura texto
    ctx.font = "bold 22px Arial"; // Ajuste o tamanho da fonte se ficar pequeno
    ctx.fillStyle = "#000000"; // Cor do texto (Preto)

    // Escreve os dados (Ajuste X e Y conforme sua imagem de fundo)
    // Exemplo: ctx.fillText(TEXTO, POSICAO_X, POSICAO_Y)
    ctx.fillText(nome.toUpperCase(), 50, 190);
    ctx.fillText(`ID: ${id}`, 50, 240);
    ctx.fillText(`RG: ${rg}`, 250, 240);
    ctx.fillText(validade, 400, 300);

    // 5. O SEGREDO: Força a div a aparecer
    container.classList.remove("hidden");
    container.style.display = "block"; // <--- ISSO GARANTE QUE APARECE

    // Rola a tela até a prévia
    container.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // 5. Se der erro (Imagem não encontrada)
  img.onerror = function () {
    console.error("ERRO: Imagem não encontrada ->", img.src);
    alert(
      `ERRO: O arquivo '${img.src}' não existe na pasta 'assets' ou o nome está errado (Maiúscula/Minúscula importa!).`
    );
  };
};

// Botão de Envio Final (Emitir)
const btnEmitir = document.getElementById("btn-emitir-final");
if (btnEmitir) {
  btnEmitir.addEventListener("click", () => {
    const nome = document.getElementById("porte-nome").value;
    const id = document.getElementById("porte-id").value;
    const validade = document.getElementById("porte-validade").value;
    const arma = document.getElementById("porte-arma").value;

    const canvas = document.getElementById("canvas-porte");
    canvas.toBlob(async (blob) => {
      const sucesso = await enviarParaAPI(blob, `porte_${id}.png`, "porte", {
        title: `🔫 PORTE EMITIDO: ${arma}`,
        color: 16766720,
        image: { url: `attachment://porte_${id}.png` },
        fields: [
          { name: "Cidadão", value: nome, inline: true },
          { name: "ID", value: id, inline: true },
          { name: "Validade", value: validade, inline: true },
        ],
        footer: { text: "Sistema Integrado PCERJ" },
      });

      if (sucesso) {
        alert("Porte emitido!");
        dbPortes.push({ nome, id, rg: "000", arma, validade, status: "Ativo" }); // Add mock
        window.navegar("dashboard");
        renderTables();
        atualizarStats();
      }
    });
  });
}

// --- LIMPEZA DE FICHA ---
window.processarLimpeza = function () {
  const nome = document.getElementById("limp-nome").value;
  const id = document.getElementById("limp-id").value;
  const valor = document.getElementById("limp-valor").value;

  if (!nome || !id) return alert("Preencha tudo.");

  const canvas = document.getElementById("canvas-limpeza");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.src = "assets/bg_limpeza.png";

  img.onload = function () {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "#000";
    ctx.fillText(nome.toUpperCase(), 100, 200);
    ctx.fillText(`ID: ${id}`, 100, 250);
    ctx.fillText(`R$ ${valor}`, 100, 300);

    canvas.toBlob(async (blob) => {
      const sucesso = await enviarParaAPI(blob, "limpeza.png", "limpeza", {
        title: "⚖️ LIMPEZA DE FICHA",
        color: 65280,
        image: { url: "attachment://limpeza.png" },
        fields: [
          { name: "Cidadão", value: nome, inline: true },
          { name: "Valor", value: valor, inline: true },
        ],
      });
      if (sucesso) alert("Limpeza registrada!");
    });
  };
};

// --- RENOVAÇÃO & REVOGAÇÃO ---
window.renderTables = function () {
  const tbodyRev = document.getElementById("lista-revogacao");
  if (tbodyRev) {
    tbodyRev.innerHTML = "";
    dbPortes.forEach((p) => {
      if (p.status === "Ativo") {
        tbodyRev.innerHTML += `
                    <tr>
                        <td>${p.nome}</td>
                        <td>${p.id}</td>
                        <td>${p.arma}</td>
                        <td>Ativo</td>
                        <td><button class="btn-danger" onclick="revogar('${p.id}')">REVOGAR</button></td>
                    </tr>`;
      }
    });
  }
};

window.revogar = function (id) {
  const p = dbPortes.find((x) => x.id === id);
  if (confirm("Revogar porte?")) {
    // Envia revogação para API (simplificado)
    // Aqui você chamaria enviarParaAPI com a imagem de revogado
    alert("Porte revogado (Simulação).");
    p.status = "Revogado";
    renderTables();
    atualizarStats();
  }
};

// Utils
function setValidadeAuto() {
  const el = document.getElementById("porte-validade");
  if (el) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    el.value = d.toLocaleDateString("pt-BR");
  }
}
function atualizarStats() {
  const elAtivos = document.getElementById("counter-ativos");
  if (elAtivos)
    elAtivos.innerText = dbPortes.filter((p) => p.status === "Ativo").length;
}

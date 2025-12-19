// ==========================================
// ⚙️ CONFIGURAÇÕES GERAIS
// ==========================================
const CONFIG = {
  CLIENT_ID: "1451342682487259319",
  REDIRECT_URI: "https://sistema-emissao.vercel.app/",
};

const POSICOES = {
  nome: { x: 370, y: 250, max: 400 },
  id: { x: 754, y: 433 },
  rg: { x: 576, y: 433 },
  expedicao: { x: 122, y: 435 },
  validade: { x: 304, y: 435 },
  corTexto: "#000000",
  fonte: "bold 26px 'Arial'",
};

// Variável global (será preenchida vindo do Discord)
let dbPortes = [];

// ==========================================
// ☁️ BUSCAR DADOS DO DISCORD (VIA API)
// ==========================================
async function carregarPortesDoDiscord() {
  try {
    console.log("🔄 Buscando portes no canal do Discord...");

    // Chama nossa API criada no passo 1
    const res = await fetch("/api/listar");

    if (!res.ok) throw new Error("Erro na API");

    const dados = await res.json();

    // Atualiza a lista global
    dbPortes = dados;

    console.log(`✅ ${dbPortes.length} portes encontrados.`);
    renderTables();
    atualizarStats();
  } catch (erro) {
    console.error(erro);
    mostrarAlerta(
      "Erro de Sincronização",
      "Não foi possível puxar a lista de portes do Discord.",
      "error"
    );
  }
}

// ==========================================
// 🚀 INICIALIZAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  const hash = window.location.hash;
  const isLoginPage = window.location.pathname.includes("login.html");

  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type");
    window.history.replaceState({}, document.title, window.location.pathname);
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
  } else {
    const sessao = localStorage.getItem("pc_session");
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get("error") === "unauthorized" && isLoginPage) {
      await mostrarAlerta(
        "Acesso Negado",
        "Você não possui a tag necessária.",
        "error"
      );
    }

    if (sessao) {
      if (isLoginPage) window.location.href = "index.html";
      else {
        iniciarSistema(JSON.parse(sessao));

        // --- AQUI ESTÁ A MUDANÇA ---
        // Se estiver no painel, carrega do Discord
        if (!isLoginPage) {
          await carregarPortesDoDiscord();
        }
      }
    } else if (!isLoginPage) {
      window.location.href = "login.html";
    }
  }

  if (!isLoginPage) configurarDatasAutomaticas();
});

// ... (MANTENHA O RESTO DAS FUNÇÕES: validarLoginNaAPI, iniciarSistema, logout, gerarPreviewPorte, btnEmitir, gerarBlobRevogacao, mostrarAlerta, etc.) ...
// ATENÇÃO: Na função renderTables, não precisa mudar nada pois ela usa dbPortes.
// ==========================================
// 🚀 INICIALIZAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  const hash = window.location.hash;
  const isLoginPage = window.location.pathname.includes("login.html");

  // Login Discord
  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type");
    window.history.replaceState({}, document.title, window.location.pathname);
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
  } else {
    const sessao = localStorage.getItem("pc_session");

    // Erro na URL
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
      else {
        iniciarSistema(JSON.parse(sessao));

        // CARREGA OS DADOS DA NUVEM ASSIM QUE ENTRAR
        if (!isLoginPage) {
          await carregarDadosNuvem();
        }
      }
    } else if (!isLoginPage) {
      window.location.href = "login.html";
    }
  }

  if (!isLoginPage) {
    configurarDatasAutomaticas();
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
      await mostrarAlerta(
        "Acesso Negado",
        data.error || "Permissão insuficiente.",
        "error"
      );
      window.location.href = "login.html?error=unauthorized";
    }
  } catch (error) {
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
// 🎨 GERADOR DE PRÉVIA
// ==========================================
window.gerarPreviewPorte = async function () {
  const container = document.getElementById("preview-porte-container");
  const canvas = document.getElementById("canvas-porte");
  const wrapper = document.querySelector(".canvas-wrapper");

  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;
  const expedicao = document.getElementById("porte-expedicao").value;

  if (!container || !canvas) return;
  if (!nome || !id)
    return mostrarAlerta("Dados Incompletos", "Preencha Nome e ID.", "warning");

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

    container.classList.remove("hidden");
    container.style.display = "block";
    if (wrapper)
      wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
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
// 📨 EMISSÃO (COM SALVAMENTO NA NUVEM)
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
    const mencaoOficial = sessao.id
      ? `<@${sessao.id}>`
      : `**${sessao.username || "Oficial"}**`;
    const mensagemNotificacao = `✅ **PORTE APROVADO**\nEmitido por ${mencaoOficial} oficial da Polícia Civil.`;

    const canvas = document.getElementById("canvas-porte");

    canvas.toBlob(async (blob) => {
      const nomeArquivo = `porte_${id}.png`;

      const embedData = {
        title: `📄 EMISSÃO DE PORTE: ${arma}`,
        description: `O documento foi gerado e registrado no sistema.`,
        color: 3447003,
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
        embedData,
        mensagemNotificacao
      );

      if (sucesso) {
        await mostrarAlerta(
          "Sucesso",
          "Porte emitido e enviado para o Discord!",
          "success"
        );

        // --- ATUALIZAÇÃO DA NUVEM ---
        // 1. Recarrega dados mais recentes (para não sobrescrever o que outros fizeram)
        await carregarDadosNuvem();

        // 2. Adiciona o novo porte
        dbPortes.push({
          nome,
          id,
          rg,
          arma,
          validade,
          expedicao,
          status: "Ativo",
        });

        // 3. Salva na nuvem
        await salvarDadosNuvem();

        renderTables();
        atualizarStats();
        window.navegar("dashboard");

        // Limpa campos
        document.getElementById("preview-porte-container").style.display =
          "none";
        document.getElementById("porte-nome").value = "";
        document.getElementById("porte-id").value = "";
      }
    });
  });
}

// ==========================================
// 🎨 GERADOR DE IMAGEM REVOGAÇÃO
// ==========================================
function gerarBlobRevogacao(p) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    let imagemRevogacao = "";
    if (p.arma === "GLOCK") imagemRevogacao = "revogado_glock.png";
    else if (p.arma === "MP5") imagemRevogacao = "revogado_mp5.png";
    else if (p.arma === "TASER") imagemRevogacao = "revogado_taser.png";
    else imagemRevogacao = "revogado_glock.png";

    img.src = `assets/${imagemRevogacao}`;

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      ctx.font = POSICOES.fonte;
      ctx.fillStyle = POSICOES.corTexto;
      ctx.textAlign = "left";

      ctx.fillText(
        p.nome.toUpperCase(),
        POSICOES.nome.x,
        POSICOES.nome.y,
        POSICOES.nome.max
      );
      ctx.fillText(p.id, POSICOES.id.x, POSICOES.id.y);
      ctx.fillText(p.rg || "00.000.000-0", POSICOES.rg.x, POSICOES.rg.y);

      const dataHoje = new Date().toLocaleDateString("pt-BR");
      ctx.fillText(
        p.expedicao || dataHoje,
        POSICOES.expedicao.x,
        POSICOES.expedicao.y
      );
      ctx.fillText(p.validade, POSICOES.validade.x, POSICOES.validade.y);

      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    img.onerror = () =>
      reject(new Error(`Imagem 'assets/${imagemRevogacao}' não encontrada.`));
  });
}

// ==========================================
// 🚫 REVOGAÇÃO (COM SALVAMENTO NA NUVEM)
// ==========================================
window.revogar = async function (id) {
  // Atenção: string vs number
  const p = dbPortes.find((x) => String(x.id) === String(id));

  if (!p) return mostrarAlerta("Erro", "Registro não encontrado.", "error");

  const confirmou = await confirmarAcao(
    "Revogar Porte?",
    `Tem certeza que deseja REVOGAR o porte de ${p.nome}?`
  );

  if (confirmou) {
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const mencaoOficial = sessao.id
      ? `<@${sessao.id}>`
      : `**${sessao.username || "Oficial"}**`;
    const oficialAvatar = sessao.avatar
      ? `https://cdn.discordapp.com/avatars/${sessao.id}/${sessao.avatar}.png`
      : "";
    const mensagemNotificacao = `🚨 **PORTE REVOGADO**\nRevogado por ${mencaoOficial} oficial da Polícia Civil.`;

    let blobRevogacao;
    try {
      blobRevogacao = await gerarBlobRevogacao(p);
    } catch (erroImg) {
      return mostrarAlerta("Erro de Arquivo", erroImg.message, "error");
    }

    const nomeArquivo = `revogacao_${id}.png`;

    const embedRevogacao = {
      title: `🚫 REGISTRO DE REVOGAÇÃO: ${p.arma}`,
      description: `Este porte foi cancelado e consta como inválido no sistema.`,
      color: 15548997,
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
      image: { url: `attachment://${nomeArquivo}` },
      footer: {
        text: `Sistema de Segurança Pública • Polícia Civil`,
        icon_url: oficialAvatar,
      },
      timestamp: new Date().toISOString(),
    };

    const sucesso = await enviarParaAPI(
      blobRevogacao,
      nomeArquivo,
      "revogacao",
      embedRevogacao,
      mensagemNotificacao
    );

    if (sucesso) {
      // --- ATUALIZAÇÃO DA NUVEM ---
      await carregarDadosNuvem(); // Atualiza primeiro para garantir

      // Encontra o item novamente na lista atualizada
      const itemAtualizado = dbPortes.find((x) => String(x.id) === String(id));
      if (itemAtualizado) {
        itemAtualizado.status = "Revogado";
        await salvarDadosNuvem(); // Salva a mudança de status
      }

      renderTables();
      atualizarStats();
      mostrarAlerta(
        "Revogado",
        "Documento de revogação gerado e enviado com sucesso.",
        "success"
      );
    }
  }
};

// ==========================================
// 🛠️ ALERTAS E UTILS
// ==========================================
window.mostrarAlerta = function (titulo, mensagem, tipo = "success") {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    if (!modal) {
      alert(mensagem);
      return resolve(true);
    }

    const iconBox = document.getElementById("modal-icon");
    const boxColor = document.getElementById("modal-icon-box");
    const btnConfirm = document.getElementById("btn-modal-confirm");
    const btnCancel = document.getElementById("btn-modal-cancel");

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
    if (btnCancel)
      btnCancel.onclick = () => {
        modal.classList.add("hidden");
        resolve(false);
      };
  });
};

function configurarDatasAutomaticas() {
  const hoje = new Date();
  const campoExpedicao = document.getElementById("porte-expedicao");
  if (campoExpedicao) campoExpedicao.value = hoje.toLocaleDateString("pt-BR");

  const campoValidade = document.getElementById("porte-validade");
  if (campoValidade) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    campoValidade.value = d.toLocaleDateString("pt-BR");
  }
  const elDataHeader = document.getElementById("data-atual");
  if (elDataHeader) elDataHeader.innerText = hoje.toLocaleDateString("pt-BR");
}

async function enviarParaAPI(
  blob,
  filename,
  tipoCanal,
  embedData,
  mensagemTexto = ""
) {
  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append(
    "payload_json",
    JSON.stringify({ content: mensagemTexto, embeds: [embedData] })
  );

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
    mostrarAlerta("Erro Crítico", "Falha de conexão com a API.", "error");
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

  const listaInvertida = [...dbPortes].reverse();

  listaInvertida.forEach((p) => {
    if (p.status === "Ativo") {
      if (tbodyAtivos) {
        tbodyAtivos.innerHTML += `
                <tr>
                    <td>${p.nome}</td>
                    <td>${p.id}</td>
                    <td>${p.arma}</td>
                    <td><button class="btn-danger" onclick="revogar('${p.id}')"><i class="fa-solid fa-ban"></i></button></td>
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

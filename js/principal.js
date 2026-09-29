const formLogin = document.getElementById('form-login');
const botaoLogin = document.getElementById('botao-login');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('erro-login').style.display = 'none';
  botaoLogin.disabled = true;
  botaoLogin.textContent = 'Entrando…';

  const email = document.getElementById('input-email').value.trim();
  const senha = document.getElementById('input-senha').value;
  try {
    const user = await tentarLogin(email, senha);
    entrarNoPainel(user);
  } catch (err) {
    if (err.message === 'SEM_ACESSO') {
      mostrarErroLogin('Esta conta não tem acesso ao painel de gestão.');
    } else if (err.message === 'Invalid login credentials') {
      mostrarErroLogin('E-mail ou senha incorretos.');
    } else {
      mostrarErroLogin('Falha ao entrar: ' + err.message);
    }
  } finally {
    botaoLogin.disabled = false;
    botaoLogin.textContent = 'Entrar';
  }
});

const formTroca = document.getElementById('form-troca-senha');
const botaoTroca = document.getElementById('botao-troca-senha');
const inputNova = document.getElementById('input-nova-senha');
const inputConfirma = document.getElementById('input-confirma-senha');

function atualizarRegrasSenha() {
  const regras = regrasDaSenha(inputNova.value, inputConfirma.value);
  for (const li of document.querySelectorAll('#regras-senha li')) {
    li.classList.toggle('ok', regras[li.dataset.regra]);
  }
  return Object.values(regras).every(Boolean);
}
inputNova.addEventListener('input', atualizarRegrasSenha);
inputConfirma.addEventListener('input', atualizarRegrasSenha);

formTroca.addEventListener('submit', async (e) => {
  e.preventDefault();
  const erroEl = document.getElementById('erro-troca-senha');
  erroEl.style.display = 'none';
  if (!atualizarRegrasSenha()) {
    erroEl.textContent = 'A senha ainda não cumpre todos os requisitos da lista.';
    erroEl.style.display = 'block';
    return;
  }
  botaoTroca.disabled = true;
  botaoTroca.textContent = 'Salvando…';
  try {
    await concluirTrocaDeSenha(inputNova.value);
    formTroca.reset();
    atualizarRegrasSenha();
  } catch (err) {
    erroEl.textContent = mensagemErroTroca(err);
    erroEl.style.display = 'block';
  } finally {
    botaoTroca.disabled = false;
    botaoTroca.textContent = 'Salvar e entrar';
  }
});
document.getElementById('botao-sair-troca').addEventListener('click', sair);

document.getElementById('botao-sair').addEventListener('click', sair);
document.getElementById('botao-atualizar').addEventListener('click', () => {
  carregarTudo();
  registrarUso('periodo', periodoDosCampos());
});

document.getElementById('botao-exportar-pdf').addEventListener('click', abrirDialogoPdf);
document.getElementById('botao-tela-cheia').addEventListener('click', alternarTelaCheiaMapa);
document.getElementById('botao-mostrar-mapa').addEventListener('click', alternarMapaAtividades);
document.getElementById('detalhes-mapa').open = window.matchMedia('(min-width: 701px)').matches;
document.getElementById('pdf-gerar').addEventListener('click', gerarRelatorioPdf);
document.getElementById('pdf-cancelar').addEventListener('click', cancelarRelatorioPdf);
document.getElementById('pdf-incluir-fotos').addEventListener('change', atualizarAvisoPdf);
document.getElementById('dialogo-pdf').addEventListener('cancel', () => { exportacaoPdf.cancelada = true; });

document.getElementById('atalhos-periodo').addEventListener('click', (e) => {
  const botao = e.target.closest('button[data-periodo]');
  if (!botao) return;
  aplicarAtalhoPeriodo(botao.dataset.periodo);
  registrarUso('periodo', { ...periodoDosCampos(), atalho: botao.textContent.trim() });
});
for (const id of ['filtro-inicio', 'filtro-fim']) {
  document.getElementById(id).addEventListener('change', marcarAtalhoPeriodo);
}

document.getElementById('filtro-atividade').addEventListener('change', () => {
  popularServicos();
  aplicarFiltrosLocais();
});

document.getElementById('filtro-trecho').addEventListener('change', () => {
  popularKms();
  aplicarFiltrosLocais();
});

document.getElementById('filtro-km').addEventListener('change', () => {
  popularEstacas();
  aplicarFiltrosLocais();
});

for (const id of ['filtro-estaca-de', 'filtro-estaca-ate', 'filtro-encarregado', 'filtro-servico']) {
  document.getElementById(id).addEventListener('change', aplicarFiltrosLocais);
}

document.getElementById('botao-limpar-filtros').addEventListener('click', limparFiltros);

for (const id of IDS_FILTROS_LOCAIS) {
  document.getElementById(id).addEventListener('change', agendarRegistroDeFiltros);
}
document.getElementById('botao-limpar-filtros').addEventListener('click', agendarRegistroDeFiltros);

document.getElementById('botao-tema').addEventListener('click', alternarTema);

document.getElementById('botao-expandir-atividades')
    .addEventListener('click', alternarAtividades);

const gradeFotos = document.getElementById('grade-fotos');
function abrirFotoDoEvento(e) {
  const item = e.target.closest('.foto-item');
  if (item) abrirLightbox(Number(item.dataset.indice));
}
gradeFotos.addEventListener('click', abrirFotoDoEvento);
gradeFotos.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirFotoDoEvento(e); }
});
document.getElementById('botao-mais-fotos').addEventListener('click', carregarMaisFotos);

const lightbox = document.getElementById('lightbox');
document.getElementById('fechar-lightbox').addEventListener('click', fecharLightbox);
document.getElementById('lightbox-anterior').addEventListener('click', () => navegarLightbox(-1));
document.getElementById('lightbox-proxima').addEventListener('click', () => navegarLightbox(1));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox || e.target.classList.contains('lightbox-conteudo')) fecharLightbox();
});
document.addEventListener('keydown', (e) => {
  if (!lightboxAberto()) return;
  if (e.key === 'Escape') fecharLightbox();
  else if (e.key === 'ArrowLeft') navegarLightbox(-1);
  else if (e.key === 'ArrowRight') navegarLightbox(1);
});

let toqueX = null;
lightbox.addEventListener('touchstart', (e) => { toqueX = e.touches[0].clientX; }, { passive: true });
lightbox.addEventListener('touchend', (e) => {
  if (toqueX === null) return;
  const dx = e.changedTouches[0].clientX - toqueX;
  toqueX = null;
  if (Math.abs(dx) > 50) navegarLightbox(dx < 0 ? 1 : -1);
});

iniciarMenuSecoes();
aplicarTema(temaInicial());
restaurarSessao();

// Ponto de entrada: liga os elementos do DOM às funções dos outros módulos.
// Não define lógica própria — só orquestra. Carregado por último, depois que
// config.js, utilidades.js, dashboard.js, dados.js e autenticacao.js já
// definiram tudo que este arquivo usa.

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
    mostrarDashboard(user);
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

document.getElementById('botao-sair').addEventListener('click', sair);
document.getElementById('botao-atualizar').addEventListener('click', carregarTudo);

// Trocar a atividade refaz a lista de serviços antes de filtrar: o serviço
// escolhido pode não existir na atividade nova.
document.getElementById('filtro-atividade').addEventListener('change', () => {
  popularServicos();
  aplicarFiltrosLocais();
});

for (const id of ['filtro-trecho', 'filtro-encarregado', 'filtro-servico']) {
  document.getElementById(id).addEventListener('change', aplicarFiltrosLocais);
}

document.getElementById('botao-tema').addEventListener('click', alternarTema);

document.getElementById('botao-expandir-atividades')
    .addEventListener('click', alternarAtividades);

document.getElementById('fechar-lightbox').addEventListener('click', fecharLightbox);
document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') fecharLightbox();
});

aplicarTema(temaInicial());
restaurarSessao();

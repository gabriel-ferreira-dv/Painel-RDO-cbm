const CHAVE_TEMA = 'painel_rdo_tema';

function temaInicial() {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch (e) {
  }
  return window.matchMedia
      && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'escuro'
    : 'claro';
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;

  const botao = document.getElementById('botao-tema');
  if (botao) {
    botao.textContent = tema === 'escuro' ? '☀ Claro' : '☾ Escuro';
  }

  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch (e) {
  }

  if (typeof redesenharGrafico === 'function') redesenharGrafico();
}

function alternarTema() {
  aplicarTema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
}

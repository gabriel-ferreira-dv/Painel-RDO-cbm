// Tema claro/escuro. A troca é só um atributo no <html>: todo o resto vem
// das variáveis CSS redefinidas em estilo.css.

const CHAVE_TEMA = 'painel_rdo_tema';

/// Tema a usar na abertura: o último escolhido nesta máquina, ou o que o
/// sistema operacional já pede. Quem trabalha no escuro não deveria levar um
/// clarão na cara toda vez que abre o painel.
function temaInicial() {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch (e) {
    // Navegador com armazenamento bloqueado: segue pela preferência do sistema.
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
    // O rótulo anuncia o DESTINO, não o estado atual: é para onde o clique leva.
    botao.textContent = tema === 'escuro' ? '☀ Claro' : '☾ Escuro';
  }

  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch (e) {
    // Sem persistência: o tema vale só nesta aba, o que ainda é melhor que nada.
  }

  // O gráfico é canvas, não CSS: as cores dele ficaram gravadas no desenho e
  // só mudam se ele for refeito.
  if (typeof redesenharGrafico === 'function') redesenharGrafico();
}

function alternarTema() {
  aplicarTema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
}

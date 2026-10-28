function secaoAtual(secoes, alturaTopo) {
  const linha = alturaTopo + 24;
  const noFim = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  if (noFim) return secoes[secoes.length - 1];
  let atual = secoes[0];
  for (const s of secoes) {
    if (s.getBoundingClientRect().top <= linha) atual = s;
  }
  return atual;
}

const HASH_DO_MAPA = '#mapa';
let marcarSecaoDoMenu = () => {};

function estaNoMapa() {
  return document.body.classList.contains('modo-mapa');
}

function entrarNoMapa() {
  const secao = document.getElementById('secao-mapa');
  document.body.classList.add('modo-mapa');
  if (location.hash !== HASH_DO_MAPA) history.pushState(null, '', HASH_DO_MAPA);
  marcarSecaoDoMenu(secao);
  if (window.innerWidth < 1100) secao.scrollIntoView({ block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'instant' });
  if (document.getElementById('dashboard').style.display !== 'block') return;
  if (!mapaAberto) alternarMapaAtividades();
  else if (mapaPainel) mapaPainel.invalidateSize();
}

function sairDoMapa() {
  if (!estaNoMapa()) return;
  document.body.classList.remove('modo-mapa');
  if (location.hash === HASH_DO_MAPA) history.pushState(null, '', location.pathname + location.search);
  if (mapaAberto) alternarMapaAtividades();
}

function abrirMapaSeNoEndereco() {
  if (location.hash === HASH_DO_MAPA) entrarNoMapa();
}

function iniciarMenuSecoes() {
  const topo = document.querySelector('header.topo');
  const links = [...document.querySelectorAll('#menu-secoes a[href^="#"]')];
  const secoes = links.map(a => document.querySelector(a.getAttribute('href')));
  const secaoMapa = document.getElementById('secao-mapa');
  const secoesDaPagina = secoes.filter(s => s !== secaoMapa);

  const medirTopo = () => {
    document.documentElement.style.setProperty('--altura-topo', `${topo.offsetHeight}px`);
  };

  const menu = document.getElementById('menu-secoes');
  const marcar = (secao) => {
    links.forEach((a, i) => {
      const ativo = secoes[i] === secao;
      a.classList.toggle('ativo', ativo);
      if (ativo) {
        a.setAttribute('aria-current', 'true');
        mostrarNoMenu(a);
      } else {
        a.removeAttribute('aria-current');
      }
    });
  };
  marcarSecaoDoMenu = marcar;

  function mostrarNoMenu(a) {
    if (menu.scrollWidth <= menu.clientWidth) return;
    const ra = a.getBoundingClientRect();
    const rm = menu.getBoundingClientRect();
    if (ra.left < rm.left) menu.scrollLeft -= rm.left - ra.left + 8;
    else if (ra.right > rm.right) menu.scrollLeft += ra.right - rm.right + 8;
  }

  const aoRolar = () => {
    if (estaNoMapa()) marcar(secaoMapa);
    else marcar(secaoAtual(secoesDaPagina, topo.offsetHeight));
  };

  links.forEach((a, i) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (secoes[i] === secaoMapa) {
        entrarNoMapa();
        return;
      }
      sairDoMapa();
      secoes[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
      marcar(secoes[i]);
    });
  });

  window.addEventListener('hashchange', () => {
    if (location.hash === HASH_DO_MAPA) entrarNoMapa();
    else sairDoMapa();
  });
  window.addEventListener('popstate', () => {
    if (location.hash === HASH_DO_MAPA) entrarNoMapa();
    else { sairDoMapa(); aoRolar(); }
  });

  window.addEventListener('scroll', aoRolar, { passive: true });
  new ResizeObserver(() => { medirTopo(); aoRolar(); }).observe(topo);
  if (location.hash === HASH_DO_MAPA) {
    document.body.classList.add('modo-mapa');
    marcar(secaoMapa);
  }
}

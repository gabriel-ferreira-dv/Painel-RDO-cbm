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

function iniciarMenuSecoes() {
  const topo = document.querySelector('header.topo');
  const links = [...document.querySelectorAll('#menu-secoes a')];
  const secoes = links.map(a => document.querySelector(a.getAttribute('href')));

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

  function mostrarNoMenu(a) {
    if (menu.scrollWidth <= menu.clientWidth) return;
    const ra = a.getBoundingClientRect();
    const rm = menu.getBoundingClientRect();
    if (ra.left < rm.left) menu.scrollLeft -= rm.left - ra.left + 8;
    else if (ra.right > rm.right) menu.scrollLeft += ra.right - rm.right + 8;
  }

  const aoRolar = () => marcar(secaoAtual(secoes, topo.offsetHeight));

  links.forEach((a, i) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      secoes[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
      marcar(secoes[i]);
    });
  });

  window.addEventListener('scroll', aoRolar, { passive: true });
  new ResizeObserver(() => { medirTopo(); aoRolar(); }).observe(topo);
}

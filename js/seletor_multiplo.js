const seletoresMultiplos = [];
const MINIMO_PARA_PESQUISA = 7;

function textoComparavel(s) {
  return semAcento(String(s || '')).toLowerCase();
}

function criarSeletorMultiplo(select) {
  const todos = select.dataset.todos || 'Todos';
  const caixa = document.createElement('div');
  caixa.className = 'seletor';
  caixa.innerHTML = `
    <button type="button" class="seletor-botao" aria-haspopup="listbox" aria-expanded="false">
      <span class="seletor-texto">${escaparHtml(todos)}</span>
      <span class="seletor-seta" aria-hidden="true">▾</span>
    </button>
    <div class="seletor-painel" hidden>
      <input type="search" class="seletor-pesquisa" placeholder="Pesquisar…" autocomplete="off">
      <div class="seletor-acoes">
        <button type="button" data-acao="todos">Marcar todos</button>
        <button type="button" data-acao="limpar">Limpar</button>
      </div>
      <ul class="seletor-lista" role="listbox" aria-multiselectable="true"></ul>
      <div class="seletor-vazio" hidden>Nada encontrado</div>
    </div>`;
  select.after(caixa);
  select.hidden = true;

  const botao = caixa.querySelector('.seletor-botao');
  const texto = caixa.querySelector('.seletor-texto');
  const painel = caixa.querySelector('.seletor-painel');
  const pesquisa = caixa.querySelector('.seletor-pesquisa');
  const lista = caixa.querySelector('.seletor-lista');
  const vazio = caixa.querySelector('.seletor-vazio');
  const rotulo = document.querySelector(`label[for="${select.id}"]`);
  if (rotulo) {
    rotulo.id = rotulo.id || `rotulo-${select.id}`;
    botao.setAttribute('aria-labelledby', `${rotulo.id} ${select.id}-texto`);
    texto.id = `${select.id}-texto`;
    rotulo.addEventListener('click', (e) => { e.preventDefault(); botao.focus(); });
  }

  const avisarMudanca = () => {
    atualizarTexto();
    select.dispatchEvent(new Event('change'));
  };

  function atualizarTexto() {
    const escolhidos = [...select.selectedOptions].filter(o => o.value);
    texto.textContent = escolhidos.length === 0 ? todos
      : escolhidos.length === 1 ? escolhidos[0].text
      : `${escolhidos.length} selecionados`;
    botao.title = escolhidos.map(o => o.text).join('\n');
    caixa.classList.toggle('com-selecao', escolhidos.length > 0);
    for (const cb of lista.querySelectorAll('input')) {
      cb.checked = select.options[Number(cb.dataset.i)]?.selected || false;
    }
  }

  function renderizarLista() {
    lista.innerHTML = [...select.options].map((o, i) => o.value ? `
      <li data-busca="${escaparHtml(textoComparavel(o.text))}">
        <label><input type="checkbox" data-i="${i}"${o.selected ? ' checked' : ''}><span>${escaparHtml(o.text)}</span></label>
      </li>` : '').join('');
    pesquisa.hidden = select.options.length < MINIMO_PARA_PESQUISA;
    filtrarLista();
    atualizarTexto();
  }

  function filtrarLista() {
    const termo = textoComparavel(pesquisa.value).trim();
    let visiveis = 0;
    for (const li of lista.children) {
      const mostra = !termo || li.dataset.busca.includes(termo);
      li.hidden = !mostra;
      if (mostra) visiveis++;
    }
    vazio.hidden = visiveis > 0;
  }

  function abrir() {
    for (const s of seletoresMultiplos) if (s !== api) s.fechar();
    painel.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    caixa.classList.add('aberto');
    painel.style.left = '';
    painel.style.right = '';
    const r = painel.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) {
      painel.style.left = 'auto';
      painel.style.right = '0';
    }
    if (!pesquisa.hidden) pesquisa.focus();
  }

  function fechar() {
    if (painel.hidden) return;
    painel.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    caixa.classList.remove('aberto');
    pesquisa.value = '';
    filtrarLista();
  }

  botao.addEventListener('click', () => (painel.hidden ? abrir() : fechar()));
  pesquisa.addEventListener('input', filtrarLista);
  lista.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    select.options[Number(cb.dataset.i)].selected = cb.checked;
    avisarMudanca();
  });
  caixa.querySelector('.seletor-acoes').addEventListener('click', (e) => {
    const acao = e.target.closest('button')?.dataset.acao;
    if (!acao) return;
    if (acao === 'limpar') {
      for (const o of select.options) o.selected = false;
    } else {
      for (const li of lista.children) {
        if (li.hidden) continue;
        const cb = li.querySelector('input');
        select.options[Number(cb.dataset.i)].selected = true;
      }
    }
    avisarMudanca();
  });
  caixa.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { fechar(); botao.focus(); }
  });

  new MutationObserver(renderizarLista).observe(select, { childList: true });
  renderizarLista();

  const api = { select, fechar, atualizarTexto, contem: (el) => caixa.contains(el) };
  seletoresMultiplos.push(api);
  return api;
}

function atualizarTextosDosSeletores() {
  for (const s of seletoresMultiplos) s.atualizarTexto();
}

document.addEventListener('pointerdown', (e) => {
  for (const s of seletoresMultiplos) if (!s.contem(e.target)) s.fechar();
});

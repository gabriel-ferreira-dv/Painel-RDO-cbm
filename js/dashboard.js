let grafico = null;

const LINHAS_VISIVEIS = 5;

let atividadesExpandidas = false;

let cacheRegistros = [];
let cacheFotos = [];

let periodoCarregado = { inicio: new Date(), fim: new Date() };

let recorteAtual = { registros: [], fotos: [] };

function mostrarDashboard(user) {
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('nome-usuario').textContent =
    user.nomeExibicao || user.email;

  aplicarAtalhoPeriodo('mes');
  mostrarLinkAdmin();
}

function intervaloDoAtalho(atalho) {
  const hoje = new Date();
  const inicio = new Date(hoje);
  if (atalho === '7dias') inicio.setDate(inicio.getDate() - 6);
  else if (atalho === '30dias') inicio.setDate(inicio.getDate() - 29);
  else if (atalho === 'mes') inicio.setDate(1);
  return [chaveDia(inicio), chaveDia(hoje)];
}

function aplicarAtalhoPeriodo(atalho) {
  const [inicio, fim] = intervaloDoAtalho(atalho);
  document.getElementById('filtro-inicio').value = inicio;
  document.getElementById('filtro-fim').value = fim;
  marcarAtalhoPeriodo();
  carregarTudo();
}

function marcarAtalhoPeriodo() {
  const inicio = document.getElementById('filtro-inicio').value;
  const fim = document.getElementById('filtro-fim').value;
  for (const botao of document.querySelectorAll('#atalhos-periodo button')) {
    const [i, f] = intervaloDoAtalho(botao.dataset.periodo);
    const ativo = i === inicio && f === fim;
    botao.classList.toggle('ativo', ativo);
    botao.setAttribute('aria-pressed', String(ativo));
  }
}

function preencherSelect(id, valores, rotuloTodos) {
  const sel = document.getElementById(id);
  const escolhido = sel.value;
  const opcoes = valores.map(v => Array.isArray(v) ? v : [v, v]);
  sel.innerHTML = `<option value="">${rotuloTodos}</option>` +
    opcoes.map(([v, r]) => `<option value="${escaparHtml(v)}">${escaparHtml(r)}</option>`).join('');
  sel.value = opcoes.some(([v]) => v === escolhido) ? escolhido : '';
}

function ordenados(campo, registros = cacheRegistros) {
  return [...new Set(registros.map(r => r[campo]).filter(Boolean))].sort();
}

function popularSelectsDeFiltro() {
  preencherSelect('filtro-trecho', ordenados('trecho'), 'Todos');
  popularKms();
  preencherSelect('filtro-encarregado', encarregadosOrdenados(), 'Todos');
  preencherSelect('filtro-atividade', ordenados('atividade'), 'Todas');
  popularServicos();
}

function encarregadosOrdenados() {
  const porChave = new Map(cacheRegistros.map(r => [r.encarregado_chave, r.encarregado]));
  return [...porChave].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
}

function popularKms() {
  const trecho = document.getElementById('filtro-trecho').value;
  const base = trecho ? cacheRegistros.filter(r => r.trecho === trecho) : cacheRegistros;
  const kms = new Set();
  for (const r of base) {
    if (r.km) kms.add(String(r.km).trim());
    const kmFinal = String(r.km_final || '').trim();
    if (kmFinal) kms.add(kmFinal);
  }
  const lista = [...kms].sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
  preencherSelect('filtro-km', lista.map(k => [k, `KM ${k}`]), 'Todos');
  popularEstacas();
}

function popularEstacas() {
  const trecho = document.getElementById('filtro-trecho').value;
  const km = document.getElementById('filtro-km').value;
  const base = cacheRegistros.filter(r =>
    (!trecho || r.trecho === trecho) && (!km || registroCobreKm(r, km)));
  const estacas = new Map();
  for (const r of base) {
    for (const e of [r.estaca_inicial, r.estaca_final]) {
      const n = estacaEmNumero(e);
      if (!Number.isNaN(n) && !estacas.has(n)) estacas.set(n, String(e).trim());
    }
  }
  const lista = [...estacas].sort((a, b) => a[0] - b[0]).map(([n, txt]) => [String(n), txt]);
  preencherSelect('filtro-estaca-de', lista, 'Início');
  preencherSelect('filtro-estaca-ate', lista, 'Fim');
}

function lerFiltroEstaca(id) {
  const v = document.getElementById(id).value;
  return v === '' ? NaN : Number(v);
}

const IDS_FILTROS_LOCAIS = [
  'filtro-trecho', 'filtro-km', 'filtro-estaca-de', 'filtro-estaca-ate',
  'filtro-encarregado', 'filtro-atividade', 'filtro-servico',
];

function limparFiltros() {
  for (const id of IDS_FILTROS_LOCAIS) document.getElementById(id).value = '';
  popularKms();
  popularServicos();
  aplicarFiltrosLocais();
}

function popularServicos() {
  const atividade = document.getElementById('filtro-atividade').value;
  const base = atividade
    ? cacheRegistros.filter(r => r.atividade === atividade)
    : cacheRegistros;
  preencherSelect('filtro-servico', ordenados('servico_notavel', base), 'Todos');
}

function aplicarFiltrosLocais() {
  const trecho = document.getElementById('filtro-trecho').value;
  const km = document.getElementById('filtro-km').value;
  const estacaDe = lerFiltroEstaca('filtro-estaca-de');
  const estacaAte = lerFiltroEstaca('filtro-estaca-ate');
  const filtrarEstaca = !Number.isNaN(estacaDe) || !Number.isNaN(estacaAte);
  const encarregado = document.getElementById('filtro-encarregado').value;
  const atividade = document.getElementById('filtro-atividade').value;
  const servico = document.getElementById('filtro-servico').value;

  const registrosFiltrados = cacheRegistros.filter(r =>
    (!trecho || r.trecho === trecho)
    && (!km || registroCobreKm(r, km))
    && (!filtrarEstaca || registroCobreEstacas(r, estacaDe, estacaAte))
    && (!encarregado || r.encarregado_chave === encarregado)
    && (!atividade || r.atividade === atividade)
    && (!servico || r.servico_notavel === servico));

  document.getElementById('botao-limpar-filtros').hidden =
    IDS_FILTROS_LOCAIS.every(id => !document.getElementById(id).value.trim());

  const chavesRegistros = new Set(registrosFiltrados.map(r => `${r.dispositivo_id}|${r.id_local}`));
  const fotosFiltradas = cacheFotos.filter(f => chavesRegistros.has(`${f.dispositivo_id}|${f.registro_id_local}`));
  recorteAtual = { registros: registrosFiltrados, fotos: fotosFiltradas };

  atualizarKpis(registrosFiltrados, fotosFiltradas);
  atualizarGrafico(registrosFiltrados);
  atualizarTabela(registrosFiltrados);
  atualizarFotos(fotosFiltradas, registrosFiltrados);
  atualizarMapaAtividades(registrosFiltrados);
}

function atualizarKpis(registros, fotos) {
  document.getElementById('kpi-registros').textContent = registros.length;
  document.getElementById('kpi-fotos').textContent = fotos.length;
  const encarregados = new Set(registros.map(r => r.encarregado_chave));
  document.getElementById('kpi-encarregados').textContent = encarregados.size;
}

function corDoTema(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

let registrosNoGrafico = [];

function redesenharGrafico() {
  if (grafico) atualizarGrafico(registrosNoGrafico);
}

function atualizarGrafico(registros) {
  registrosNoGrafico = registros;
  const dias = [];
  const d = inicioDoDia(periodoCarregado.inicio);
  const ultimo = inicioDoDia(periodoCarregado.fim);
  while (d <= ultimo) {
    dias.push(chaveDia(d));
    d.setDate(d.getDate() + 1);
  }
  const fmt = x => x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  document.getElementById('periodo-grafico').textContent = dias.length === 1
    ? fmt(periodoCarregado.inicio)
    : `${fmt(periodoCarregado.inicio)} a ${fmt(periodoCarregado.fim)} · ${dias.length} dias`;
  const contagem = Object.fromEntries(dias.map(d => [d, 0]));
  for (const r of registros) {
    const k = chaveDia(new Date(r.criado_em));
    if (k in contagem) contagem[k]++;
  }

  const ctx = document.getElementById('grafico-dias').getContext('2d');
  const dadosGrafico = dias.map(d => contagem[d]);
  const rotulos = dias.map(d => {
    const [, m, dd] = d.split('-');
    return `${dd}/${m}`;
  });

  const corTexto = corDoTema('--texto-suave');
  const corGrade = corDoTema('--borda');

  if (grafico) grafico.destroy();
  grafico = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rotulos,
      datasets: [{
        label: 'Registros',
        data: dadosGrafico,
        backgroundColor: corDoTema('--laranja'),
        borderRadius: 4,
        maxBarThickness: 28,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: corTexto },
          grid: { color: corGrade },
        },
        x: {
          ticks: { color: corTexto },
          grid: { display: false },
        },
      }
    }
  });
}

function atualizarTabela(registros) {
  const corpo = document.getElementById('corpo-tabela-atividades');
  document.getElementById('contagem-atividades').textContent = `${registros.length} registro(s)`;

  if (registros.length === 0) {
    corpo.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum registro no período/filtro selecionado.</td></tr>';
    ajustarAlturaAtividades();
    return;
  }

  corpo.innerHTML = registros.map(r => {
    const porTerceiro = capitalizarNome(r.registrado_por_nome);
    const km = descreverKm(r);
    const estaca = descreverEstaca(r);
    return `
      <tr>
        <td class="col-data">${formatarDataHora(r.criado_em)}</td>
        <td class="col-encarregado">${escaparHtml(r.encarregado)}${porTerceiro ? `<span class="tag-terceiro" title="Lançado por ${escaparHtml(porTerceiro)}">por terceiro</span>` : ''}</td>
        <td class="col-trecho" data-rotulo="Trecho">${escaparHtml(r.trecho)}${r.via ? ' · ' + escaparHtml(r.via) : ''}</td>
        <td class="col-km" data-rotulo="Local">KM ${escaparHtml(km)} · ${escaparHtml(estaca)}</td>
        <td class="col-servico" data-rotulo="Serviço">${escaparHtml(descreverServico(r))}</td>
        <td class="col-medicao" data-rotulo="Medição">${escaparHtml(descreverMedicao(r))}</td>
      </tr>`;
  }).join('');

  ajustarAlturaAtividades();
}

function ajustarAlturaAtividades() {
  const wrap = document.getElementById('wrap-atividades');
  const botao = document.getElementById('botao-expandir-atividades');
  const linhas = wrap.querySelectorAll('tbody tr');

  wrap.classList.remove('recolhida');
  wrap.style.maxHeight = '';

  const total = linhas.length;
  const temLinhasDeDados = total > 0 && !linhas[0].querySelector('.vazio, .carregando');
  if (!temLinhasDeDados || total <= LINHAS_VISIVEIS) {
    botao.hidden = true;
    return;
  }

  botao.hidden = false;
  botao.textContent = atividadesExpandidas
      ? `Mostrar só as ${LINHAS_VISIVEIS} primeiras`
      : `Ver todos os ${total} registros`;
  if (atividadesExpandidas) return;

  const limite = linhas[LINHAS_VISIVEIS - 1].getBoundingClientRect().bottom
      - wrap.getBoundingClientRect().top;
  wrap.style.maxHeight = `${Math.round(limite)}px`;
  wrap.classList.add('recolhida');
}

function alternarAtividades() {
  atividadesExpandidas = !atividadesExpandidas;
  ajustarAlturaAtividades();
  if (!atividadesExpandidas) {
    document.getElementById('wrap-atividades')
        .scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

const FOTOS_POR_PAGINA = 48;

let galeria = { itens: [], mostrados: 0, urls: new Map(), ultimoDia: null, fotosPorDia: new Map() };

let indiceLightbox = -1;

function atualizarFotos(fotos, registros) {
  const porChave = new Map(registros.map(r => [`${r.dispositivo_id}|${r.id_local}`, r]));
  const itens = fotos.map(f => ({ foto: f, registro: porChave.get(`${f.dispositivo_id}|${f.registro_id_local}`) }));
  const fotosPorDia = new Map();
  for (const { foto } of itens) {
    const dia = chaveDia(foto.criado_em);
    fotosPorDia.set(dia, (fotosPorDia.get(dia) || 0) + 1);
  }
  galeria = { itens, mostrados: 0, urls: new Map(), ultimoDia: null, fotosPorDia };
  fecharLightbox();

  document.getElementById('contagem-fotos').textContent = `${fotos.length} foto(s)`;
  const grade = document.getElementById('grade-fotos');
  if (fotos.length === 0) {
    grade.innerHTML = '<div class="vazio">Nenhuma foto no período/filtro selecionado.</div>';
    atualizarBotaoMaisFotos();
    return;
  }
  grade.innerHTML = '';
  carregarMaisFotos();
}

async function carregarMaisFotos() {
  const g = galeria;
  const grade = document.getElementById('grade-fotos');
  const botao = document.getElementById('botao-mais-fotos');
  const lote = g.itens.slice(g.mostrados, g.mostrados + FOTOS_POR_PAGINA);
  if (lote.length === 0 || g.carregando) return;

  g.carregando = true;
  botao.disabled = true;
  botao.textContent = 'Carregando fotos…';
  const esqueletos = [];
  for (let i = 0; i < Math.min(lote.length, 12); i++) {
    const el = document.createElement('div');
    el.className = 'foto-esqueleto';
    grade.appendChild(el);
    esqueletos.push(el);
  }

  const { data: assinadas, error } = await sb.storage
    .from(BUCKET_FOTOS)
    .createSignedUrls(lote.map(i => i.foto.caminho_storage), 3600);

  esqueletos.forEach(el => el.remove());
  if (g !== galeria) return;
  g.carregando = false;
  botao.disabled = false;

  if (error) {
    grade.insertAdjacentHTML('beforeend',
      `<div class="vazio grade-linha-toda">Falha ao gerar links das fotos: ${escaparHtml(error.message)}</div>`);
    atualizarBotaoMaisFotos();
    return;
  }
  for (const a of assinadas) if (a.signedUrl) g.urls.set(a.path, a.signedUrl);

  const inicio = g.mostrados;
  g.mostrados += lote.length;
  grade.insertAdjacentHTML('beforeend', lote.map((item, i) => htmlFoto(item, inicio + i)).join(''));
  atualizarBotaoMaisFotos();
}

function atualizarBotaoMaisFotos() {
  const botao = document.getElementById('botao-mais-fotos');
  const restantes = galeria.itens.length - galeria.mostrados;
  botao.hidden = restantes <= 0;
  botao.textContent = `Carregar mais ${Math.min(restantes, FOTOS_POR_PAGINA)} fotos (${restantes} restantes)`;
}

function htmlFoto({ foto, registro }, indice) {
  let cabecalho = '';
  const dia = chaveDia(foto.criado_em);
  if (dia !== galeria.ultimoDia) {
    galeria.ultimoDia = dia;
    const n = galeria.fotosPorDia.get(dia);
    cabecalho = `<div class="dia-fotos grade-linha-toda">${formatarDiaExtenso(foto.criado_em)}
      <span>${n} foto${n === 1 ? '' : 's'}</span></div>`;
  }

  const url = galeria.urls.get(foto.caminho_storage) || '';
  const nome = registro ? registro.encarregado : '';
  const servico = registro ? descreverServico(registro) : '';
  const local = registro
    ? `${registro.trecho} · KM ${descreverKm(registro)} · Est. ${descreverEstaca(registro)}`
    : '';
  return `${cabecalho}
    <figure class="foto-item" data-indice="${indice}" tabindex="0" title="${escaparHtml(servico)}">
      <div class="foto-img">
        <img src="${escaparHtml(url)}" loading="lazy" alt="Foto: ${escaparHtml(servico || 'registro')}"
             onload="this.classList.add('ok')" onerror="this.parentNode.classList.add('falhou')">
        <span class="foto-hora">${formatarHora(foto.criado_em)}</span>
      </div>
      <figcaption>
        <b>${escaparHtml(nome)}</b>
        <span class="foto-servico">${escaparHtml(servico)}</span>
        <span class="foto-local">${escaparHtml(local)}</span>
      </figcaption>
    </figure>`;
}

async function abrirLightbox(indice) {
  if (indice >= galeria.mostrados && indice < galeria.itens.length) {
    await carregarMaisFotos();
  }
  const item = galeria.itens[indice];
  if (!item || indice >= galeria.mostrados) return;
  indiceLightbox = indice;

  const { foto, registro: r } = item;
  const url = galeria.urls.get(foto.caminho_storage) || '';
  const img = document.getElementById('lightbox-img');
  img.src = url;
  img.alt = r ? descreverServico(r) : 'Foto do registro';

  const linhas = [];
  if (r) {
    linhas.push(`<b>${escaparHtml(r.encarregado)}</b>`);
    linhas.push(escaparHtml([r.atividade, descreverServico(r), descreverMedicao(r)].filter(Boolean).join(' · ')));
    linhas.push(escaparHtml(`${r.trecho}${r.via ? ' · ' + r.via : ''} · KM ${descreverKm(r)} · Estaca ${descreverEstaca(r)}`));
  }
  const extras = [formatarDataHora(foto.criado_em)];
  if (foto.latitude != null && foto.longitude != null) {
    extras.push(`<a href="https://www.google.com/maps?q=${Number(foto.latitude)},${Number(foto.longitude)}" target="_blank" rel="noopener">ver no mapa</a>`);
  }
  if (url) extras.push(`<a href="${escaparHtml(url)}" target="_blank" rel="noopener">abrir original</a>`);
  linhas.push(`<span class="lb-extras">${extras.join(' · ')}</span>`);

  document.getElementById('lightbox-legenda').innerHTML =
    `<span class="lb-contador">${indice + 1} / ${galeria.itens.length}</span>` + linhas.join('<br>');
  document.getElementById('lightbox-anterior').disabled = indice <= 0;
  document.getElementById('lightbox-proxima').disabled = indice >= galeria.itens.length - 1;
  document.getElementById('lightbox').style.display = 'flex';
}

function navegarLightbox(passo) {
  if (indiceLightbox < 0) return;
  const destino = indiceLightbox + passo;
  if (destino >= 0 && destino < galeria.itens.length) abrirLightbox(destino);
}

function fecharLightbox() {
  indiceLightbox = -1;
  document.getElementById('lightbox').style.display = 'none';
}

function lightboxAberto() {
  return indiceLightbox >= 0;
}

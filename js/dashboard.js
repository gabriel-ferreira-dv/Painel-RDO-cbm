// Renderização da tela: KPIs, gráfico, tabela de atividades, grade de fotos
// e o lightbox. Não faz nenhuma chamada de rede — só lê os dados que
// dados.js já baixou e guardou em cacheRegistros/cacheFotos.

let grafico = null;

/// Quantas linhas de atividade ficam à vista antes de precisar rolar.
const LINHAS_VISIVEIS = 5;

/// Se a lista está expandida. Fica fora de atualizarTabela() para a escolha
/// sobreviver a uma troca de filtro — recolher sozinho a cada filtro seria
/// desfazer o que a pessoa acabou de pedir.
let atividadesExpandidas = false;

// Preenchidos por carregarTudo() (dados.js) a cada "Atualizar"; lidos por
// aplicarFiltrosLocais() para recortar por trecho/encarregado sem nova
// chamada de rede.
let cacheRegistros = [];
let cacheFotos = [];

function mostrarDashboard(user) {
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  // nomeExibicao vem da tabela de gestores (autenticacao.js) — o nome do
  // painel é o que o administrador cadastrou lá, não o que a conta traz.
  document.getElementById('nome-usuario').textContent =
    user.nomeExibicao || user.email;

  const hoje = new Date();
  const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 6);
  document.getElementById('filtro-inicio').value = chaveDia(inicio);
  document.getElementById('filtro-fim').value = chaveDia(hoje);

  carregarTudo();
}

/// Preenche um select com as opções, preservando o que já estava escolhido
/// se aquele valor ainda existir nos dados recém-carregados.
function preencherSelect(id, valores, rotuloTodos) {
  const sel = document.getElementById(id);
  const escolhido = sel.value;
  sel.innerHTML = `<option value="">${rotuloTodos}</option>` +
    valores.map(v => `<option value="${escaparHtml(v)}">${escaparHtml(v)}</option>`).join('');
  sel.value = valores.includes(escolhido) ? escolhido : '';
}

function ordenados(campo, registros = cacheRegistros) {
  return [...new Set(registros.map(r => r[campo]).filter(Boolean))].sort();
}

function popularSelectsDeFiltro() {
  preencherSelect('filtro-trecho', ordenados('trecho'), 'Todos');
  preencherSelect('filtro-encarregado', ordenados('usuario_nome'), 'Todos');
  preencherSelect('filtro-atividade', ordenados('atividade'), 'Todas');
  popularServicos();
}

/// O serviço vem em cascata sob a atividade, como no formulário do app:
/// escolhida a Terraplanagem, o campo lista só os serviços dela. Sem isso, a
/// lista traria dezenas de serviços de todas as frentes misturados.
function popularServicos() {
  const atividade = document.getElementById('filtro-atividade').value;
  const base = atividade
    ? cacheRegistros.filter(r => r.atividade === atividade)
    : cacheRegistros;
  preencherSelect('filtro-servico', ordenados('servico_notavel', base), 'Todos');
}

// Filtro local sobre o que já foi baixado — não bate no servidor de novo, só
// recorta cacheRegistros/cacheFotos.
function aplicarFiltrosLocais() {
  const trecho = document.getElementById('filtro-trecho').value;
  const encarregado = document.getElementById('filtro-encarregado').value;
  const atividade = document.getElementById('filtro-atividade').value;
  const servico = document.getElementById('filtro-servico').value;

  const registrosFiltrados = cacheRegistros.filter(r =>
    (!trecho || r.trecho === trecho)
    && (!encarregado || r.usuario_nome === encarregado)
    && (!atividade || r.atividade === atividade)
    && (!servico || r.servico_notavel === servico));

  const chavesRegistros = new Set(registrosFiltrados.map(r => `${r.dispositivo_id}|${r.id_local}`));
  const fotosFiltradas = cacheFotos.filter(f => chavesRegistros.has(`${f.dispositivo_id}|${f.registro_id_local}`));

  atualizarKpis(registrosFiltrados, fotosFiltradas);
  atualizarGrafico(registrosFiltrados);
  atualizarTabela(registrosFiltrados);
  atualizarFotos(fotosFiltradas, registrosFiltrados);
}

function atualizarKpis(registros, fotos) {
  document.getElementById('kpi-registros').textContent = registros.length;
  document.getElementById('kpi-fotos').textContent = fotos.length;
  const encarregados = new Set(registros.map(r => r.usuario_matricula || r.usuario_nome));
  document.getElementById('kpi-encarregados').textContent = encarregados.size;
}

/// Valor atual de uma variável CSS de tema. O gráfico é desenhado em canvas:
/// as cores dele não vêm do CSS sozinhas, precisam ser lidas e passadas.
function corDoTema(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

/// Guardado para o gráfico poder ser redesenhado na troca de tema sem uma
/// nova passada de filtro.
let registrosNoGrafico = [];

function redesenharGrafico() {
  if (grafico) atualizarGrafico(registrosNoGrafico);
}

function atualizarGrafico(registros) {
  registrosNoGrafico = registros;
  const dias = [];
  const hoje = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(hoje); d.setDate(d.getDate() - i);
    dias.push(chaveDia(d));
  }
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
    const porTerceiro = (r.registrado_por_nome || '').trim();
    const estaca = r.estaca_inicial === r.estaca_final
      ? r.estaca_inicial
      : `${r.estaca_inicial} a ${r.estaca_final}`;
    // Serviço que atravessa o KM guarda o KM do fim em km_final; vazio (ou
    // igual ao do início) é o caso comum, e aí mostra um KM só.
    const kmFinal = (r.km_final || '').trim();
    const km = kmFinal && kmFinal !== r.km ? `${r.km} a ${kmFinal}` : r.km;
    return `
      <tr>
        <td>${formatarDataHora(r.criado_em)}</td>
        <td>${escaparHtml(r.usuario_nome)}${porTerceiro ? `<span class="tag-terceiro" title="Lançado por ${escaparHtml(porTerceiro)}">por terceiro</span>` : ''}</td>
        <td>${escaparHtml(r.trecho)}${r.via ? ' · ' + escaparHtml(r.via) : ''}</td>
        <td>KM ${escaparHtml(km)} · ${escaparHtml(estaca)}</td>
        <td>${escaparHtml(descreverServico(r))}</td>
        <td>${escaparHtml(descreverMedicao(r))}</td>
      </tr>`;
  }).join('');

  ajustarAlturaAtividades();
}

/// Recolhe a lista de atividades às primeiras [LINHAS_VISIVEIS] linhas, ou
/// solta a altura quando expandida.
///
/// A altura é MEDIDA, não calculada: linha com estaca longa ou nome grande
/// quebra em duas, e um valor fixo cortaria a décima linha ao meio numa
/// listagem e sobraria espaço em branco na outra.
function ajustarAlturaAtividades() {
  const wrap = document.getElementById('wrap-atividades');
  const botao = document.getElementById('botao-expandir-atividades');
  const linhas = wrap.querySelectorAll('tbody tr');

  // Medir com a altura solta; se sobrasse o limite anterior, a régua seria a
  // janela rolável e não o conteúdo.
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
  // Ao recolher, a página pode ficar rolada num ponto que já não existe.
  if (!atividadesExpandidas) {
    document.getElementById('wrap-atividades')
        .scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// Fotos: o bucket é privado, então cada exibição exige uma URL assinada —
// geradas em lote (uma chamada para todas, não uma por foto).
async function atualizarFotos(fotos, registros) {
  const grade = document.getElementById('grade-fotos');
  document.getElementById('contagem-fotos').textContent = `${fotos.length} foto(s)`;

  if (fotos.length === 0) {
    grade.innerHTML = '<div class="vazio">Nenhuma foto no período/filtro selecionado.</div>';
    return;
  }

  grade.innerHTML = '<div class="carregando">Carregando fotos…</div>';

  const porChave = new Map(registros.map(r => [`${r.dispositivo_id}|${r.id_local}`, r]));
  // Mais recentes primeiro, e um teto para não gerar milhares de URLs assinadas
  // de uma vez só quando o período for muito largo.
  const fotosParaMostrar = fotos.slice(0, 200);

  const caminhos = fotosParaMostrar.map(f => f.caminho_storage);
  const { data: assinadas, error } = await sb.storage.from(BUCKET_FOTOS).createSignedUrls(caminhos, 3600);
  if (error) {
    grade.innerHTML = `<div class="vazio">Falha ao gerar links das fotos: ${escaparHtml(error.message)}</div>`;
    return;
  }
  const urlPorCaminho = new Map(assinadas.map(a => [a.path, a.signedUrl]));

  grade.innerHTML = fotosParaMostrar.map(f => {
    const url = urlPorCaminho.get(f.caminho_storage);
    const registro = porChave.get(`${f.dispositivo_id}|${f.registro_id_local}`);
    const legendaServico = registro ? descreverServico(registro) : '';
    const legendaLocal = registro ? `${escaparHtml(registro.trecho)} · Estaca ${escaparHtml(registro.estaca_inicial)}` : '';
    const nome = registro ? escaparHtml(registro.usuario_nome) : '';
    return `
      <div class="foto-item" data-url="${url || ''}">
        <img src="${url || ''}" loading="lazy" alt="Foto do registro">
        <div class="legenda">
          <b>${nome}</b>
          ${escaparHtml(legendaServico)}<br>${legendaLocal}<br>${formatarDataHora(f.criado_em)}
        </div>
      </div>`;
  }).join('');

  if (fotos.length > fotosParaMostrar.length) {
    grade.innerHTML += `<div class="vazio" style="grid-column:1/-1">Mostrando as ${fotosParaMostrar.length} mais recentes de ${fotos.length}. Filtre por trecho ou encarregado para ver as demais.</div>`;
  }

  grade.querySelectorAll('.foto-item').forEach(el => {
    el.addEventListener('click', () => abrirLightbox(el.getAttribute('data-url')));
  });
}

function abrirLightbox(url) {
  if (!url) return;
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').style.display = 'flex';
}

function fecharLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}

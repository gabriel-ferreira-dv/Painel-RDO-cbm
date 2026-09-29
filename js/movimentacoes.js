const NOMES_DE_EVENTO = {
  acesso: 'Acesso',
  periodo: 'Período',
  filtros: 'Filtros',
  pdf: 'PDF',
  mapa: 'Mapa',
  senha_trocada: 'Senha trocada',
  saiu: 'Saiu',
};

let movimentacoesAtuais = [];

function mostrarTela(id) {
  for (const t of ['tela-negado', 'pagina-admin']) document.getElementById(t).hidden = t !== id;
  document.documentElement.classList.remove('verificando');
}

function dataBrDaChave(chave) {
  const [a, m, d] = String(chave || '').split('-');
  return a && m && d ? `${d}/${m}/${a}` : chave || '';
}

function descreverMovimentacao(evento, det = {}) {
  switch (evento) {
    case 'acesso':
      return det.tipo === 'login' ? 'Entrou com senha' : 'Voltou com a sessão salva';
    case 'periodo':
      return `${dataBrDaChave(det.de)} a ${dataBrDaChave(det.ate)}${det.atalho ? ` (${det.atalho})` : ''}`;
    case 'filtros':
      return det.filtros ? det.filtros : 'Limpou os filtros';
    case 'pdf':
      return [
        det.periodo,
        det.registros != null ? `${det.registros} registros` : '',
        det.fotos ? 'com fotos' : '',
        det.mapa ? 'com mapa' : '',
        det.filtros || '',
      ].filter(Boolean).join(' · ');
    case 'mapa':
      return 'Abriu o mapa das atividades';
    case 'senha_trocada':
      return 'Trocou a senha provisória';
    case 'saiu':
      return 'Saiu do painel';
    default:
      return JSON.stringify(det);
  }
}

function tempoDesde(iso) {
  if (!iso) return '';
  const dias = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

function situacaoDoGestor(g) {
  if (!g.ultimo_login && !g.ultimo_uso) return { texto: 'Nunca entrou', classe: 'alerta' };
  if (g.trocar_senha) return { texto: 'Não trocou a senha', classe: 'aviso' };
  const referencia = g.ultimo_uso || g.ultimo_login;
  const dias = Math.floor((Date.now() - new Date(referencia)) / 86400000);
  if (dias >= 7) return { texto: `Sem uso há ${dias} dias`, classe: 'aviso' };
  return { texto: 'Ativo', classe: 'ok' };
}

function intervaloDasDatas() {
  const de = document.getElementById('mov-inicio').value;
  const ate = document.getElementById('mov-fim').value;
  return {
    de: inicioDoDia(de ? new Date(de + 'T00:00:00') : new Date()),
    ate: fimDoDia(ate ? new Date(ate + 'T00:00:00') : new Date()),
  };
}

function aplicarAtalhoMov(dias) {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - dias);
  document.getElementById('mov-inicio').value = chaveDia(inicio);
  document.getElementById('mov-fim').value = chaveDia(hoje);
  marcarAtalhoMov();
}

function marcarAtalhoMov() {
  const de = document.getElementById('mov-inicio').value;
  const ate = document.getElementById('mov-fim').value;
  const hoje = chaveDia(new Date());
  for (const b of document.querySelectorAll('#atalhos-mov button')) {
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - Number(b.dataset.dias));
    b.classList.toggle('ativo', ate === hoje && de === chaveDia(inicio));
  }
}

async function carregarResumoGestores() {
  const corpo = document.getElementById('corpo-gestores');
  const { data, error } = await sb.rpc('resumo_uso_painel');
  if (error) {
    corpo.innerHTML = `<tr><td colspan="7" class="vazio">Falha ao carregar: ${escaparHtml(error.message)}</td></tr>`;
    return;
  }
  const gestores = [...data].sort((a, b) =>
    String(b.ultimo_uso || b.ultimo_login || '').localeCompare(String(a.ultimo_uso || a.ultimo_login || ''))
    || a.nome.localeCompare(b.nome, 'pt-BR'));

  const selecao = document.getElementById('mov-gestor');
  const escolhido = selecao.value;
  selecao.innerHTML = '<option value="">Todos</option>' + [...gestores]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(g => `<option value="${escaparHtml(g.user_id)}">${escaparHtml(g.nome)}</option>`).join('');
  selecao.value = gestores.some(g => g.user_id === escolhido) ? escolhido : '';

  const contagem = { ativos: 0, nunca: 0 };
  corpo.innerHTML = gestores.map(g => {
    const s = situacaoDoGestor(g);
    if (s.classe === 'ok') contagem.ativos++;
    if (s.texto === 'Nunca entrou') contagem.nunca++;
    const ultimo = g.ultimo_uso || g.ultimo_login;
    return `
      <tr>
        <td class="col-gestor"><b>${escaparHtml(g.nome)}</b><div class="email-gestor">${escaparHtml(g.email)}</div></td>
        <td data-rotulo="Situação"><span class="selo-situacao ${s.classe}">${escaparHtml(s.texto)}</span></td>
        <td data-rotulo="Último uso">${ultimo ? `${formatarDataHora(ultimo)} <span class="tempo-desde">(${tempoDesde(ultimo)})</span>` : '—'}</td>
        <td data-rotulo="Acessos (30 dias)">${g.acessos_30d}</td>
        <td data-rotulo="Dias com uso (30 dias)">${g.dias_30d}</td>
        <td data-rotulo="PDFs (30 dias)">${g.pdfs_30d}</td>
        <td data-rotulo="Aparelhos">${escaparHtml(g.dispositivos || '—')}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="7" class="vazio">Nenhum gestor cadastrado.</td></tr>';
  document.getElementById('contagem-gestores').textContent =
    `${gestores.length} gestores · ${contagem.ativos} ativos · ${contagem.nunca} nunca entraram`;
}

async function carregarMovimentacoes() {
  const alvo = document.getElementById('linha-do-tempo');
  const status = document.getElementById('mov-status');
  status.textContent = 'Atualizando…';
  const { de, ate } = intervaloDasDatas();
  const { data, error } = await sb.rpc('movimentacoes_painel', {
    p_de: de.toISOString(),
    p_ate: ate.toISOString(),
    p_user: document.getElementById('mov-gestor').value || null,
    p_evento: document.getElementById('mov-evento').value || null,
    p_limite: 2000,
  });
  if (error) {
    status.textContent = '';
    alvo.innerHTML = `<div class="vazio">Falha ao carregar: ${escaparHtml(error.message)}</div>`;
    return;
  }
  movimentacoesAtuais = data;

  const acessos = data.filter(m => m.evento === 'acesso').length;
  document.getElementById('kpi-mov-acessos').textContent = acessos;
  document.getElementById('kpi-mov-gestores').textContent = new Set(data.map(m => m.user_id)).size;
  document.getElementById('kpi-mov-pdfs').textContent = data.filter(m => m.evento === 'pdf').length;
  document.getElementById('kpi-mov-total').textContent = data.length;
  document.getElementById('contagem-mov').textContent =
    data.length >= 2000 ? 'mostrando as 2000 mais recentes' : `${data.length} no período`;

  if (data.length === 0) {
    alvo.innerHTML = '<div class="vazio">Nenhuma movimentação no período e filtros selecionados.</div>';
  } else {
    let diaAtual = null;
    const partes = [];
    for (const m of data) {
      const dia = chaveDia(m.criado_em);
      if (dia !== diaAtual) {
        if (diaAtual) partes.push('</ul>');
        diaAtual = dia;
        partes.push(`<div class="dia-fotos">${formatarDiaExtenso(m.criado_em)}</div><ul class="lista-movimentacoes">`);
      }
      partes.push(`
        <li>
          <span class="mov-hora">${formatarHora(m.criado_em)}</span>
          <span class="mov-corpo">
            <span class="mov-linha"><b>${escaparHtml(m.nome)}</b><span class="selo-evento evento-${escaparHtml(m.evento)}">${escaparHtml(NOMES_DE_EVENTO[m.evento] || m.evento)}</span></span>
            <span class="mov-detalhe">${escaparHtml(descreverMovimentacao(m.evento, m.detalhes || {}))}</span>
          </span>
          <span class="mov-aparelho">${escaparHtml(m.dispositivo || '')}</span>
        </li>`);
    }
    partes.push('</ul>');
    alvo.innerHTML = partes.join('');
  }
  status.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
}

function baixarCsvMovimentacoes() {
  const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['Data', 'Hora', 'Gestor', 'E-mail', 'Movimentação', 'Detalhe', 'Aparelho'].map(campo).join(';')];
  for (const m of movimentacoesAtuais) {
    const d = new Date(m.criado_em);
    linhas.push([
      d.toLocaleDateString('pt-BR'), formatarHora(m.criado_em), m.nome, m.email,
      NOMES_DE_EVENTO[m.evento] || m.evento, descreverMovimentacao(m.evento, m.detalhes || {}), m.dispositivo,
    ].map(campo).join(';'));
  }
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `movimentacoes_painel_${document.getElementById('mov-inicio').value}_a_${document.getElementById('mov-fim').value}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function atualizarTudoMov() {
  await Promise.all([carregarResumoGestores(), carregarMovimentacoes()]);
}

async function iniciarPaginaAdmin() {
  aplicarTema(temaInicial());
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      location.replace('index.html');
      return;
    }
    const { data: admin, error } = await sb.rpc('sou_admin_painel');
    if (error || admin !== true) {
      if (error) document.getElementById('texto-negado').textContent =
        'Não foi possível confirmar o acesso: ' + error.message;
      mostrarTela('tela-negado');
      return;
    }
  } catch (e) {
    document.getElementById('texto-negado').textContent = 'Não foi possível confirmar o acesso: ' + e.message;
    mostrarTela('tela-negado');
    return;
  }
  mostrarTela('pagina-admin');
  aplicarAtalhoMov(6);
  atualizarTudoMov();
}

document.getElementById('atalhos-mov').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-dias]');
  if (!b) return;
  aplicarAtalhoMov(Number(b.dataset.dias));
  carregarMovimentacoes();
});
for (const id of ['mov-inicio', 'mov-fim']) {
  document.getElementById(id).addEventListener('change', marcarAtalhoMov);
}
for (const id of ['mov-gestor', 'mov-evento']) {
  document.getElementById(id).addEventListener('change', carregarMovimentacoes);
}
document.getElementById('mov-atualizar').addEventListener('click', atualizarTudoMov);
document.getElementById('mov-csv').addEventListener('click', baixarCsvMovimentacoes);
document.getElementById('botao-tema').addEventListener('click', alternarTema);
document.getElementById('botao-sair').addEventListener('click', async () => {
  try { sessionStorage.removeItem('uso-acesso'); } catch {}
  await sb.auth.signOut();
  location.replace('index.html');
});

iniciarPaginaAdmin();

const VALIDADE_DOS_LINKS_S = 3600;
const FOLGA_DOS_LINKS_MS = 10 * 60 * 1000;

class LinksAssinados extends Map {
  set(caminho, url) {
    return super.set(caminho, { url, vence: Date.now() + VALIDADE_DOS_LINKS_S * 1000 - FOLGA_DOS_LINKS_MS });
  }

  get(caminho) {
    const link = super.get(caminho);
    return link && link.vence > Date.now() ? link.url : undefined;
  }

  has(caminho) {
    return this.get(caminho) !== undefined;
  }
}

function quemCorrigiu(valor) {
  const t = String(valor || '').trim();
  if (!t) return '';
  return /^admin\b/i.test(t) ? 'um administrador' : `matrícula ${t}`;
}

function chaveDia(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function inicioDoDia(date) { const d = new Date(date); d.setHours(0,0,0,0); return d; }

function fimDoDia(date) { const d = new Date(date); d.setHours(23,59,59,999); return d; }

function formatarDataHora(iso) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function formatarQuantidade(v) {
  let t = v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  return t.replace('.', ',');
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function descreverServico(r) {
  const passo = (r.servico_notavel_detalhe || '').trim();
  let texto = r.servico_notavel || '';
  if (passo) texto += ` (${passo})`;
  return texto;
}

function descreverMedicao(r) {
  if (r.quantidade == null || !r.unidade) return '';
  return `${formatarQuantidade(r.quantidade)} ${r.unidade}`;
}

const PARTICULAS_NOME = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function limparEspacos(s) {
  return String(s || '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

function chaveNome(nome) {
  return semAcento(limparEspacos(nome)).toLowerCase();
}

function capitalizarNome(nome) {
  return limparEspacos(nome).toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && PARTICULAS_NOME.has(p)) ? p : p.replace(/\p{L}/u, c => c.toUpperCase()))
    .join(' ');
}

function padronizarEncarregados(linhas) {
  const chavePorMatricula = new Map();
  const grafias = new Map();

  for (const r of linhas) {
    const matricula = String(r.usuario_matricula || '').trim();
    let chave = matricula && chavePorMatricula.get(matricula);
    if (!chave) {
      chave = chaveNome(r.usuario_nome) || `matricula:${matricula}`;
      if (matricula) chavePorMatricula.set(matricula, chave);
    }
    r.encarregado_chave = chave;

    const formatado = capitalizarNome(r.usuario_nome);
    if (!formatado) continue;
    if (!grafias.has(chave)) grafias.set(chave, new Map());
    const cont = grafias.get(chave);
    cont.set(formatado, (cont.get(formatado) || 0) + 1);
  }

  const acentos = s => s.normalize('NFD').length - s.length;
  const nomePorChave = new Map();
  for (const [chave, cont] of grafias) {
    const [melhor] = [...cont].sort((a, b) => b[1] - a[1] || acentos(b[0]) - acentos(a[0]));
    nomePorChave.set(chave, melhor[0]);
  }
  for (const r of linhas) {
    r.encarregado = nomePorChave.get(r.encarregado_chave) || '(sem nome)';
  }
}

function estacaEmNumero(txt) {
  const m = String(txt || '').trim().match(/^(\d+)(?:\s*\+\s*(\d+(?:[.,]\d+)?))?$/);
  if (!m) return NaN;
  return Number(m[1]) + (m[2] ? Number(m[2].replace(',', '.')) / 20 : 0);
}

function descreverKm(r) {
  const km = String(r.km || '').trim();
  const kmFinal = String(r.km_final || '').trim();
  if (!km) return kmFinal;
  return kmFinal && kmFinal !== km ? `${km} a ${kmFinal}` : km;
}

function textoDoKm(r) {
  const km = descreverKm(r);
  return km ? `KM ${km}` : '';
}

function descreverLocal(r, rotuloEstaca = '') {
  const estaca = String(descreverEstaca(r) || '').trim();
  return [textoDoKm(r), estaca ? `${rotuloEstaca ? rotuloEstaca + ' ' : ''}${estaca}` : '']
    .filter(Boolean).join(' · ');
}

function temKmNosRegistros(registros) {
  return registros.some(r => String(r.km || '').trim() || String(r.km_final || '').trim());
}

function descreverEstaca(r) {
  return !r.estaca_final || r.estaca_inicial === r.estaca_final
    ? r.estaca_inicial
    : `${r.estaca_inicial} a ${r.estaca_final}`;
}

function registroCobreKm(r, km) {
  const a = Number(r.km);
  const b = Number(String(r.km_final || '').trim() || r.km);
  const k = Number(km);
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(k)) return r.km === km;
  return k >= Math.min(a, b) && k <= Math.max(a, b);
}

function registroCobreEstacas(r, de, ate) {
  const ini = estacaEmNumero(r.estaca_inicial);
  const fim = estacaEmNumero(r.estaca_final || r.estaca_inicial);
  if (Number.isNaN(ini)) return false;
  const lo = Math.min(ini, Number.isNaN(fim) ? ini : fim);
  const hi = Math.max(ini, Number.isNaN(fim) ? ini : fim);
  return (Number.isNaN(de) || hi >= de) && (Number.isNaN(ate) || lo <= ate);
}

function formatarDiaExtenso(iso) {
  const d = new Date(iso);
  const txt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function formatarHora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function temSessaoGuardada() {
  try {
    return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k));
  } catch {
    return false;
  }
}

const CHAVE_PAPEL_GUARDADO = 'papel-admin';

function guardarPapel(papel) {
  try { sessionStorage.setItem(CHAVE_PAPEL_GUARDADO, JSON.stringify(papel || null)); } catch {}
}

function papelGuardado() {
  try {
    const texto = sessionStorage.getItem(CHAVE_PAPEL_GUARDADO);
    return texto === null ? undefined : JSON.parse(texto);
  } catch {
    return undefined;
  }
}

function mostrarLinksDoPapel(papel) {
  const permissoes = papel?.permissoes || {};
  const visivel = { 'link-admin': !!papel, 'link-gestao': !!papel && permissoes.usuarios === true, 'link-dados': !!papel && permissoes.dados === true };
  for (const [id, mostra] of Object.entries(visivel)) {
    const el = document.getElementById(id);
    if (el) el.hidden = !mostra;
  }
}

function adiantarLinksDoPapel() {
  const papel = papelGuardado();
  if (papel !== undefined) mostrarLinksDoPapel(papel);
}

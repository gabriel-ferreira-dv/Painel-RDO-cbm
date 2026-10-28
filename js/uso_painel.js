function descreverDispositivo() {
  const ua = navigator.userAgent;
  const tipo = /Mobi|Android|iPhone|iPad/i.test(ua) || window.matchMedia('(pointer: coarse)').matches
    ? 'celular' : 'computador';
  const navegador = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'outro';
  return `${tipo} · ${navegador}`;
}

const DISPOSITIVO_DO_USO = descreverDispositivo();

async function registrarUso(evento, detalhes = {}) {
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return;
    const { error } = await sb.from('uso_painel').insert({
      user_id: user.id, evento, detalhes, dispositivo: DISPOSITIVO_DO_USO,
    });
    if (error) console.warn('Registro de uso não gravado:', error.message);
  } catch (e) {
    console.warn('Registro de uso não gravado:', e);
  }
}

const violacoesRegistradas = new Set();

document.addEventListener('securitypolicyviolation', (e) => {
  const chave = `${e.effectiveDirective}|${e.blockedURI}`;
  if (violacoesRegistradas.has(chave) || violacoesRegistradas.size >= 20) return;
  violacoesRegistradas.add(chave);
  registrarUso('csp', {
    diretiva: e.effectiveDirective,
    bloqueado: String(e.blockedURI || '').slice(0, 200),
    pagina: location.pathname.split('/').pop() || 'index.html',
    modo: e.disposition,
  });
});

function registrarUsoComLimite(evento, detalhes, ms = 1500) {
  return Promise.race([registrarUso(evento, detalhes), new Promise(r => setTimeout(r, ms))]);
}

function registrarAcesso(tipo) {
  try {
    if (tipo === 'sessao' && sessionStorage.getItem('uso-acesso')) return;
    sessionStorage.setItem('uso-acesso', '1');
  } catch {}
  registrarUso('acesso', { tipo });
}

let ehAdminPainel = false;
let papelAdminPainel = null;

async function mostrarLinkAdmin() {
  papelAdminPainel = await lerPapelAdmin();
  ehAdminPainel = !!papelAdminPainel && papelAdminPainel.permissoes?.registros === true;
  mostrarLinksDoPapel(papelAdminPainel);
  document.getElementById('lightbox-excluir').hidden = !ehAdminPainel;
  document.body.classList.toggle('modo-admin', ehAdminPainel);
}

function periodoDosCampos() {
  return {
    de: document.getElementById('filtro-inicio').value,
    ate: document.getElementById('filtro-fim').value,
  };
}

let esperaFiltrosUso = null;
let ultimosFiltrosUso = '';

function agendarRegistroDeFiltros() {
  clearTimeout(esperaFiltrosUso);
  esperaFiltrosUso = setTimeout(() => {
    const filtros = descreverFiltrosAtivos();
    if (filtros === ultimosFiltrosUso) return;
    ultimosFiltrosUso = filtros;
    registrarUso('filtros', { filtros });
  }, 4000);
}

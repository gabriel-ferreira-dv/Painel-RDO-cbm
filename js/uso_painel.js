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

const PERMISSOES_DO_ADMAPP = { usuarios: true, registros: true, dados: true };

async function lerPapelAdmin() {
  try {
    const { data, error } = await sb.rpc('meu_papel_admin');
    if (!error) {
      const papel = data && data.papel ? data : null;
      guardarPapel(papel);
      return papel;
    }
    const antigo = await sb.rpc('sou_admin_painel');
    const papel = !antigo.error && antigo.data === true ? { papel: 'geral', permissoes: PERMISSOES_DO_ADMAPP } : null;
    guardarPapel(papel);
    return papel;
  } catch {
    return null;
  }
}

async function mostrarLinkAdmin() {
  papelAdminPainel = await lerPapelAdmin();
  const permissoes = papelAdminPainel?.permissoes || {};
  ehAdminPainel = !!papelAdminPainel && permissoes.registros === true;
  document.getElementById('link-admin').hidden = !papelAdminPainel;
  const linkGestao = document.getElementById('link-gestao');
  if (linkGestao) linkGestao.hidden = !(papelAdminPainel && permissoes.usuarios === true);
  const linkDados = document.getElementById('link-dados');
  if (linkDados) linkDados.hidden = !(papelAdminPainel && permissoes.dados === true);
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

// Login, logout e restauração de sessão. Único arquivo que decide se uma
// conta pode ver o dashboard — a checagem fica só aqui, nunca duplicada nos
// outros módulos.
//
// Quem pode entrar é a tabela `gestores_painel`, não um campo do usuário. Uma
// conta do app (encarregado, supervisor) autentica normalmente no Supabase,
// mas não está nessa lista e para na porta. A lista é escrita só pelo
// administrador, via SQL — ver supabase/painel_gestores.sql.
//
// Esta checagem controla o que a TELA mostra. Quem de fato barra o acesso aos
// dados são as políticas de RLS do servidor, que consultam a mesma tabela: um
// curioso que burlasse a tela receberia listas vazias do mesmo jeito.

function mostrarErroLogin(msg) {
  const el = document.getElementById('erro-login');
  el.textContent = msg;
  el.style.display = 'block';
}

/// Nome do gestor se a conta tiver acesso ao painel, ou null se não tiver.
///
/// A política da tabela deixa cada um enxergar apenas a própria linha, então
/// "não achou" e "não tem acesso" são a mesma resposta — que é exatamente o
/// necessário aqui.
async function acessoDeGestor(user) {
  const { data, error } = await sb
    .from('gestores_painel')
    .select('nome')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.nome || user.email) : null;
}

async function tentarLogin(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;

  const nome = await acessoDeGestor(data.user);
  if (nome === null) {
    // Credencial válida, mas é uma conta do app. Sai da sessão para não deixar
    // um token autenticado aberto numa máquina que não deveria ter acesso.
    await sb.auth.signOut();
    throw new Error('SEM_ACESSO');
  }
  return { ...data.user, nomeExibicao: nome };
}

async function sair() {
  await sb.auth.signOut();
  location.reload();
}

// Restaura sessão já existente (persistida em localStorage pelo próprio
// supabase-js), para não pedir login de novo a cada F5.
//
// A lista é conferida de novo aqui, e não só no login: se o acesso foi
// revogado desde a última visita, a sessão salva não serve mais de passe.
async function restaurarSessao() {
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  try {
    const nome = await acessoDeGestor(user);
    if (nome === null) {
      await sb.auth.signOut();
      return;
    }
    mostrarDashboard({ ...user, nomeExibicao: nome });
  } catch (e) {
    // Sem rede na abertura: fica na tela de login em vez de abrir um painel
    // que não conseguiria carregar dado nenhum.
    console.error('Não foi possível confirmar o acesso:', e);
  }
}

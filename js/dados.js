// Busca de dados no Supabase. As únicas funções deste arquivo que tocam a
// rede — dashboard.js só lê o que aqui é guardado em cacheRegistros/cacheFotos.

// O PostgREST do Supabase corta cada resposta em "Max Rows" (1000 por padrão),
// ignorando um .limit() maior. Por isso a busca é feita em páginas até vir uma
// página incompleta ou atingir LIMITE_LINHAS. `montarConsulta` precisa devolver
// uma consulta nova a cada chamada (o builder não pode ser reaproveitado).
const TAMANHO_PAGINA = 1000;

async function buscarTodasAsLinhas(montarConsulta) {
  const linhas = [];
  while (linhas.length < LIMITE_LINHAS) {
    const de = linhas.length;
    const ate = Math.min(de + TAMANHO_PAGINA, LIMITE_LINHAS) - 1;
    const { data, error } = await montarConsulta().range(de, ate);
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < ate - de + 1) break;
  }
  return linhas;
}

async function carregarTudo() {
  const status = document.getElementById('status-atualizacao');
  status.textContent = 'Atualizando…';

  const inicioStr = document.getElementById('filtro-inicio').value;
  const fimStr = document.getElementById('filtro-fim').value;
  const inicio = inicioDoDia(inicioStr ? new Date(inicioStr + 'T00:00:00') : new Date());
  const fim = fimDoDia(fimStr ? new Date(fimStr + 'T00:00:00') : new Date());

  try {
    const [registros, fotos] = await Promise.all([
      buscarTodasAsLinhas(() => sb
        .from('registros_app')
        .select('*')
        .gte('criado_em', inicio.toISOString())
        .lte('criado_em', fim.toISOString())
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })),
      buscarTodasAsLinhas(() => sb
        .from('fotos_app')
        .select('*')
        .gte('criado_em', inicio.toISOString())
        .lte('criado_em', fim.toISOString())
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })),
    ]);

    cacheRegistros = registros;
    cacheFotos = fotos;

    popularSelectsDeFiltro();
    await carregarQuemFaltouHoje();
    aplicarFiltrosLocais();

    status.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
  } catch (err) {
    status.textContent = '';
    alert('Falha ao carregar dados: ' + err.message);
    console.error(err);
  }
}

// "Sem apontamento hoje": compara quem registrou nos últimos 30 dias
// (considerado "ativo") com quem já registrou HOJE. A janela de 30 dias
// existe para não listar como "faltante" alguém que só passou pela obra uma
// vez há meses.
async function carregarQuemFaltouHoje() {
  const listaEl = document.getElementById('lista-faltantes');
  listaEl.innerHTML = '<div class="carregando">Carregando…</div>';

  const hoje = new Date();
  const trintaDiasAtras = new Date(hoje); trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  try {
    const ativos = await buscarTodasAsLinhas(() => sb
      .from('registros_app')
      .select('usuario_nome, usuario_matricula, criado_em')
      .gte('criado_em', inicioDoDia(trintaDiasAtras).toISOString())
      .order('criado_em', { ascending: false })
      .order('id', { ascending: false }));

    const inicioHoje = inicioDoDia(hoje).toISOString();
    const porPessoa = new Map(); // matricula|nome -> {nome, ultimoRegistro, apontouHoje}
    for (const r of ativos) {
      const chave = r.usuario_matricula || r.usuario_nome;
      const existente = porPessoa.get(chave);
      const apontouHoje = r.criado_em >= inicioHoje;
      if (!existente) {
        porPessoa.set(chave, { nome: r.usuario_nome, ultimoRegistro: r.criado_em, apontouHoje });
      } else if (apontouHoje) {
        existente.apontouHoje = true;
      }
    }

    const faltantes = [...porPessoa.values()]
      .filter(p => !p.apontouHoje)
      .sort((a, b) => b.ultimoRegistro.localeCompare(a.ultimoRegistro));

    document.getElementById('kpi-faltantes').textContent = faltantes.length;
    document.getElementById('contagem-faltantes').textContent = `${faltantes.length} de ${porPessoa.size}`;

    if (faltantes.length === 0) {
      listaEl.innerHTML = '<div class="vazio-ok">✓ Todos os encarregados ativos já registraram hoje.</div>';
      return;
    }
    listaEl.innerHTML = '<ul class="lista-faltantes">' + faltantes.map(p => `
      <li>
        <span>${escaparHtml(p.nome)}</span>
        <span class="ult-registro">último: ${formatarDataHora(p.ultimoRegistro)}</span>
      </li>`).join('') + '</ul>';
  } catch (err) {
    listaEl.innerHTML = `<div class="vazio">Falha ao calcular: ${escaparHtml(err.message)}</div>`;
  }
}

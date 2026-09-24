// Funções puras de formatação e escape — sem estado, sem chamada de rede.
// Reaproveitadas por dados.js e dashboard.js.

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

// 120 vira "120", 12.5 vira "12,5" — vírgula decimal, padrão pt-BR, sem
// casas decimais desnecessárias. Mesma regra de formatarQuantidade() no app
// (lib/features/registro/models/grupo_atividade.dart).
function formatarQuantidade(v) {
  let t = v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  return t.replace('.', ',');
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Descrição de uma atividade — mesma leitura usada no RDO em PDF, para quem
// já conhece o relatório reconhecer o formato aqui.
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

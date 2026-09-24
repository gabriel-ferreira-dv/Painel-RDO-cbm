// Configuração do projeto Supabase (Dashboard → Settings → API Keys).
//
// A chave "publishable" é pública por design — ela já vai embutida no APK do
// app mobile. Quem protege os dados não é o sigilo desta chave, e sim as
// políticas de RLS (ver supabase/add_gestor.sql): só uma sessão logada com
// perfil = 'gestor' consegue ler algo.
const SUPABASE_URL = 'https://lsrjjyybcvszuxksruqm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bW3-cH1lwHiQRl9PNPa-nA_fsiJXuDz';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET_FOTOS = 'fotos';

// Acima disso o Postgrest pagina; no volume desta obra não deve ser atingido,
// mas o teto evita que um período muito largo trave o painel silenciosamente.
const LIMITE_LINHAS = 10000;

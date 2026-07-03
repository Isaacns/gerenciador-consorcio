/* VIZIO · Gerenciador de Consórcio — configuração da instância (modo SUPABASE)
   Login real (e-mail + senha) e dados na nuvem (tabelas cs_*).
   Os arrays começam vazios: carregados do Supabase após o login.
   ⚠️ TODO (provisionamento): preencher supabaseUrl/supabaseKey do projeto novo
      "vizio-consorcio" e a assinaturaUrl (checkout Stripe do produto Consórcio).
      A publishable key é pública por design; NÃO colocar service role key aqui. */
const DADOS = {
  _meta: { produto: "Gerenciador de Consórcio", instancia: "—", fonte: "Supabase", gerado: "03/07/2026" },
  _cfg: {
    produto: "Gerenciador de Consórcio",
    instancia: "—",
    propLabel: "Consorciado",
    trialDays: 0,
    // Projeto Supabase vizio-consorcio (sa-east-1, ref pakugltmsipykvxiffdw).
    supabaseUrl: "https://pakugltmsipykvxiffdw.supabase.co",
    supabaseKey: "sb_publishable_AObCS9umaj_a0J_3Nu4GQw_4HSEQ36a",
    // TODO: link de checkout do produto "Vizio Consórcio — Mensal" (Stripe)
    assinaturaUrl: "https://buy.stripe.com/PREENCHER"
  },
  // Coleções cs_* — carregadas após login (RLS por user_id).
  cotas: [],
  parcelas: [],
  eventos: [],
  perfis: []
};

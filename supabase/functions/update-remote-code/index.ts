import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Configurações do Banco de Destino (Banco B)
// É RECOMENDADO usar variáveis de ambiente para isso, mas usarei as constantes baseadas no seu pedido.
// Nota: Para fazer UPDATE, o ideal é usar a SERVICE_ROLE_KEY se o RLS bloquear a Anon Key.
const TARGET_DB_URL = 'https://kufzjehgjhaxmokzkujk.supabase.co'

Deno.serve(async (req) => {
  try {
    // 1. Recebe o payload do Trigger do Banco A
    const { record } = await req.json()

    // Validação simples
    if (!record || !record.id || !record.project_code) {
      return new Response('Dados incompletos recebidos', { status: 400 })
    }

    // 2. Pega a chave do Banco B das variáveis de ambiente (Mais seguro)
    // Você deve configurar isso usando: supabase secrets set TARGET_DB_SERVICE_KEY=...
    const targetServiceKey = Deno.env.get('TARGET_DB_SERVICE_KEY')

    if (!targetServiceKey) {
      throw new Error('Chave do banco de destino não configurada')
    }

    // 3. Conecta no Banco B
    const targetSupabase = createClient(TARGET_DB_URL, targetServiceKey)

    console.log(`Atualizando logs para ID_CCT: ${record.id} com Código: ${record.project_code}`)

    // 4. Executa o Update no Banco B
    // A lógica: Onde 'id_cct' for igual ao ID da proposal, atualize o 'project_code'
    const { data, error } = await targetSupabase
      .from('automation_logs')
      .update({ project_code: record.project_code })
      .eq('id_cct', record.id) // O "ponto comum" que você mencionou
      .select()

    if (error) {
      console.error('Erro ao atualizar Banco B:', error)
      return new Response(JSON.stringify(error), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true, updated: data }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
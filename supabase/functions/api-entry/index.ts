import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { addBusinessDays } from "https://esm.sh/date-fns@2.30.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    // Create a Supabase client with the Auth context of the function
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const { type, data } = await req.json()

    if (!type || !data) {
      throw new Error('Missing "type" (proposal|request) or "data" object in request body.')
    }

    let result;

    if (type === 'proposal') {
      // PROPOSAL LOGIC: Create or Update
      const { id, title, description, attachments, status, deadline, project_code } = data
      
      const allowedStatuses = [
        'new', 'in_review', 'awaiting_code', 'awaiting_contract', 'operational_start',
        'understanding', 'construction', 'delivered', 'cancelled'
      ];

      // Caso 1: ATUALIZAÇÃO (Se ID for fornecido)
      if (id) {
        const updatePayload: any = { updated_at: new Date().toISOString() };
        
        // Atualiza apenas os campos que foram enviados
        if (title) updatePayload.title = title;
        if (description) updatePayload.description = description;
        if (project_code) updatePayload.project_code = project_code;
        if (deadline) updatePayload.deadline = deadline;
        
        if (status) {
          if (!allowedStatuses.includes(status)) {
             throw new Error(`Invalid status: ${status}.`);
          }
          updatePayload.status = status;
        }

        // Se houver anexos novos, a lógica ideal seria mesclar ou substituir. 
        // Aqui, para simplificar e manter idempotência, se enviar substitui.
        if (attachments) updatePayload.attachments = attachments;

        result = await supabase
          .from('proposals')
          .update(updatePayload)
          .eq('id', id)
          .select()
          .single();

      } 
      // Caso 2: CRIAÇÃO (Sem ID)
      else {
        if (!title) throw new Error('Proposal "title" is required');

        const initialStatus = status || 'new';
        if (!allowedStatuses.includes(initialStatus)) {
           throw new Error(`Invalid status: ${initialStatus}. Allowed: ${allowedStatuses.join(', ')}`);
        }

        // Lógica do Prazo (Deadline) para criação
        const entryDateObj = new Date();
        let finalDeadline = deadline;
        if (!finalDeadline) {
          finalDeadline = addBusinessDays(entryDateObj, 5).toISOString();
        }

        const insertPayload = {
          title,
          description,
          attachments: attachments || [],
          status: initialStatus,
          deadline: finalDeadline,
          project_code: project_code || null,
          entry_date: entryDateObj.toISOString(),
        };

        result = await supabase.from('proposals').insert(insertPayload).select().single();
      }

    } else if (type === 'request') {
      // REQUEST LOGIC
      const { requester_name, description, priority } = data
      
      if (!requester_name || !description) {
        throw new Error('Requester name and description are required for requests')
      }

      result = await supabase.from('requests').insert({
        requester_name,
        description,
        priority: priority || 'medium',
        status: 'pending'
      }).select().single()

    } else {
      throw new Error('Invalid type. Supported types are: "proposal", "request"')
    }

    if (result.error) {
      throw result.error
    }

    // Retorna sucesso. O data conterá o ID, permitindo que quem chamou guarde esse ID.
    return new Response(JSON.stringify({ 
      success: true, 
      message: `${type} processed successfully`, 
      data: result.data 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
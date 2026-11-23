// src/lib/whatsapp/janela.ts
// Janela de atendimento do WhatsApp: depois que a pessoa escreve, a loja pode
// responder com texto livre por 24h. Fora disso só passa modelo aprovado.
import { SupabaseClient } from '@supabase/supabase-js'
import { variantesDeTelefone } from './send'

// Uma hora de folga: mensagem enviada no fim da janela pode ser recusada
const JANELA_MS = 23 * 3_600_000

/** A pessoa deste telefone escreveu para a loja há menos de 24h? */
export async function janelaAberta(supabase: SupabaseClient, filialId: string, telefone: string): Promise<boolean> {
  const { data: conversas } = await supabase
    .from('wa_conversas')
    .select('id')
    .in('telefone', variantesDeTelefone(telefone))
    .eq('filial_id', filialId)
  const ids = (conversas ?? []).map(c => c.id as string)
  if (ids.length === 0) return false
  const { data } = await supabase
    .from('wa_mensagens')
    .select('criado_em')
    .in('conversa_id', ids)
    .eq('direcao', 'entrada')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  return !!data && Date.now() - new Date(data.criado_em as string).getTime() < JANELA_MS
}

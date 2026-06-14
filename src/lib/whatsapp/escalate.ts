// src/lib/whatsapp/escalate.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { sendMessage, WaConfig } from './send'

export async function escalateToHuman(
  conversaId: string,
  config: WaConfig & { filial_id: string },
  supabase: SupabaseClient
): Promise<void> {
  await supabase.from('wa_conversas').update({ status: 'humano' }).eq('id', conversaId)

  const { data: conversa } = await supabase
    .from('wa_conversas')
    .select('telefone')
    .eq('id', conversaId)
    .single()

  if (!conversa) return

  const msg = 'Vou te conectar com um de nossos atendentes. Aguarde um momento! 🙋'
  await sendMessage(config, conversa.telefone, msg)

  await supabase.from('wa_mensagens').insert({
    conversa_id: conversaId,
    direcao: 'saida',
    conteudo: msg,
  })

  try {
    await supabase.from('wa_logs').insert({
      filial_id: config.filial_id,
      tipo: 'escalada_humano',
      telefone: conversa.telefone,
      mensagem: 'Cliente solicitou atendimento humano',
      status: 'enviado',
    })
  } catch {
    // wa_logs não-crítico
  }
}

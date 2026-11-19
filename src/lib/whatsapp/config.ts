// src/lib/whatsapp/config.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { COLUNAS_ENVIO, configDeEnvio, WaConfig } from './send'

/** Credenciais de envio da filial, no provedor que ela escolheu; null se não estiverem preenchidas. */
export async function buscarConfigEnvio(supabase: SupabaseClient, filialId: string): Promise<WaConfig | null> {
  const completa = await supabase.from('wa_config').select(COLUNAS_ENVIO).eq('filial_id', filialId).maybeSingle()
  if (!completa.error) return configDeEnvio(completa.data)

  // Banco ainda sem as colunas da YCloud (migração não rodada): segue só com a Meta
  const { data } = await supabase
    .from('wa_config')
    .select('phone_number_id, access_token')
    .eq('filial_id', filialId)
    .maybeSingle()
  return configDeEnvio(data)
}

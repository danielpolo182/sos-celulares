// src/lib/whatsapp/lojaConfig.ts
// Leitura dos dados da loja (sistema_config) para o agente e para os avisos.
import { SupabaseClient } from '@supabase/supabase-js'

type Linha = { chave: string; valor: string | null; filial_id?: string | null; created_at?: string | null }

/**
 * O banco pode ter mais de uma linha para a mesma chave (sementes aplicadas duas
 * vezes, uma com o valor de fábrica). Sem critério, cada consulta devolvia uma
 * delas e o agente informava um horário diferente do que a tela mostra. Vale a
 * linha da própria filial e, entre repetidas, a mais antiga: é a mesma ordem
 * que a tela de Configurações usa.
 */
export async function lerConfigDaLoja(
  supabase: SupabaseClient,
  chaves: string[],
  filialId?: string | null
): Promise<Record<string, string>> {
  let linhas: Linha[] = []
  const completa = await supabase
    .from('sistema_config')
    .select('chave, valor, filial_id, created_at')
    .in('chave', chaves)
    .order('created_at', { ascending: true })
  if (!completa.error) linhas = (completa.data ?? []) as Linha[]
  else {
    // Banco sem filial_id ou created_at nesta tabela: lê só o essencial
    const simples = await supabase.from('sistema_config').select('chave, valor').in('chave', chaves)
    linhas = (simples.data ?? []) as Linha[]
  }

  const daFilial = (l: Linha) => !!filialId && l.filial_id === filialId
  const visiveis = linhas.filter(l => !filialId || !l.filial_id || l.filial_id === filialId)
  // A ordenação é estável: dentro de cada grupo continua valendo a mais antiga
  visiveis.sort((a, b) => Number(daFilial(b)) - Number(daFilial(a)))

  const cfg: Record<string, string> = {}
  for (const l of visiveis) if (l.valor && cfg[l.chave] === undefined) cfg[l.chave] = l.valor
  return cfg
}

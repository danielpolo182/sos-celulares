// src/lib/whatsapp/notify.ts
import { createClient } from '@supabase/supabase-js'
import { sendTemplate } from './send'

type TemplateConfig = {
  name: string
  params: (os: {
    clientes: { nome: string | null } | null
    numero: number
    valor_final: number | null
    valor_orcamento: number | null
  }) => string[]
}

const STATUS_TEMPLATE: Record<string, TemplateConfig> = {
  aberta: {
    name: 'os_aberta',
    params: o => [o.clientes?.nome ?? 'Cliente', String(o.numero)],
  },
  em_andamento: {
    name: 'os_em_andamento',
    params: o => [o.clientes?.nome ?? 'Cliente', String(o.numero)],
  },
  pronta: {
    name: 'os_pronta',
    params: o => [
      o.clientes?.nome ?? 'Cliente',
      String(o.numero),
      `R$ ${(o.valor_final ?? o.valor_orcamento ?? 0).toFixed(2)}`,
    ],
  },
  entregue: {
    name: 'os_entregue',
    params: o => [o.clientes?.nome ?? 'Cliente', String(o.numero)],
  },
  cancelada: {
    name: 'os_cancelada',
    params: o => [o.clientes?.nome ?? 'Cliente', String(o.numero)],
  },
}

export async function notifyStatusChange(osId: string, newStatus: string): Promise<void> {
  const template = STATUS_TEMPLATE[newStatus]
  if (!template) return

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: os } = await supabase
    .from('ordens_servico')
    .select('id, numero, status, valor_final, valor_orcamento, wa_enviado, filial_id, clientes(nome, telefone)')
    .eq('id', osId)
    .single()

  if (!os) return
  // Supabase returns relations as array; take first element
  const cliente = Array.isArray(os.clientes) ? os.clientes[0] : os.clientes
  if (!cliente?.telefone) return
  if ((os.wa_enviado as Record<string, boolean> | null)?.[newStatus]) return

  const { data: config } = await supabase
    .from('wa_config')
    .select('phone_number_id, access_token')
    .eq('filial_id', os.filial_id)
    .single()

  if (!config?.phone_number_id || !config?.access_token) return

  const raw = (cliente.telefone as string).replace(/\D/g, '')
  const to = raw.startsWith('55') ? raw : `55${raw}`

  await sendTemplate(
    { phone_number_id: config.phone_number_id, access_token: config.access_token },
    to,
    template.name,
    template.params({ clientes: { nome: cliente.nome as string | null }, numero: os.numero, valor_final: os.valor_final, valor_orcamento: os.valor_orcamento })
  )

  const novoWaEnviado = {
    ...((os.wa_enviado as Record<string, boolean>) ?? {}),
    [newStatus]: true,
  }
  await supabase
    .from('ordens_servico')
    .update({ wa_enviado: novoWaEnviado })
    .eq('id', os.id)

  try {
    await supabase.from('wa_logs').insert({
      filial_id: os.filial_id,
      tipo: 'notificacao_status',
      telefone: to,
      mensagem: template.name,
      status: 'enviado',
    })
  } catch {
    // wa_logs não-crítico
  }
}

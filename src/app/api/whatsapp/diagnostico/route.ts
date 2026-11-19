// src/app/api/whatsapp/diagnostico/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { META_API } from '@/lib/whatsapp/send'

export const dynamic = 'force-dynamic'

type ErroMeta = { error?: { message?: string; code?: number } }

async function chamarMeta<T>(url: string, token: string, method: 'GET' | 'POST' = 'GET') {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } })
  const json = (await res.json().catch(() => ({}))) as T & ErroMeta
  return { ok: res.ok, json }
}

/**
 * POST /api/whatsapp/diagnostico  { wabaId?: string, assinar?: boolean }
 * Confere, com o token guardado da filial, se o número responde e se o app
 * está assinado na conta do WhatsApp (WABA). Sem essa assinatura a Meta
 * verifica o webhook normalmente, mas não entrega as mensagens recebidas.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { wabaId, assinar } = (await request.json().catch(() => ({}))) as { wabaId?: string; assinar?: boolean }

  // O RLS devolve só a configuração da filial do usuário
  const { data: config } = await supabase
    .from('wa_config')
    .select('phone_number_id, access_token')
    .maybeSingle()

  if (!config?.phone_number_id || !config?.access_token) {
    return NextResponse.json({ error: 'Salve o Phone Number ID e o Access Token antes de testar.' }, { status: 400 })
  }

  // 1. O token e o Phone Number ID funcionam?
  const numero = await chamarMeta<{ display_phone_number?: string; verified_name?: string; status?: string }>(
    `${META_API}/${config.phone_number_id}?fields=display_phone_number,verified_name,status`,
    config.access_token
  )
  if (!numero.ok) {
    return NextResponse.json({
      etapa: 'numero',
      error: numero.json.error?.message ?? 'A Meta recusou o token ou o Phone Number ID.',
    }, { status: 502 })
  }

  const resposta: {
    numero: { telefone: string | null; nome: string | null; status: string | null }
    assinatura?: { apps: string[]; assinouAgora: boolean; appAtual: string | null; appAtualAssinado: boolean | null }
  } = {
    numero: {
      telefone: numero.json.display_phone_number ?? null,
      nome: numero.json.verified_name ?? null,
      status: numero.json.status ?? null,
    },
  }

  if (!wabaId) return NextResponse.json(resposta)
  if (!/^\d+$/.test(wabaId)) {
    return NextResponse.json({ ...resposta, etapa: 'conta', error: 'O ID da conta do WhatsApp tem só números.' }, { status: 400 })
  }

  // 2. Opcionalmente assina o app na conta, depois lista quem está assinado
  if (assinar) {
    const assinou = await chamarMeta<{ success?: boolean }>(`${META_API}/${wabaId}/subscribed_apps`, config.access_token, 'POST')
    if (!assinou.ok) {
      return NextResponse.json({
        ...resposta, etapa: 'conta',
        error: assinou.json.error?.message ?? 'A Meta recusou a assinatura do app nesta conta.',
      }, { status: 502 })
    }
  }

  const lista = await chamarMeta<{ data?: { whatsapp_business_api_data?: { name?: string; id?: string } }[] }>(
    `${META_API}/${wabaId}/subscribed_apps`,
    config.access_token
  )
  if (!lista.ok) {
    return NextResponse.json({
      ...resposta, etapa: 'conta',
      error: lista.json.error?.message ?? 'Não foi possível consultar a conta do WhatsApp.',
    }, { status: 502 })
  }

  // A conta de teste já vem com um app interno da Meta assinado, então "lista não vazia"
  // não basta: o que importa é o app dono deste token estar nela.
  const appDoToken = await chamarMeta<{ id?: string; name?: string }>(`${META_API}/app?fields=id,name`, config.access_token)
  const assinados = lista.json.data ?? []

  resposta.assinatura = {
    apps: assinados.map(a => a.whatsapp_business_api_data?.name ?? a.whatsapp_business_api_data?.id ?? 'app sem nome'),
    assinouAgora: !!assinar,
    appAtual: appDoToken.ok ? (appDoToken.json.name ?? null) : null,
    appAtualAssinado: appDoToken.ok && !!appDoToken.json.id
      ? assinados.some(a => a.whatsapp_business_api_data?.id === appDoToken.json.id)
      : null,
  }
  return NextResponse.json(resposta)
}

// src/app/api/whatsapp/conversas/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendMessage } from '@/lib/whatsapp/send'

export const dynamic = 'force-dynamic'

async function makeSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values: { name: string; value: string; options: Record<string, unknown> }[]) =>
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )
}

// GET /api/whatsapp/conversas — lista conversas com última mensagem
export async function GET() {
  const supabase = await makeSupabase()

  const { data: conversas, error } = await supabase
    .from('wa_conversas')
    .select(`
      id, telefone, status, atualizado_em,
      wa_mensagens(conteudo, direcao, criado_em)
    `)
    .order('atualizado_em', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrega última mensagem por conversa
  const data = (conversas ?? []).map(c => {
    const msgs = Array.isArray(c.wa_mensagens) ? c.wa_mensagens : []
    const sorted = [...msgs].sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
    return {
      id: c.id,
      telefone: c.telefone,
      status: c.status,
      atualizado_em: c.atualizado_em,
      ultima_mensagem: sorted[0]?.conteudo ?? '',
      ultima_direcao: sorted[0]?.direcao ?? 'entrada',
    }
  })

  return NextResponse.json(data)
}

// POST /api/whatsapp/conversas — enviar mensagem ou resolver conversa
export async function POST(request: NextRequest) {
  const supabase = await makeSupabase()
  const body = await request.json() as { conversaId: string; acao: 'enviar' | 'resolver'; texto?: string }

  const { conversaId, acao, texto } = body

  if (!conversaId || !acao) {
    return NextResponse.json({ error: 'conversaId e acao são obrigatórios' }, { status: 400 })
  }

  const { data: conversa } = await supabase
    .from('wa_conversas')
    .select('telefone, filial_id')
    .eq('id', conversaId)
    .single()

  if (!conversa) return NextResponse.json({ error: 'conversa não encontrada' }, { status: 404 })

  if (acao === 'resolver') {
    await supabase.from('wa_conversas').update({ status: 'resolvida' }).eq('id', conversaId)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'enviar') {
    if (!texto?.trim()) return NextResponse.json({ error: 'texto é obrigatório' }, { status: 400 })

    const { data: config } = await supabase
      .from('wa_config')
      .select('phone_number_id, access_token')
      .eq('filial_id', conversa.filial_id)
      .single()

    if (!config?.phone_number_id || !config?.access_token) {
      return NextResponse.json({ error: 'wa_config não configurada' }, { status: 500 })
    }

    await sendMessage({ phone_number_id: config.phone_number_id, access_token: config.access_token }, conversa.telefone, texto)
    await supabase.from('wa_mensagens').insert({ conversa_id: conversaId, direcao: 'saida', conteudo: texto })
    await supabase.from('wa_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', conversaId)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acao inválida' }, { status: 400 })
}

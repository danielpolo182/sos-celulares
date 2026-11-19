// src/app/api/whatsapp/conversas/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMessage } from '@/lib/whatsapp/send'
import { buscarConfigEnvio } from '@/lib/whatsapp/config'
import { liberarBot, pausarBot } from '@/lib/whatsapp/botRegras'

export const dynamic = 'force-dynamic'

// GET /api/whatsapp/conversas — lista conversas com última mensagem
export async function GET() {
  const supabase = await createClient()

  const { data: conversas, error } = await supabase
    .from('wa_conversas')
    .select(`
      id, telefone, nome_contato, status, atualizado_em,
      wa_mensagens(conteudo, direcao, criado_em)
    `)
    .order('atualizado_em', { ascending: false })
    .order('criado_em', { referencedTable: 'wa_mensagens', ascending: false })
    .limit(1, { referencedTable: 'wa_mensagens' })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const data = (conversas ?? []).map(c => {
    const ultima = Array.isArray(c.wa_mensagens) ? c.wa_mensagens[0] : undefined
    return {
      id: c.id,
      telefone: c.telefone,
      nome_contato: c.nome_contato,
      status: c.status,
      atualizado_em: c.atualizado_em,
      ultima_mensagem: ultima?.conteudo ?? '',
      ultima_direcao: ultima?.direcao ?? 'entrada',
    }
  })

  return NextResponse.json(data)
}

// POST /api/whatsapp/conversas — enviar mensagem ou resolver conversa
export async function POST(request: NextRequest) {
  const supabase = await createClient()
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
    await liberarBot(supabase, conversaId)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'enviar') {
    if (!texto?.trim()) return NextResponse.json({ error: 'texto é obrigatório' }, { status: 400 })

    const envio = await buscarConfigEnvio(supabase, conversa.filial_id)
    if (!envio) {
      return NextResponse.json({ error: 'WhatsApp não configurado em Configurações → WhatsApp' }, { status: 500 })
    }

    let waMessageId: string | null = null
    try {
      waMessageId = await sendMessage(envio, conversa.telefone, texto)
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : String(err)
      // 131047: a Meta só aceita texto livre até 24h após a última mensagem do cliente
      const foraDaJanela = detalhe.includes('131047')
      return NextResponse.json({
        error: foraDaJanela
          ? 'Fora da janela de 24h: o cliente precisa mandar uma mensagem antes, ou use um modelo aprovado.'
          : `O envio foi recusado: ${detalhe}`,
      }, { status: 502 })
    }

    await supabase.from('wa_mensagens').insert({ conversa_id: conversaId, direcao: 'saida', conteudo: texto, wa_message_id: waMessageId })
    // Quem responde pela caixa de entrada assume a conversa: o bot para de responder
    await supabase.from('wa_conversas').update({ atualizado_em: new Date().toISOString(), status: 'humano' }).eq('id', conversaId)
    await pausarBot(supabase, conversa.filial_id, conversaId)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acao inválida' }, { status: 400 })
}

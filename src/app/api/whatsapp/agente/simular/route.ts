// src/app/api/whatsapp/agente/simular/route.ts
// Conversa de teste com o agente, para o dono da loja: mesmas instruções, mesmo
// modelo e mesmas ferramentas do atendimento real, mas nada é enviado pelo
// WhatsApp nem gravado na caixa de entrada. Exige login, como as outras telas.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processBot, Simulacao } from '@/lib/whatsapp/bot'
import { buscarConfigEnvio } from '@/lib/whatsapp/config'
import { WaConfig } from '@/lib/whatsapp/send'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_MENSAGENS = 30
const TELEFONE_DE_TESTE = '5500000000000'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const corpo = await req.json().catch(() => null) as { mensagens?: { de?: string; texto?: string }[] } | null
  const mensagens = (corpo?.mensagens ?? [])
    .map(m => ({ de: m.de === 'agente' ? ('agente' as const) : ('cliente' as const), texto: String(m.texto ?? '').trim().slice(0, 2000) }))
    .filter(m => m.texto)
    .slice(-MAX_MENSAGENS)
  if (mensagens.length === 0 || mensagens[mensagens.length - 1].de !== 'cliente') {
    return NextResponse.json({ error: 'Envie a conversa terminando em uma mensagem do cliente.' }, { status: 400 })
  }

  // A sessão só enxerga a configuração da própria loja
  const { data: wa } = await supabase.from('wa_config').select('filial_id').maybeSingle()
  const filialId = String(wa?.filial_id ?? '')
  if (!filialId) return NextResponse.json({ error: 'Loja sem WhatsApp configurado.' }, { status: 400 })

  const simulacao: Simulacao = { mensagens, perguntas: [], passos: [] }
  const inicio = Date.now()
  const segundos = () => Math.round((Date.now() - inicio) / 100) / 10
  try {
    const envio = (await buscarConfigEnvio(supabase, filialId)) ?? ({} as WaConfig)
    const r = await processBot(mensagens[mensagens.length - 1].texto, TELEFONE_DE_TESTE, 'simulacao', supabase, filialId, envio, simulacao)
    return NextResponse.json({
      resposta: r.resposta, escalou: r.escalou, ferramentas: r.ferramentas,
      perguntasAoResponsavel: simulacao.perguntas, passos: simulacao.passos, segundos: segundos(),
    })
  } catch (e) {
    console.error('[simulador do agente]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 300) : 'falha', segundos: segundos() }, { status: 502 })
  }
}

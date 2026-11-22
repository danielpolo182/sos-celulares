// src/app/api/whatsapp/agente/teste/route.ts
// Diagnóstico do agente de IA: faz uma chamada mínima e devolve o resultado em
// linguagem de dono de loja, junto com as últimas falhas registradas.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dadosDaLoja, testarAgente } from '@/lib/whatsapp/bot'
import { contextoDeDataParaOAgente } from '@/lib/feriados'
import { lerConfigBot } from '@/lib/whatsapp/botRegras'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // A sessão só enxerga a linha da própria loja; sem a coluna, vale o modelo padrão
  const { data: wa } = await supabase.from('wa_config').select('bot_config').maybeSingle()
  const teste = await testarAgente(lerConfigBot(wa?.bot_config).modelo)

  const { data: falhas } = await supabase
    .from('wa_logs')
    .select('telefone, mensagem, criado_em, status')
    .in('tipo', ['erro_agente', 'agente'])
    .order('criado_em', { ascending: false })
    .limit(12)

  // O mesmo texto que entra nas instruções do agente
  const loja = `${await dadosDaLoja(supabase)}\n${contextoDeDataParaOAgente()}`

  return NextResponse.json({ ...teste, falhas: falhas ?? [], loja })
}

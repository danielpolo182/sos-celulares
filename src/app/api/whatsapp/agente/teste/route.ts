// src/app/api/whatsapp/agente/teste/route.ts
// Diagnóstico do agente de IA: faz uma chamada mínima e devolve o resultado em
// linguagem de dono de loja, junto com as últimas falhas registradas.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { testarAgente } from '@/lib/whatsapp/bot'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const teste = await testarAgente()

  const { data: falhas } = await supabase
    .from('wa_logs')
    .select('telefone, mensagem, criado_em, status')
    .in('tipo', ['erro_agente', 'agente'])
    .order('criado_em', { ascending: false })
    .limit(12)

  return NextResponse.json({ ...teste, falhas: falhas ?? [] })
}

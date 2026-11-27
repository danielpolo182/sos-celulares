// src/app/api/marketing/fila/relogio/route.ts
// Relógio da fila de aprovação: publica no Instagram o que foi aprovado e já está na hora.
// Chamado a cada 5 minutos pelo pg_cron do Supabase, sem sessão; exige o CRON_SECRET.
// Chamar à toa não faz nada, e duas chamadas ao mesmo tempo não publicam em dobro (ver publicar.ts).
import { NextRequest, NextResponse } from 'next/server'
import { clienteDeServico } from '@/lib/whatsapp/notify'
import { tocarRelogio } from '@/lib/marketing/publicar'
import { depsReais } from '@/lib/marketing/publicar-deps'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Para de começar itens novos aqui, para a rota terminar dentro do limite de 60 s
const TEMPO_MAXIMO_MS = 45_000

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Sem token não toca em nenhum item: eles continuam aprovados e saem quando o token for cadastrado
  const token = process.env.INSTAGRAM_TOKEN
  if (!token) return NextResponse.json({ ok: false, erro: 'INSTAGRAM_TOKEN não configurado' })

  try {
    const resumo = await tocarRelogio(depsReais(clienteDeServico(), token), TEMPO_MAXIMO_MS)
    console.log('[fila] relógio', JSON.stringify(resumo))
    return NextResponse.json({ ok: true, ...resumo })
  } catch (e) {
    console.error('[fila] relógio falhou:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, erro: 'Não consegui consultar a fila.' }, { status: 500 })
  }
}

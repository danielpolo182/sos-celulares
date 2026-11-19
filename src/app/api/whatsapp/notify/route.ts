// src/app/api/whatsapp/notify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notificarEventoOS, notifyStatusChange } from '@/lib/whatsapp/notify'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { osId, newStatus, evento } = await request.json() as { osId?: string; newStatus?: string; evento?: string }
  if (!osId || (!newStatus && evento !== 'entrada')) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  // O envio usa a chave de serviço; antes, confere pela sessão que a OS é da filial de quem pediu
  const { data: os } = await supabase.from('ordens_servico').select('id').eq('id', osId).maybeSingle()
  if (!os) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Aguarda de propósito: depois da resposta a função pode ser congelada e o aviso não sair.
  // Falha no aviso não pode virar erro para a tela da OS.
  try {
    if (evento === 'entrada') await notificarEventoOS(osId, 'entrada')
    else if (newStatus) await notifyStatusChange(osId, newStatus)
  } catch (err) {
    console.error('[notify route]', err)
  }

  return NextResponse.json({ ok: true })
}

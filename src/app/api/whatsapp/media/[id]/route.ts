// src/app/api/whatsapp/media/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { WA_MEDIA_BUCKET } from '@/lib/whatsapp/media'

export const dynamic = 'force-dynamic'

// GET /api/whatsapp/media/:id — redireciona para uma URL assinada do arquivo da mensagem
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Consulta com a sessão do usuário: o RLS só devolve mensagens da filial dele
  const { data: msg } = await supabase
    .from('wa_mensagens')
    .select('media_path')
    .eq('id', id)
    .maybeSingle()

  if (!msg?.media_path) return NextResponse.json({ error: 'mídia não encontrada' }, { status: 404 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: assinada, error } = await admin.storage
    .from(WA_MEDIA_BUCKET)
    .createSignedUrl(msg.media_path, 3600)

  if (error || !assinada?.signedUrl) {
    console.error('[WA media] link assinado', error?.message)
    return NextResponse.json({ error: 'falha ao gerar link' }, { status: 500 })
  }
  return NextResponse.redirect(assinada.signedUrl)
}

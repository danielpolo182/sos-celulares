// src/app/api/whatsapp/materiais/route.ts
// Cadastro dos materiais que o agente pode enviar. O arquivo sobe direto do
// navegador para o armazenamento (um vídeo não cabe no corpo de uma função);
// esta rota só autoriza o envio e registra o material.
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { WA_MEDIA_BUCKET } from '@/lib/whatsapp/media'
import { LIMITE_MB, TIPO_POR_MIME, extensaoDoMime } from '@/lib/whatsapp/materiais'

export const dynamic = 'force-dynamic'

const admin = () => createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function filialDoUsuario() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, filialId: null }
  const { data: perfil } = await supabase.from('perfis').select('filial_id').eq('id', user.id).single()
  return { supabase, filialId: (perfil?.filial_id as string | undefined) ?? null }
}

type Pedido =
  | { acao: 'preparar'; mime: string; tamanho: number }
  | { acao: 'registrar'; path: string; mime: string; titulo: string; quando_enviar: string; legenda?: string }

export async function POST(request: NextRequest) {
  const { supabase, filialId } = await filialDoUsuario()
  if (!filialId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const pedido = await request.json() as Pedido
  const tipo = TIPO_POR_MIME[pedido.mime]
  if (!tipo) return NextResponse.json({ error: 'Formato não aceito. Use vídeo MP4, imagem JPG ou PNG, ou PDF.' }, { status: 400 })
  const pasta = `${filialId}/materiais/`

  if (pedido.acao === 'preparar') {
    if (!(pedido.tamanho > 0) || pedido.tamanho > LIMITE_MB[tipo] * 1024 * 1024) {
      return NextResponse.json({ error: `O WhatsApp aceita ${tipo} de até ${LIMITE_MB[tipo]} MB.` }, { status: 400 })
    }
    const path = `${pasta}${randomUUID()}.${extensaoDoMime(pedido.mime)}`
    const { data, error } = await admin().storage.from(WA_MEDIA_BUCKET).createSignedUploadUrl(path)
    if (error || !data?.token) return NextResponse.json({ error: `Não consegui preparar o envio: ${error?.message ?? 'sem resposta'}` }, { status: 500 })
    return NextResponse.json({ path, token: data.token })
  }

  if (pedido.acao === 'registrar') {
    // O caminho vem do navegador: só vale dentro da pasta de materiais da própria filial
    if (!pedido.path?.startsWith(pasta) || pedido.path.includes('..')) return NextResponse.json({ error: 'arquivo inválido' }, { status: 400 })
    if (!pedido.titulo?.trim() || !pedido.quando_enviar?.trim()) {
      return NextResponse.json({ error: 'Informe o título e quando o agente deve enviar.' }, { status: 400 })
    }
    const { error } = await supabase.from('wa_materiais').insert({
      filial_id: filialId,
      titulo: pedido.titulo.trim(),
      quando_enviar: pedido.quando_enviar.trim(),
      legenda: pedido.legenda?.trim() || null,
      tipo,
      media_path: pedido.path,
      media_mime: pedido.mime,
    })
    if (error) return NextResponse.json({ error: `Não consegui registrar o material: ${error.message}` }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acao inválida' }, { status: 400 })
}

export async function DELETE(request: NextRequest) {
  const { supabase, filialId } = await filialDoUsuario()
  if (!filialId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  // Consulta com a sessão do usuário: o RLS só devolve material da filial dele
  const { data: material } = await supabase.from('wa_materiais').select('media_path').eq('id', id).maybeSingle()
  if (!material) return NextResponse.json({ error: 'material não encontrado' }, { status: 404 })

  const { error } = await supabase.from('wa_materiais').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // O arquivo fica: mensagens já enviadas apontam para ele e o Inbox ainda precisa mostrá-lo
  return NextResponse.json({ ok: true })
}

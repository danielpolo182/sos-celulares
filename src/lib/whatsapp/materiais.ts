// src/lib/whatsapp/materiais.ts
// Biblioteca de materiais do agente: vídeos, imagens e documentos que a loja
// subiu e que ele envia quando a conversa pede (ex.: diferença entre as telas).
import { SupabaseClient } from '@supabase/supabase-js'
import { sendMedia, TipoMidia, WaConfig } from './send'
import { WA_MEDIA_BUCKET } from './media'

export type TipoMaterial = 'video' | 'imagem' | 'documento'

export type Material = {
  id: string
  titulo: string
  quando_enviar: string
  tipo: TipoMaterial
  media_path: string
  media_mime: string
  legenda: string | null
}

// Limites do WhatsApp por tipo de arquivo
export const LIMITE_MB: Record<TipoMaterial, number> = { video: 16, imagem: 5, documento: 100 }

export const TIPO_POR_MIME: Record<string, TipoMaterial> = {
  'video/mp4': 'video',
  'image/jpeg': 'imagem',
  'image/png': 'imagem',
  'application/pdf': 'documento',
}

const EXTENSAO: Record<string, string> = { 'video/mp4': 'mp4', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' }
export const extensaoDoMime = (mime: string) => EXTENSAO[mime] ?? 'bin'

const TIPO_NO_WHATSAPP: Record<TipoMaterial, TipoMidia> = { video: 'video', imagem: 'image', documento: 'document' }
// O provedor baixa o arquivo logo após o pedido de envio
const VALIDADE_DO_LINK_S = 900
const DIA_MS = 86_400_000

/** Materiais ativos da filial; lista vazia se a tabela ainda não existe. */
export async function listarMateriais(supabase: SupabaseClient, filialId: string): Promise<Material[]> {
  const { data, error } = await supabase
    .from('wa_materiais')
    .select('id, titulo, quando_enviar, tipo, media_path, media_mime, legenda')
    .eq('filial_id', filialId)
    .eq('ativo', true)
    .order('criado_em', { ascending: true })
  return error ? [] : ((data ?? []) as Material[])
}

/** Ferramenta do agente: envia um material ao cliente da conversa. Devolve o texto que orienta o agente. */
export async function enviarMaterial(args: {
  supabase: SupabaseClient
  filialId: string
  conversaId: string
  envio: WaConfig
  materialId: string
}): Promise<string> {
  const { supabase, filialId, conversaId, envio } = args

  const material = (await listarMateriais(supabase, filialId)).find(m => m.id === args.materialId)
  if (!material) return 'Material não encontrado. Responda por texto.'

  // O mesmo arquivo duas vezes na mesma conversa parece defeito do atendimento
  const { data: jaEnviado } = await supabase
    .from('wa_mensagens')
    .select('id')
    .eq('conversa_id', conversaId)
    .eq('media_path', material.media_path)
    .gte('criado_em', new Date(Date.now() - DIA_MS).toISOString())
    .limit(1)
  if (jaEnviado?.length) return `O material "${material.titulo}" já foi enviado a este cliente hoje. Não envie de novo; responda por texto.`

  const { data: conversa } = await supabase.from('wa_conversas').select('telefone').eq('id', conversaId).maybeSingle()
  if (!conversa?.telefone) return 'Não foi possível enviar o material agora. Responda por texto.'

  const { data: assinada, error } = await supabase.storage.from(WA_MEDIA_BUCKET).createSignedUrl(material.media_path, VALIDADE_DO_LINK_S)
  if (error || !assinada?.signedUrl) {
    console.error('[WA material] link assinado', error?.message)
    return 'Não foi possível enviar o material agora. Responda por texto.'
  }

  try {
    const id = await sendMedia(envio, conversa.telefone as string, TIPO_NO_WHATSAPP[material.tipo], assinada.signedUrl, material.legenda, material.titulo)
    await supabase.from('wa_mensagens').insert({
      conversa_id: conversaId,
      direcao: 'saida',
      conteudo: material.legenda?.trim() || material.titulo,
      tipo: material.tipo,
      media_path: material.media_path,
      media_mime: material.media_mime,
      media_nome: material.titulo,
      wa_message_id: id,
    })
  } catch (e) {
    console.error('[WA material] envio', e instanceof Error ? e.message : e)
    return 'Não foi possível enviar o material agora. Responda por texto.'
  }

  return `Material "${material.titulo}" enviado ao cliente. Escreva uma frase curta avisando que mandou e se colocando à disposição; não repita o conteúdo do material.`
}

// Dependências de verdade da máquina de publicação (publicar.ts): Supabase e API da Meta.
// O cliente do Supabase aqui é o de serviço: o relógio roda sem sessão de usuário.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  contaInstagram, criarConteinerStory, estadoDoConteiner, publicarConteiner, linkDaMidia, mensagemParaTela,
} from './instagram'
import { ArquivoAusente, type DepsDoRelogio, type ItemFila } from './publicar'

export const BALDE = 'marketing-fila'
const COLUNAS = 'id, filial_id, situacao, video_path, quadro_path, ig_container_id, tentativas, agendado_para, atualizado_em'

export function depsReais(supabase: SupabaseClient, token: string): DepsDoRelogio {
  const agora = () => new Date()
  const falhou = (onde: string, mensagem: string): never => { throw new Error(`${onde}: ${mensagem}`) }

  return {
    async reservar(id) {
      const { data, error } = await supabase.from('marketing_fila')
        .update({ situacao: 'publicando', atualizado_em: agora().toISOString() })
        .eq('id', id).eq('situacao', 'aprovado').select(COLUNAS)
      if (error) falhou('reservar', error.message)
      return ((data ?? [])[0] as ItemFila | undefined) ?? null
    },
    async carregar(id) {
      const { data, error } = await supabase.from('marketing_fila').select(COLUNAS).eq('id', id).maybeSingle()
      if (error) falhou('carregar', error.message)
      return (data as ItemFila | null) ?? null
    },
    async salvar(id, campos) {
      const { error } = await supabase.from('marketing_fila').update({ ...campos, atualizado_em: agora().toISOString() }).eq('id', id)
      if (error) falhou('salvar', error.message)
    },
    async igUserId(filialId) {
      const { data, error } = await supabase.from('marketing_config').select('ig_user_id').eq('filial_id', filialId).maybeSingle()
      if (error) falhou('configuração', error.message)
      if (data?.ig_user_id) return data.ig_user_id as string
      const conta = await contaInstagram(token)
      await supabase.from('marketing_config').update({ ig_user_id: conta.id, atualizado_em: agora().toISOString() }).eq('filial_id', filialId)
      return conta.id
    },
    async assinar(path, segundos) {
      const { data, error } = await supabase.storage.from(BALDE).createSignedUrl(path, segundos)
      if (error || !data?.signedUrl) {
        if (!error || /not.?found|does not exist/i.test(error.message)) throw new ArquivoAusente()
        falhou('armazenamento', error.message)
      }
      return data!.signedUrl
    },
    async apagarArquivos(item) {
      const caminhos = [item.video_path, item.quadro_path].filter((c): c is string => !!c)
      if (!caminhos.length) return
      const { error } = await supabase.storage.from(BALDE).remove(caminhos)
      if (error) falhou('apagar arquivos', error.message)
    },
    meta: {
      criarConteinerStory: (igId, videoUrl) => criarConteinerStory(igId, videoUrl, token),
      estadoDoConteiner: (id) => estadoDoConteiner(id, token),
      publicarConteiner: (igId, id) => publicarConteiner(igId, id, token),
      linkDaMidia: (id) => linkDaMidia(id, token),
    },
    mensagemDeErro: mensagemParaTela,
    agora,
    esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)),
    async emAndamento() {
      const { data, error } = await supabase.from('marketing_fila').select(COLUNAS).eq('situacao', 'publicando')
      if (error) falhou('em andamento', error.message)
      return (data ?? []) as ItemFila[]
    },
    async vencidos(max) {
      const { data, error } = await supabase.from('marketing_fila').select('id')
        .eq('situacao', 'aprovado').lte('agendado_para', agora().toISOString())
        .order('agendado_para', { ascending: true }).limit(max)
      if (error) falhou('vencidos', error.message)
      return (data ?? []).map((l) => l.id as string)
    },
  }
}

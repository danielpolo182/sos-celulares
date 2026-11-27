// Máquina de publicação da fila de aprovação: leva um item de "aprovado" a "publicado".
// Módulo puro: tudo o que toca banco, armazenamento e Meta entra por `Deps`. As dependências de verdade
// ficam em publicar-deps.ts; o roteiro conferir-publicar.mjs usa dependências de mentira.
//
// O que este módulo garante:
//   - um item só é publicado por quem conseguiu reservá-lo (aprovado -> publicando, atômico);
//   - depois que a Meta publicou, o item nunca volta para a fila, nem que o banco falhe;
//   - erro vira nova tentativa até TENTATIVAS_MAX e depois "falhou", com o motivo.
import type { EstadoConteiner } from './instagram'

export const ESPERA_MAX_MS = 40_000      // quanto uma chamada espera a Meta processar o vídeo
export const INTERVALO_MS = 5_000        // intervalo entre consultas do estado
export const TENTATIVAS_MAX = 3
export const TRAVA_MIN = 30              // "publicando" há mais que isso vira "falhou"
export const RETOMAR_APOS_S = 90         // o relógio não mexe em item reservado há menos que isso (pode estar em voo)
export const ASSINATURA_META_S = 7200    // validade do endereço que a Meta usa para baixar o vídeo
export const NOVOS_POR_TOQUE = 3

export type ItemFila = {
  id: string; filial_id: string; situacao: string
  video_path: string | null; quadro_path: string | null
  ig_container_id: string | null; tentativas: number
  agendado_para: string | null; atualizado_em: string
}

export type Deps = {
  /** aprovado -> publicando, atômico. null quando outro processo já pegou o item. */
  reservar(id: string): Promise<ItemFila | null>
  carregar(id: string): Promise<ItemFila | null>
  salvar(id: string, campos: Record<string, unknown>): Promise<void>
  igUserId(filialId: string): Promise<string>
  /** Endereço assinado do arquivo. Lança ArquivoAusente se ele não existe mais. */
  assinar(path: string, segundos: number): Promise<string>
  apagarArquivos(item: ItemFila): Promise<void>
  meta: {
    criarConteinerStory(igId: string, videoUrl: string): Promise<string>
    estadoDoConteiner(id: string): Promise<EstadoConteiner>
    publicarConteiner(igId: string, id: string): Promise<string>
    linkDaMidia(id: string): Promise<string | null>
  }
  mensagemDeErro(e: unknown): string
  agora(): Date
  esperar(ms: number): Promise<void>
}

export type DepsDoRelogio = Deps & {
  /** Itens em "publicando". */
  emAndamento(): Promise<ItemFila[]>
  /** Ids de itens "aprovado" com horário vencido, em ordem de horário, no máximo `max`. */
  vencidos(max: number): Promise<string[]>
}

export type Resultado = 'publicado' | 'aguardando_meta' | 'vai_tentar_de_novo' | 'falhou' | 'nao_reservado'

export class ArquivoAusente extends Error {
  constructor() { super('O vídeo não está mais no armazenamento. Monte o story de novo.'); this.name = 'ArquivoAusente' }
}
class ConteinerRecusado extends Error {}

export async function publicarItem(deps: Deps, id: string, opcoes?: { retomar?: boolean }): Promise<Resultado> {
  const item = opcoes?.retomar ? await deps.carregar(id) : await deps.reservar(id)
  if (!item || item.situacao !== 'publicando') return 'nao_reservado'

  let publicouNaMeta = false
  try {
    const igId = await deps.igUserId(item.filial_id)
    let conteiner = item.ig_container_id
    if (!conteiner) {
      if (!item.video_path) throw new ArquivoAusente()
      const url = await deps.assinar(item.video_path, ASSINATURA_META_S)
      conteiner = await deps.meta.criarConteinerStory(igId, url)
      // Guardado antes de qualquer espera: se esta chamada morrer, a próxima retoma daqui sem criar outro
      await deps.salvar(id, { ig_container_id: conteiner })
    }

    let midia: string | null = null
    for (let esperado = 0; ; esperado += INTERVALO_MS) {
      const estado = await deps.meta.estadoDoConteiner(conteiner)
      if (estado === 'PUBLISHED') { publicouNaMeta = true; break }
      if (estado === 'FINISHED') {
        midia = await deps.meta.publicarConteiner(igId, conteiner)
        publicouNaMeta = true
        break
      }
      if (estado === 'ERROR' || estado === 'EXPIRED') throw new ConteinerRecusado('O Instagram não aceitou o vídeo.')
      if (esperado >= ESPERA_MAX_MS) return 'aguardando_meta'
      await deps.esperar(INTERVALO_MS)
    }

    const link = midia ? await deps.meta.linkDaMidia(midia) : null
    await deps.salvar(id, {
      situacao: 'publicado', publicado_em: deps.agora().toISOString(), ig_media_id: midia, ig_link: link,
      video_path: null, quadro_path: null, erro: null,
    })
    // O story já está no ar; falha ao apagar a cópia não desfaz nada
    try { await deps.apagarArquivos(item) } catch (e) { console.error('[fila] não consegui apagar os arquivos de', id, e instanceof Error ? e.message : e) }
    return 'publicado'
  } catch (e) {
    if (publicouNaMeta) {
      // Saiu no Instagram mas o banco não gravou. O item fica "publicando" com o contêiner:
      // a retomada vai ver PUBLISHED na Meta e concluir, sem publicar de novo.
      console.error('[fila] publicado na Meta, mas a gravação falhou em', id, e instanceof Error ? e.message : e)
      return 'publicado'
    }
    if (e instanceof ArquivoAusente) {
      await deps.salvar(id, { situacao: 'falhou', erro: e.message })
      return 'falhou'
    }
    const erro = e instanceof ConteinerRecusado ? e.message : deps.mensagemDeErro(e)
    const tentativas = item.tentativas + 1
    if (tentativas >= TENTATIVAS_MAX) {
      await deps.salvar(id, { situacao: 'falhou', tentativas, erro })
      return 'falhou'
    }
    await deps.salvar(id, { situacao: 'aprovado', tentativas, erro, ig_container_id: null })
    return 'vai_tentar_de_novo'
  }
}

/** Um toque do relógio: retoma o que ficou esperando a Meta e publica o que venceu. */
export async function tocarRelogio(deps: DepsDoRelogio, limiteMs: number): Promise<{ publicados: number; aguardando: number; falhas: number }> {
  const inicio = deps.agora().getTime()
  const resumo = { publicados: 0, aguardando: 0, falhas: 0 }
  const contar = (r: Resultado) => {
    if (r === 'publicado') resumo.publicados++
    else if (r === 'aguardando_meta') resumo.aguardando++
    else if (r === 'falhou' || r === 'vai_tentar_de_novo') resumo.falhas++
  }

  for (const item of await deps.emAndamento()) {
    const parado = deps.agora().getTime() - new Date(item.atualizado_em).getTime()
    if (parado > TRAVA_MIN * 60_000) {
      await deps.salvar(item.id, { situacao: 'falhou', erro: 'A Meta não terminou de processar o vídeo.' })
      resumo.falhas++
    } else if (parado < RETOMAR_APOS_S * 1000) {
      resumo.aguardando++                       // outra chamada pode estar cuidando dele agora
    } else if (!item.ig_container_id) {
      await deps.salvar(item.id, { situacao: 'aprovado' })   // reservado e abandonado antes de criar o contêiner
    } else {
      contar(await publicarItem(deps, item.id, { retomar: true }))
    }
  }

  for (const id of await deps.vencidos(NOVOS_POR_TOQUE)) {
    if (deps.agora().getTime() - inicio > limiteMs) break
    contar(await publicarItem(deps, id))
  }
  return resumo
}

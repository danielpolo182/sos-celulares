// Máquina de publicação da fila de aprovação: leva um item de "aprovado" a "publicado".
// Módulo puro: tudo o que toca banco, armazenamento e Meta entra por `Deps`. As dependências de verdade
// ficam em publicar-deps.ts; o roteiro conferir-publicar.mjs usa dependências de mentira.
//
// A API da Meta não apaga publicação, então a regra que manda aqui é: nunca publicar duas vezes.
//   - Item novo só é publicado por quem conseguiu reservá-lo (aprovado -> publicando, atômico).
//   - Item em andamento só é retomado por quem tomou posse da versão que leu.
//   - Um contêiner que já existe só é abandonado quando a própria Meta diz que ele não serve
//     (ERROR ou EXPIRED). Em qualquer dúvida (resposta perdida, consulta que falhou, banco fora),
//     o item fica "publicando" com o contêiner guardado, e a próxima consulta à Meta decide.
import type { EstadoConteiner } from './instagram'

export const ESPERA_MAX_MS = 40_000      // quanto uma chamada espera a Meta processar o vídeo
export const INTERVALO_MS = 5_000        // intervalo entre consultas do estado
export const MARGEM_MS = 10_000          // o relógio não começa item com menos que isso de prazo
export const TENTATIVAS_MAX = 3
export const TRAVA_MIN = 30              // "publicando" há mais que isso é decidido consultando a Meta
export const RETOMAR_APOS_S = 90         // o relógio não mexe em item tocado há menos que isso (pode estar em voo)
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
  /** Posse de um item "publicando": só vale se ele ainda está como foi lido. null para quem perdeu. */
  tomarPosse(id: string, atualizadoEmLido: string): Promise<ItemFila | null>
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
  /** Itens em "publicando", só de lojas com a fila ligada. */
  emAndamento(): Promise<ItemFila[]>
  /** Ids de itens "aprovado" com horário vencido, em ordem de horário, no máximo `max`, só de lojas com a fila ligada. */
  vencidos(max: number): Promise<string[]>
}

export type Resultado = 'publicado' | 'aguardando_meta' | 'vai_tentar_de_novo' | 'falhou' | 'nao_reservado'

export class ArquivoAusente extends Error {
  constructor() { super('O vídeo não está mais no armazenamento. Monte o story de novo.'); this.name = 'ArquivoAusente' }
}
class ConteinerRecusado extends Error {}

const registrar = (texto: string, id: string, e: unknown) => console.error(`[fila] ${texto} em ${id}:`, e instanceof Error ? e.message : e)

/**
 * Publica um item. `retomar` continua um item que ficou "publicando"; `prazo` (em ms desde 1970)
 * é quando quem chamou precisa da resposta: a espera pela Meta para antes dele.
 */
export async function publicarItem(deps: Deps, id: string, opcoes?: { retomar?: boolean; prazo?: number }): Promise<Resultado> {
  let item: ItemFila | null
  if (opcoes?.retomar) {
    const lido = await deps.carregar(id)
    item = lido && lido.situacao === 'publicando' ? await deps.tomarPosse(id, lido.atualizado_em) : null
  } else {
    item = await deps.reservar(id)
  }
  if (!item || item.situacao !== 'publicando') return 'nao_reservado'

  let conteiner = item.ig_container_id
  let publicouNaMeta = false
  try {
    const igId = await deps.igUserId(item.filial_id)
    if (!conteiner) {
      // O arquivo tem de ser da própria loja do item
      if (!item.video_path || !item.video_path.startsWith(item.filial_id + '/')) throw new ArquivoAusente()
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
      const semPrazo = opcoes?.prazo !== undefined && deps.agora().getTime() + INTERVALO_MS > opcoes.prazo
      if (esperado >= ESPERA_MAX_MS || semPrazo) return 'aguardando_meta'
      await deps.esperar(INTERVALO_MS)
    }

    // Grava "publicado" antes de qualquer outra coisa; o link vem depois e não é essencial
    await deps.salvar(id, {
      situacao: 'publicado', publicado_em: deps.agora().toISOString(), ig_media_id: midia,
      video_path: null, quadro_path: null, erro: null,
    })
    if (midia) {
      try {
        const link = await deps.meta.linkDaMidia(midia)
        if (link) await deps.salvar(id, { ig_link: link })
      } catch (e) { registrar('publicado, mas não consegui guardar o link', id, e) }
    }
    try { await deps.apagarArquivos(item) } catch (e) { registrar('publicado, mas não consegui apagar os arquivos', id, e) }
    return 'publicado'
  } catch (e) {
    if (publicouNaMeta) {
      // Saiu no Instagram mas o banco não gravou. Fica "publicando" com o contêiner:
      // a retomada vai ver PUBLISHED na Meta e concluir, sem publicar de novo.
      registrar('publicado na Meta, mas a gravação falhou', id, e)
      return 'publicado'
    }
    if (conteiner && !(e instanceof ConteinerRecusado)) {
      // Já existe contêiner e não sabemos o que houve com ele (pode até ter sido publicado e a
      // resposta ter se perdido). Não descarta: fica "publicando" e a próxima consulta à Meta decide.
      registrar('erro com contêiner em aberto; aguardando a Meta', id, e)
      return 'aguardando_meta'
    }
    if (e instanceof ArquivoAusente) {
      await deps.salvar(id, { situacao: 'falhou', erro: e.message })
      return 'falhou'
    }
    // Daqui para baixo nada foi publicado: ou o contêiner nem chegou a existir, ou a Meta o recusou
    const erro = e instanceof ConteinerRecusado ? e.message : deps.mensagemDeErro(e)
    const tentativas = item.tentativas + 1
    if (tentativas >= TENTATIVAS_MAX) {
      await deps.salvar(id, { situacao: 'falhou', tentativas, erro, ig_container_id: null })
      return 'falhou'
    }
    await deps.salvar(id, { situacao: 'aprovado', tentativas, erro, ig_container_id: null })
    return 'vai_tentar_de_novo'
  }
}

/** Um toque do relógio: retoma o que ficou esperando a Meta e publica o que venceu, dentro de `limiteMs`. */
export async function tocarRelogio(deps: DepsDoRelogio, limiteMs: number): Promise<{ publicados: number; aguardando: number; falhas: number }> {
  const prazo = deps.agora().getTime() + limiteMs
  const cabeMaisUm = () => deps.agora().getTime() + MARGEM_MS <= prazo
  const resumo = { publicados: 0, aguardando: 0, falhas: 0 }
  const contar = (r: Resultado) => {
    if (r === 'publicado') resumo.publicados++
    else if (r === 'aguardando_meta') resumo.aguardando++
    else if (r === 'falhou' || r === 'vai_tentar_de_novo') resumo.falhas++
  }

  for (const item of await deps.emAndamento()) {
    const parado = deps.agora().getTime() - new Date(item.atualizado_em).getTime()
    if (parado < RETOMAR_APOS_S * 1000) { resumo.aguardando++; continue }   // outra chamada pode estar cuidando dele agora

    if (!item.ig_container_id) {
      // Reservado e abandonado antes de criar o contêiner: nada saiu, volta para a fila
      if (await deps.tomarPosse(item.id, item.atualizado_em)) await deps.salvar(item.id, { situacao: 'aprovado' })
      continue
    }

    if (parado > TRAVA_MIN * 60_000) {
      // Parado há muito tempo: quem decide é a Meta, nunca um palpite
      let estado: EstadoConteiner | null = null
      try { estado = await deps.meta.estadoDoConteiner(item.ig_container_id) } catch (e) { registrar('trava: não consegui consultar a Meta', item.id, e) }
      if (estado !== 'PUBLISHED' && estado !== 'FINISHED') {
        if (!(await deps.tomarPosse(item.id, item.atualizado_em))) continue
        await deps.salvar(item.id, estado === null
          ? { situacao: 'falhou', erro: 'Não consegui confirmar com o Instagram se o story saiu. Confira o perfil antes de tentar de novo.' }
          : { situacao: 'falhou', erro: 'A Meta não terminou de processar o vídeo.', ig_container_id: null })
        resumo.falhas++
        continue
      }
    }

    if (!cabeMaisUm()) { resumo.aguardando++; continue }
    contar(await publicarItem(deps, item.id, { retomar: true, prazo }))
  }

  for (const id of await deps.vencidos(NOVOS_POR_TOQUE)) {
    if (!cabeMaisUm()) break
    contar(await publicarItem(deps, id, { prazo }))
  }
  return resumo
}

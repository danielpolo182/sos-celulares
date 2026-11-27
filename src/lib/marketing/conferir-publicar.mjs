// Conferência da máquina de publicação da fila, com banco e Meta de mentira, em memória.
// Rodar: node --no-warnings src/lib/marketing/conferir-publicar.mjs
// Nada aqui toca no Instagram nem no Supabase.
import assert from 'node:assert/strict'
import { publicarItem, tocarRelogio, ArquivoAusente } from './publicar.ts'
import { ErroMeta, mensagemParaTela } from './instagram.ts'

const T0 = Date.parse('2026-11-27T15:00:00Z')
const iso = (ms) => new Date(ms).toISOString()

function mundo(itens, roteiro = {}) {
  const chamadas = { criar: 0, estado: 0, publicar: 0, apagar: 0, esperado: 0, vencidosMax: null, noAr: 0 }
  let relogio = T0
  const banco = new Map(itens.map((i) => [i.id, {
    filial_id: 'F', situacao: 'aprovado', tentativas: 0, ig_container_id: null, video_path: 'F/x/story.mp4',
    quadro_path: 'F/x/quadro-final.jpg', agendado_para: iso(T0 - 60_000), atualizado_em: iso(T0), ...i,
  }]))
  const deps = {
    reservar: async (id) => {
      const it = banco.get(id)
      if (!it || it.situacao !== 'aprovado' || roteiro.reservaPerdida) return null
      Object.assign(it, { situacao: 'publicando', atualizado_em: iso(relogio) })
      return { ...it }
    },
    carregar: async (id) => (banco.has(id) ? { ...banco.get(id) } : null),
    // Posse da retomada: só quem leu a versão atual do item leva; o perdedor recebe null
    tomarPosse: async (id, lido) => {
      const it = banco.get(id)
      if (!it || it.situacao !== 'publicando' || it.atualizado_em !== lido) return null
      relogio += 1
      it.atualizado_em = iso(relogio)
      return { ...it }
    },
    salvar: async (id, campos) => {
      if (roteiro.salvarFalha?.(campos)) throw new Error('banco fora do ar')
      Object.assign(banco.get(id), campos, { atualizado_em: iso(relogio) })
    },
    igUserId: async () => 'IG1',
    assinar: async (path) => { if (roteiro.semArquivo) throw new ArquivoAusente(); return 'https://assinado/' + path },
    apagarArquivos: async () => { chamadas.apagar++ },
    meta: {
      criarConteinerStory: async () => { chamadas.criar++; if (roteiro.criarErro) throw roteiro.criarErro; return 'C' + chamadas.criar },
      estadoDoConteiner: async () => {
        chamadas.estado++
        if (roteiro.estadoErro?.(chamadas.estado)) throw new ErroMeta('sem resposta da Meta', 0, null)
        const e = roteiro.estados
        if (e === undefined) return chamadas.noAr > 0 ? 'PUBLISHED' : 'FINISHED'   // depois de publicado, a Meta diz PUBLISHED
        return typeof e === 'function' ? e(chamadas.estado) : e
      },
      publicarConteiner: async () => {
        chamadas.publicar++
        chamadas.noAr++                       // o story foi ao ar de verdade...
        if (roteiro.respostaPerdida?.(chamadas.publicar)) throw new ErroMeta('sem resposta da Meta', 0, null)   // ...mas a resposta não chegou
        return 'M1'
      },
      linkDaMidia: async () => 'https://www.instagram.com/stories/soscelularescolombo/1/',
    },
    mensagemDeErro: mensagemParaTela,
    agora: () => new Date(relogio),
    esperar: async (ms) => { relogio += ms; chamadas.esperado += ms },
    emAndamento: async () => [...banco.values()].filter((i) => i.situacao === 'publicando').map((i) => ({ ...i })),
    vencidos: async (max) => { chamadas.vencidosMax = max; return [...banco.values()].filter((i) => i.situacao === 'aprovado').slice(0, max).map((i) => i.id) },
  }
  return { deps, banco, chamadas, roteiro, envelhecer: (id, ms) => { banco.get(id).atualizado_em = iso(relogio - ms) } }
}

let casos = 0
async function caso(nome, f) { try { await f(); casos++ } catch (e) { e.message = `[${nome}] ${e.message}`; throw e } }

await caso('caminho feliz', async () => {
  const m = mundo([{ id: 'a' }], { estados: (n) => (n < 2 ? 'IN_PROGRESS' : 'FINISHED') })
  assert.equal(await publicarItem(m.deps, 'a'), 'publicado')
  const it = m.banco.get('a')
  assert.equal(m.chamadas.publicar, 1)
  assert.equal(it.situacao, 'publicado')
  assert.equal(it.ig_media_id, 'M1')
  assert.ok(it.publicado_em && it.ig_link)
  assert.equal(it.video_path, null)
  assert.equal(it.quadro_path, null)
  assert.equal(m.chamadas.apagar, 1)
})

await caso('reserva perdida: outro processo pegou o item', async () => {
  const m = mundo([{ id: 'a' }], { reservaPerdida: true })
  assert.equal(await publicarItem(m.deps, 'a'), 'nao_reservado')
  assert.deepEqual([m.chamadas.criar, m.chamadas.estado, m.chamadas.publicar], [0, 0, 0])
})

await caso('duas chamadas ao mesmo tempo publicam uma vez só', async () => {
  const m = mundo([{ id: 'a' }])
  const r = await Promise.all([publicarItem(m.deps, 'a'), publicarItem(m.deps, 'a')])
  assert.deepEqual(r.sort(), ['nao_reservado', 'publicado'])
  assert.equal(m.chamadas.publicar, 1)
})

await caso('Meta demora: fica aguardando, com o contêiner guardado', async () => {
  const m = mundo([{ id: 'a' }], { estados: 'IN_PROGRESS' })
  assert.equal(await publicarItem(m.deps, 'a'), 'aguardando_meta')
  assert.equal(m.banco.get('a').situacao, 'publicando')
  assert.equal(m.banco.get('a').ig_container_id, 'C1')
  assert.equal(m.chamadas.esperado, 40_000)
  assert.equal(m.chamadas.publicar, 0)
})

await caso('retomada: não cria o contêiner de novo', async () => {
  const m = mundo([{ id: 'a', situacao: 'publicando', ig_container_id: 'C9' }])
  assert.equal(await publicarItem(m.deps, 'a', { retomar: true }), 'publicado')
  assert.equal(m.chamadas.criar, 0)
  assert.equal(m.chamadas.publicar, 1)
})

await caso('já saiu: a Meta diz PUBLISHED e nada é publicado de novo', async () => {
  const m = mundo([{ id: 'a', situacao: 'publicando', ig_container_id: 'C9' }], { estados: 'PUBLISHED' })
  assert.equal(await publicarItem(m.deps, 'a', { retomar: true }), 'publicado')
  assert.equal(m.chamadas.publicar, 0)
  assert.equal(m.banco.get('a').situacao, 'publicado')
})

await caso('banco falha logo depois de publicar: não volta para a fila', async () => {
  const m = mundo([{ id: 'a' }], { salvarFalha: (c) => c.situacao === 'publicado' })
  assert.equal(await publicarItem(m.deps, 'a'), 'publicado')
  assert.equal(m.chamadas.publicar, 1)
  const it = m.banco.get('a')
  assert.equal(it.situacao, 'publicando', 'continua reservado, para a retomada concluir')
  assert.equal(it.ig_container_id, 'C1')
})

await caso('erro da Meta: tenta três vezes e para', async () => {
  const m = mundo([{ id: 'a' }], { criarErro: new ErroMeta('vídeo inválido', 400, 100) })
  assert.equal(await publicarItem(m.deps, 'a'), 'vai_tentar_de_novo')
  assert.deepEqual([m.banco.get('a').situacao, m.banco.get('a').tentativas, m.banco.get('a').ig_container_id], ['aprovado', 1, null])
  assert.equal(await publicarItem(m.deps, 'a'), 'vai_tentar_de_novo')
  assert.equal(m.banco.get('a').tentativas, 2)
  assert.equal(await publicarItem(m.deps, 'a'), 'falhou')
  assert.equal(m.banco.get('a').situacao, 'falhou')
  assert.match(m.banco.get('a').erro, /O Instagram recusou: vídeo inválido/)
  assert.equal(await publicarItem(m.deps, 'a'), 'nao_reservado', 'depois de falhar não tenta sozinho')
})

await caso('token recusado: a tela mostra o motivo certo', async () => {
  const m = mundo([{ id: 'a', tentativas: 2 }], { criarErro: new ErroMeta('Invalid OAuth access token', 401, 190) })
  assert.equal(await publicarItem(m.deps, 'a'), 'falhou')
  assert.equal(m.banco.get('a').erro, 'O Instagram recusou o acesso. O token precisa ser trocado.')
})

await caso('sem arquivo: falha na primeira, com mensagem clara', async () => {
  const m = mundo([{ id: 'a' }], { semArquivo: true })
  assert.equal(await publicarItem(m.deps, 'a'), 'falhou')
  assert.equal(m.banco.get('a').erro, 'O vídeo não está mais no armazenamento. Monte o story de novo.')
  assert.equal(m.chamadas.criar, 0)
})

await caso('contêiner recusado pela Meta conta como tentativa', async () => {
  const m = mundo([{ id: 'a' }], { estados: 'ERROR' })
  assert.equal(await publicarItem(m.deps, 'a'), 'vai_tentar_de_novo')
  assert.equal(m.banco.get('a').ig_container_id, null)
})

await caso('trava: publicando há mais de 30 minutos vira falhou', async () => {
  const m = mundo([{ id: 'a', situacao: 'publicando', ig_container_id: 'C9', atualizado_em: iso(T0 - 31 * 60_000) }], { estados: 'IN_PROGRESS' })
  const r = await tocarRelogio(m.deps, 45_000)
  assert.equal(m.banco.get('a').situacao, 'falhou')
  assert.equal(m.banco.get('a').erro, 'A Meta não terminou de processar o vídeo.')
  assert.equal(r.falhas, 1)
})

await caso('em voo: publicando há poucos segundos não é tocado pelo relógio', async () => {
  const m = mundo([{ id: 'a', situacao: 'publicando', ig_container_id: 'C9', atualizado_em: iso(T0 - 30_000) }])
  const r = await tocarRelogio(m.deps, 45_000)
  assert.deepEqual([m.chamadas.estado, m.chamadas.publicar], [0, 0])
  assert.equal(m.banco.get('a').situacao, 'publicando')
  assert.equal(r.aguardando, 1)
})

await caso('relógio retoma o que ficou aguardando', async () => {
  const m = mundo([{ id: 'a', situacao: 'publicando', ig_container_id: 'C9', atualizado_em: iso(T0 - 5 * 60_000) }])
  const r = await tocarRelogio(m.deps, 45_000)
  assert.equal(m.banco.get('a').situacao, 'publicado')
  assert.equal(r.publicados, 1)
})

await caso('relógio: no máximo 3 itens novos por toque', async () => {
  const m = mundo(['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })))
  const r = await tocarRelogio(m.deps, 45_000)
  assert.equal(m.chamadas.vencidosMax, 3)
  assert.equal(r.publicados, 3)
  assert.equal([...m.banco.values()].filter((i) => i.situacao === 'aprovado').length, 2)
})

await caso('relógio para de começar itens quando o tempo acaba', async () => {
  const m = mundo(['a', 'b', 'c'].map((id) => ({ id })), { estados: 'IN_PROGRESS' })
  const r = await tocarRelogio(m.deps, 45_000)
  assert.equal(m.chamadas.criar, 1, 'o primeiro gasta a espera inteira; os outros ficam para o próximo toque')
  assert.equal(r.aguardando, 1)
  assert.ok(m.chamadas.esperado <= 45_000, 'nunca espera além do prazo do toque')
})

// ---- Casos da revisão final: nunca publicar duas vezes ----

await caso('resposta do publicar se perde: o story saiu uma vez e não sai de novo', async () => {
  const m = mundo([{ id: 'a' }], { respostaPerdida: (n) => n === 1 })
  assert.equal(await publicarItem(m.deps, 'a'), 'aguardando_meta')
  assert.equal(m.banco.get('a').situacao, 'publicando', 'não volta para a fila')
  assert.equal(m.banco.get('a').ig_container_id, 'C1', 'o contêiner não é descartado')
  m.envelhecer('a', 5 * 60_000)
  await tocarRelogio(m.deps, 45_000)
  assert.equal(m.banco.get('a').situacao, 'publicado')
  assert.deepEqual([m.chamadas.noAr, m.chamadas.criar], [1, 1])
})

await caso('publicou, o banco não gravou e a consulta seguinte falhou: continua uma publicação só', async () => {
  let falhas = 0
  const m = mundo([{ id: 'a' }], { salvarFalha: (c) => c.situacao === 'publicado' && falhas++ === 0 })
  assert.equal(await publicarItem(m.deps, 'a'), 'publicado')
  m.envelhecer('a', 5 * 60_000)
  const consultas = m.chamadas.estado
  m.roteiro.estadoErro = (n) => n === consultas + 1
  await tocarRelogio(m.deps, 45_000)
  assert.equal(m.banco.get('a').situacao, 'publicando', 'sem saber o estado, não mexe')
  assert.equal(m.banco.get('a').ig_container_id, 'C1')
  m.envelhecer('a', 5 * 60_000)
  await tocarRelogio(m.deps, 45_000)
  assert.equal(m.banco.get('a').situacao, 'publicado')
  assert.deepEqual([m.chamadas.noAr, m.chamadas.criar], [1, 1])
})

await caso('trava com o story já no ar: conclui como publicado, não como falha', async () => {
  const m = mundo([{ id: 'a', situacao: 'publicando', ig_container_id: 'C9' }], { estados: 'PUBLISHED' })
  m.envelhecer('a', 31 * 60_000)
  await tocarRelogio(m.deps, 45_000)
  assert.equal(m.banco.get('a').situacao, 'publicado')
  assert.equal(m.chamadas.publicar, 0)
})

await caso('trava sem conseguir consultar a Meta: falha avisando, e guarda o contêiner', async () => {
  const m = mundo([{ id: 'a', situacao: 'publicando', ig_container_id: 'C9' }], { estadoErro: () => true })
  m.envelhecer('a', 31 * 60_000)
  await tocarRelogio(m.deps, 45_000)
  assert.equal(m.banco.get('a').situacao, 'falhou')
  assert.match(m.banco.get('a').erro, /Confira o perfil/)
  assert.equal(m.banco.get('a').ig_container_id, 'C9', 'com o contêiner guardado, tentar de novo consulta antes de publicar')
})

await caso('dois relógios retomam o mesmo item: publica uma vez', async () => {
  const m = mundo([{ id: 'a', situacao: 'publicando', ig_container_id: 'C9' }])
  m.envelhecer('a', 5 * 60_000)
  await Promise.all([tocarRelogio(m.deps, 45_000), tocarRelogio(m.deps, 45_000)])
  assert.equal(m.chamadas.publicar, 1)
  assert.equal(m.banco.get('a').situacao, 'publicado')
})

await caso('erro ao retomar não descarta o contêiner', async () => {
  const m = mundo([{ id: 'a', situacao: 'publicando', ig_container_id: 'C9' }], { estadoErro: (n) => n === 1 })
  assert.equal(await publicarItem(m.deps, 'a', { retomar: true }), 'aguardando_meta')
  assert.deepEqual([m.banco.get('a').situacao, m.banco.get('a').ig_container_id, m.banco.get('a').tentativas], ['publicando', 'C9', 0])
})

await caso('prazo: para de esperar antes do limite da chamada', async () => {
  const m = mundo([{ id: 'a' }], { estados: 'IN_PROGRESS' })
  assert.equal(await publicarItem(m.deps, 'a', { prazo: T0 + 12_000 }), 'aguardando_meta')
  assert.ok(m.chamadas.esperado <= 12_000, `esperou ${m.chamadas.esperado} ms`)
})

await caso('vídeo de outra loja no caminho do item: não assina nem publica', async () => {
  const m = mundo([{ id: 'a', video_path: 'OUTRA/x/story.mp4' }])
  assert.equal(await publicarItem(m.deps, 'a'), 'falhou')
  assert.equal(m.chamadas.criar, 0)
})

console.log(`publicar: ${casos} casos ok`)

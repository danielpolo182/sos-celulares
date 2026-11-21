// src/lib/fornecedores.ts
// Consulta de peças nos fornecedores da loja. Usado pelas rotas de busca das
// telas e pelo agente do WhatsApp. Cada peça vista fica guardada em
// fornecedor_pecas, que vira o histórico de custo e a reserva quando o site
// do fornecedor está fora do ar.
import { createClient } from '@supabase/supabase-js'

export type Fornecedor = 'iplay' | 'fixcell'

export type PecaFornecedor = {
  fornecedor: Fornecedor
  nome: string
  /** Custo para a loja. Informação interna: nunca vai para o cliente. */
  preco: number
  codigo?: string
  url?: string
}

export type TipoPeca = 'tela' | 'bateria' | 'conector'

const TEMPO_LIMITE_MS = 12_000

// ── iPlay: catálogo exposto por um robô de conversa (Typebot) ─────────────
const IPLAY_BASE = 'https://bot.gestorv3.com/api/v1'
const IPLAY_BOT = 'iplay-cwb-web'

function textoDoNo(no: unknown): string {
  if (!no || typeof no !== 'object') return ''
  const n = no as Record<string, unknown>
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) return (n.children as unknown[]).map(textoDoNo).join('')
  return ''
}

function lerProdutosIPlay(mensagens: unknown[]): PecaFornecedor[] {
  // Os resultados vêm em blocos de parágrafo; junta o texto de todos e extrai
  // as linhas "n - código - nome - [R$ preço]".
  let texto = ''
  for (const msg of mensagens) {
    const richText = ((msg as Record<string, unknown>)?.content as Record<string, unknown>)?.richText
    if (Array.isArray(richText)) texto += richText.map(textoDoNo).join('\n') + '\n'
  }
  const produtos: PecaFornecedor[] = []
  const regex = /\d+\s*-\s*(\d+)\s*-\s*(.+?)\s*-\s*\[R\$\s*([\d,.]+)\]/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(texto)) !== null) {
    const preco = parseFloat(m[3].replace('.', '').replace(',', '.'))
    if (!isNaN(preco)) produtos.push({ fornecedor: 'iplay', codigo: m[1].trim(), nome: m[2].trim(), preco })
  }
  return produtos
}

export async function buscarIPlay(consulta: string): Promise<PecaFornecedor[]> {
  const sinal = AbortSignal.timeout(TEMPO_LIMITE_MS)
  const post = async (caminho: string, corpo: unknown) => {
    const res = await fetch(`${IPLAY_BASE}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: sinal,
    })
    if (!res.ok) throw new Error(`iPlay respondeu ${res.status} em ${caminho.split('/').pop()}`)
    return res.json() as Promise<{ sessionId?: string; messages?: unknown[] }>
  }

  const inicio = await post(`/typebots/${IPLAY_BOT}/startChat`, {})
  if (!inicio.sessionId) throw new Error('iPlay não abriu a sessão de busca')
  // O robô pede "Digite iplay para continuar" antes de aceitar a busca
  await post(`/sessions/${inicio.sessionId}/continueChat`, { message: 'iplay' })
  const resposta = await post(`/sessions/${inicio.sessionId}/continueChat`, { message: consulta.trim() })
  return lerProdutosIPlay(resposta.messages ?? [])
}

// ── Fix Cell Parts: loja na Tray Commerce, busca em HTML ──────────────────
const FIXCELL_BUSCA = 'https://www.fixcellparts.com.br/loja/busca.php'
const FIXCELL_LOJA = '1183835'

function decodificarHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function buscarFixcell(consulta: string): Promise<PecaFornecedor[]> {
  return (await buscarFixcellPagina(consulta, 1)).pecas
}

/**
 * Uma página (15 itens) da busca da loja. Com a consulta vazia a loja lista
 * todos os produtos, que é como o catálogo inteiro é capturado.
 */
export async function buscarFixcellPagina(consulta: string, pagina: number): Promise<{ pecas: PecaFornecedor[]; ultimaPagina: number }> {
  const url = `${FIXCELL_BUSCA}?loja=${FIXCELL_LOJA}&palavra_busca=${encodeURIComponent(consulta.trim())}&pg=${pagina}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  })
  if (!res.ok) throw new Error(`Fix Cell respondeu ${res.status}`)
  const html = new TextDecoder('iso-8859-1').decode(await res.arrayBuffer())

  const produtos: PecaFornecedor[] = []
  const regex = /<a class="product-info" href="([^"]+)"[\s\S]*?<div class="product-name">\s*([^<]+?)\s*<\/div>[\s\S]*?<span class="current-price">\s*R\$\s*([\d.,]+)\s*<\/span>/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) {
    const preco = parseFloat(m[3].replace(/\./g, '').replace(',', '.'))
    if (!isNaN(preco)) produtos.push({ fornecedor: 'fixcell', url: m[1], nome: decodificarHtml(m[2]), preco })
  }
  const paginas = [...html.matchAll(/[?&]pg=(\d+)/g)].map(p => Number(p[1]))
  return { pecas: produtos, ultimaPagina: Math.max(pagina, ...paginas) }
}

// ── Cache ─────────────────────────────────────────────────────────────────
function clienteDeServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && chave ? createClient(url, chave) : null
}

export type ResultadoGravacao = { ok: true } | { ok: false; erro: string; tabelaAusente: boolean }

/**
 * Guarda o custo mais recente de cada peça vista. Falha aqui nunca derruba a
 * busca; quem precisa saber se gravou (a captura do catálogo) lê o retorno.
 */
export async function guardarPecas(pecas: PecaFornecedor[], consulta: string): Promise<ResultadoGravacao> {
  if (pecas.length === 0) return { ok: true }
  try {
    const supabase = clienteDeServico()
    if (!supabase) return { ok: false, erro: 'chave de serviço do banco não configurada no servidor', tabelaAusente: false }
    const agora = new Date().toISOString()
    // A mesma peça pode aparecer duas vezes numa busca; o upsert não aceita chave repetida no mesmo lote
    const unicas = new Map(pecas.map(p => [`${p.fornecedor}|${p.nome}`, p]))
    const { error } = await supabase.from('fornecedor_pecas').upsert(
      [...unicas.values()].map(p => ({
        fornecedor: p.fornecedor, nome: p.nome, codigo: p.codigo ?? null, preco: p.preco,
        url: p.url ?? null, consulta, atualizado_em: agora,
      })),
      { onConflict: 'fornecedor,nome' }
    )
    // Tabela ausente (migração não rodada) cai aqui e é ignorada
    if (!error) return { ok: true }
    console.warn('[fornecedores] cache não gravado:', error.code, error.message)
    // 42P01 (Postgres) e PGRST205 (API): a tabela não existe
    return { ok: false, erro: `${error.code ?? ''} ${error.message}`.trim(), tabelaAusente: error.code === '42P01' || error.code === 'PGRST205' }
  } catch (e) {
    console.warn('[fornecedores] cache não gravado:', e)
    return { ok: false, erro: e instanceof Error ? e.message : String(e), tabelaAusente: false }
  }
}

/** Peças guardadas cujo nome traz todas as palavras do modelo, vistas nos últimos 30 dias. */
export async function pecasGuardadas(fornecedor: Fornecedor, palavrasDoModelo: string[]): Promise<PecaFornecedor[]> {
  const supabase = clienteDeServico()
  if (!supabase || palavrasDoModelo.length === 0) return []
  let consulta = supabase
    .from('fornecedor_pecas')
    .select('fornecedor, nome, codigo, preco, url')
    .eq('fornecedor', fornecedor)
    .gte('atualizado_em', new Date(Date.now() - 30 * 86_400_000).toISOString())
  for (const palavra of palavrasDoModelo) consulta = consulta.ilike('nome', `%${palavra}%`)
  const { data } = await consulta.limit(200)
  return (data ?? []).map(p => ({
    fornecedor, nome: p.nome as string, preco: Number(p.preco),
    codigo: (p.codigo as string | null) ?? undefined, url: (p.url as string | null) ?? undefined,
  }))
}

// ── Busca por modelo e tipo de peça (agente) ──────────────────────────────
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Os fornecedores escrevem "S23FE" e "S23+": separa a variante para comparar com "S23 FE" e "S23 Plus"
const normalizar = (s: string) => semAcento(s).toLowerCase()
  .replace(/\+/g, ' plus ')
  .replace(/(\d)(fe|pro|plus|ultra|lite|max|mini)\b/g, '$1 $2')
  // Os fornecedores chamam o iPhone 8 de "IPHONE 8G" (e "IPHONE - 8G")
  .replace(/\b(iphone[ -]*\d{1,2})g\b/g, '$1')

/** "Samsung Galaxy A54 5G (SM-A546)" → "a54": é como os fornecedores indexam. */
export function nomeBaseDoModelo(modelo: string): string {
  return normalizar(modelo)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b[2-5]g\b/g, ' ')
    .replace(/\b(samsung|motorola|xiaomi|apple|realme|asus|nokia|tcl|positivo|infinix|lg|oppo|oneplus|tecno)\b/g, ' ')
    // Palavras que os fornecedores omitem no nome da peça ("Galaxy A54" vira "SAMSUNG A54")
    .replace(/\b(galaxy|moto|redmi)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

const VARIANTES = ['pro max', 'pro', 'ultra', 'plus', 'fe', 'lite', 'mini', 'max', 'neo', 'play', 'power']
const temPalavra = (texto: string, palavra: string) => new RegExp(`(^|[^a-z0-9])${palavra}([^a-z0-9]|$)`).test(texto)

function varianteDe(texto: string): string | undefined {
  const t = normalizar(texto)
  return VARIANTES.find(v => temPalavra(t, v))
}

// Linhas de produto que mudam o aparelho: "Redmi 12" e "Redmi Note 12" são celulares diferentes
const FAMILIAS = ['note', 'poco', 'edge', 'hot', 'smart', 'razr', 'spark', 'camon', 'zenfone', 'rog', 'one']
const familiasDe = (texto: string) => FAMILIAS.filter(f => temPalavra(texto, f)).join(',')

const MARCAS: [string, string[]][] = [
  ['samsung', ['samsung', 'galaxy']], ['motorola', ['motorola', 'moto']], ['xiaomi', ['xiaomi', 'redmi', 'poco']],
  ['apple', ['apple', 'iphone', 'ipad']], ['realme', ['realme']], ['infinix', ['infinix']], ['lg', ['lg']],
  ['asus', ['asus', 'zenfone']], ['nokia', ['nokia']], ['tcl', ['tcl']], ['tecno', ['tecno']], ['oppo', ['oppo']],
]
const marcasDe = (texto: string) => MARCAS.filter(([, nomes]) => nomes.some(n => temPalavra(texto, n))).map(([m]) => m)

/**
 * Descarta peças de outro aparelho: marca, linha (Note, Poco…) ou variante
 * (Pro, Plus…) diferente, geração de rede diferente quando a peça distingue
 * 4G de 5G, e nomes que não trazem todas as palavras do modelo.
 */
export function filtrarPecasDoModelo(pecas: PecaFornecedor[], modelo: string): PecaFornecedor[] {
  const modeloNorm = normalizar(modelo)
  const palavras = nomeBaseDoModelo(modelo).split(' ').filter(Boolean)
  const variante = varianteDe(modelo)
  const familias = familiasDe(modeloNorm)
  const marcas = marcasDe(modeloNorm)
  const geracao = temPalavra(modeloNorm, '5g') ? '5g' : temPalavra(modeloNorm, '4g') ? '4g' : null

  return pecas.filter(p => {
    const nome = normalizar(p.nome)
    if (palavras.length === 0 || !palavras.every(w => temPalavra(nome, w))) return false
    // "IPHONE 12 / 12 PRO": a peça serve em mais de um aparelho e cada trecho entre
    // barras é um deles. A variante é conferida no trecho que cita o número do modelo.
    // A linha (Note, Poco…) também vale por trecho: "REDMI 13C / POCO C65" serve no Redmi 13C.
    const numeros = palavras.filter(w => /\d/.test(w))
    const trechos: { texto: string; familias: string }[] = []
    let linhaAnterior = ''
    for (const texto of nome.split('/')) {
      // "NOTE 12 PRO 5G / 12 PRO PLUS": o trecho que começa pelo número continua na linha do anterior
      const linha = familiasDe(texto) || (/^\s*\d+\b/.test(texto) ? linhaAnterior : '')
      linhaAnterior = linha
      if (numeros.every(w => temPalavra(texto, w))) trechos.push({ texto, familias: linha })
    }
    const candidatos = trechos.length ? trechos : [{ texto: nome, familias: familiasDe(nome) }]
    if (!candidatos.some(t => varianteDe(t.texto) === variante && t.familias === familias)) return false
    const marcasDaPeca = marcasDe(nome)
    if (marcas.length > 0 && marcasDaPeca.length > 0 && !marcasDaPeca.some(m => marcas.includes(m))) return false
    if (geracao) {
      const tem4g = temPalavra(nome, '4g'), tem5g = temPalavra(nome, '5g')
      if ((tem4g || tem5g) && !(geracao === '5g' ? tem5g : tem4g)) return false
    }
    return true
  })
}

// A busca dos fornecedores devolve itens vizinhos (película, tampa, a tela numa
// busca de conector); o nome da peça precisa dizer que ela é do tipo pedido.
const NOME_DO_TIPO: Record<TipoPeca, RegExp> = {
  tela: /\b(frontal|display|tela|lcd|oled|amoled|incell)\b/,
  bateria: /\bbateria\b/,
  conector: /\b(conector|carga|dock)\b/,
}
const NAO_E_PECA_DE_REPARO = /\b(pelicula|capa|capinha|tampa|vidro|cola|ferramenta|suporte)\b/

export function filtrarPecasDoTipo(pecas: PecaFornecedor[], tipo: TipoPeca): PecaFornecedor[] {
  return pecas.filter(p => {
    const nome = semAcento(p.nome).toLowerCase()
    if (NAO_E_PECA_DE_REPARO.test(nome)) return false
    // "Frontal" numa busca de conector ou bateria é a tela, não a peça pedida
    if (tipo !== 'tela' && /\bfrontal\b/.test(nome)) return false
    // "FLEX LCD MOTO G60" é o cabo flat da tela, não a tela
    if (tipo === 'tela' && /^\s*flex\b/.test(nome)) return false
    return NOME_DO_TIPO[tipo].test(nome)
  })
}

export const TIPOS_DE_PECA: TipoPeca[] = ['tela', 'bateria', 'conector']

/** Texto de busca que cada fornecedor entende para um modelo e um tipo de peça. */
export const consultaParaModelo = (fornecedor: Fornecedor, modelo: string, tipo: TipoPeca) =>
  `${TERMO_DE_BUSCA[tipo][fornecedor]} ${nomeBaseDoModelo(modelo)}`

const TERMO_DE_BUSCA: Record<TipoPeca, Record<Fornecedor, string>> = {
  tela: { iplay: 'frontal', fixcell: 'frontal' },
  bateria: { iplay: 'bateria', fixcell: 'bateria' },
  conector: { iplay: 'carga', fixcell: 'conector de carga' },
}

export type ResultadoBuscaPecas = {
  pecas: PecaFornecedor[]
  /** Fornecedores que não responderam; quando há peças deles, vieram do cache. */
  falhas: Fornecedor[]
  doCache: Fornecedor[]
}

/** Consulta os dois fornecedores ao mesmo tempo e devolve só as peças do modelo pedido, da mais barata para a mais cara. */
export async function buscarPecasParaModelo(modelo: string, tipo: TipoPeca): Promise<ResultadoBuscaPecas> {
  const base = nomeBaseDoModelo(modelo)
  const fornecedores: [Fornecedor, (q: string) => Promise<PecaFornecedor[]>][] = [
    ['iplay', buscarIPlay],
    ['fixcell', buscarFixcell],
  ]
  const resultado: ResultadoBuscaPecas = { pecas: [], falhas: [], doCache: [] }

  await Promise.all(fornecedores.map(async ([fornecedor, buscar]) => {
    const consulta = consultaParaModelo(fornecedor, modelo, tipo)
    // A busca dos fornecedores é parcial e varia de uma consulta para outra; o
    // catálogo guardado completa o que ela não trouxe. O preço da busca ao vivo vale mais.
    const doCatalogo = filtrarPecasDoTipo(filtrarPecasDoModelo(await pecasGuardadas(fornecedor, base.split(' ').filter(Boolean)), modelo), tipo)
    let aoVivo: PecaFornecedor[] = []
    try {
      const encontradas = await buscar(consulta)
      await guardarPecas(encontradas, consulta)
      aoVivo = filtrarPecasDoTipo(filtrarPecasDoModelo(encontradas, modelo), tipo)
    } catch (e) {
      console.warn(`[fornecedores] ${fornecedor} falhou:`, e instanceof Error ? e.message : e)
      resultado.falhas.push(fornecedor)
      if (doCatalogo.length > 0) resultado.doCache.push(fornecedor)
    }
    const vistas = new Set(aoVivo.map(p => p.nome))
    resultado.pecas.push(...aoVivo, ...doCatalogo.filter(p => !vistas.has(p.nome)))
  }))

  resultado.pecas.sort((a, b) => a.preco - b.preco)
  return resultado
}

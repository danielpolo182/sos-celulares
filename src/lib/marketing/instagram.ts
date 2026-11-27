// Chamadas à API da Meta para publicar stories na conta do Instagram da loja.
// Documentação consultada em 26/11/2026 (API v27.0, "API do Instagram com Login Unificado"):
//   https://developers.facebook.com/docs/instagram-platform/content-publishing
//   https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started
// O token é de usuário do sistema, as chamadas vão para graph.facebook.com e a conta se descobre em
// /me/assigned_instagram_accounts (/me NÃO é a conta). Versões mudam: reler antes de mexer.
//
// O token vai só no cabeçalho. Nenhuma mensagem de erro deste módulo o contém.
// Módulo sem dependências do projeto, para os roteiros de conferência o carregarem direto.

const BASE = 'https://graph.facebook.com/v27.0'

export type EstadoConteiner = 'FINISHED' | 'IN_PROGRESS' | 'ERROR' | 'EXPIRED' | 'PUBLISHED'

export class ErroMeta extends Error {
  status: number
  /** Código de erro da Meta (190 = token inválido ou revogado); null quando a resposta não trouxe. */
  codigo: number | null
  constructor(mensagem: string, status: number, codigo: number | null) {
    super(mensagem)
    this.name = 'ErroMeta'
    this.status = status
    this.codigo = codigo
  }
}

/** Identificadores da Meta são numéricos. Qualquer outra coisa não entra no endereço da chamada. */
function soDigitos(id: string): string {
  if (!/^\d+$/.test(id)) throw new ErroMeta('identificador inválido', 0, null)
  return id
}

async function chamar(metodo: 'GET' | 'POST', caminho: string, token: string, dados?: Record<string, unknown>): Promise<Record<string, unknown>> {
  let url = `${BASE}/${caminho}`
  let body: string | undefined
  if (metodo === 'GET' && dados) url += '?' + new URLSearchParams(dados as Record<string, string>).toString()
  else if (dados) body = JSON.stringify(dados)
  let resposta: Response
  try {
    resposta = await fetch(url, {
      method: metodo, body, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  } catch {
    throw new ErroMeta('sem resposta da Meta', 0, null)
  }
  const json = await resposta.json().catch(() => ({})) as Record<string, unknown>
  if (!resposta.ok) {
    const erro = (json.error ?? {}) as { message?: unknown; code?: unknown }
    const texto = String(erro.message ?? `HTTP ${resposta.status}`).split(token).join('[token]')
    throw new ErroMeta(texto, resposta.status, typeof erro.code === 'number' ? erro.code : null)
  }
  return json
}

/** A conta profissional do Instagram que o token alcança. Erro se não for exatamente uma. */
export async function contaInstagram(token: string): Promise<{ id: string; username: string }> {
  const r = await chamar('GET', 'me/assigned_instagram_accounts', token, { fields: 'id,username' })
  const contas = (Array.isArray(r.data) ? r.data : []) as { id: string; username: string }[]
  if (contas.length !== 1) throw new ErroMeta(`o token alcança ${contas.length} conta(s) do Instagram; esperava exatamente uma`, 200, null)
  return { id: String(contas[0].id), username: String(contas[0].username ?? '') }
}

/** Cria o contêiner de um story de vídeo. A Meta baixa o arquivo de `videoUrl`. */
export async function criarConteinerStory(igId: string, videoUrl: string, token: string): Promise<string> {
  const r = await chamar('POST', `${soDigitos(igId)}/media`, token, { media_type: 'STORIES', video_url: videoUrl })
  return String(r.id)
}

export async function estadoDoConteiner(conteinerId: string, token: string): Promise<EstadoConteiner> {
  const r = await chamar('GET', soDigitos(conteinerId), token, { fields: 'status_code' })
  return String(r.status_code) as EstadoConteiner
}

/** Publica o contêiner pronto e devolve o id da mídia. */
export async function publicarConteiner(igId: string, conteinerId: string, token: string): Promise<string> {
  const r = await chamar('POST', `${soDigitos(igId)}/media_publish`, token, { creation_id: soDigitos(conteinerId) })
  return String(r.id)
}

/** Link público da mídia; null se a Meta não der (não é motivo para falhar a publicação). */
export async function linkDaMidia(midiaId: string, token: string): Promise<string | null> {
  try {
    const r = await chamar('GET', soDigitos(midiaId), token, { fields: 'permalink' })
    return typeof r.permalink === 'string' ? r.permalink : null
  } catch {
    return null
  }
}

/** Texto para mostrar ao Daniel quando a publicação falha. */
export function mensagemParaTela(e: unknown): string {
  if (e instanceof ErroMeta) {
    if (e.codigo === 190 || e.status === 401 || e.status === 403) return 'O Instagram recusou o acesso. O token precisa ser trocado.'
    return ('O Instagram recusou: ' + e.message).slice(0, 220)
  }
  return 'Erro inesperado ao publicar.'
}

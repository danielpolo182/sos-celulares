// src/lib/whatsapp/send.ts
export const META_API = 'https://graph.facebook.com/v26.0'
export const YCLOUD_API = 'https://api.ycloud.com/v2'

export type WaConfigMeta = {
  provedor?: 'meta'
  phone_number_id: string
  access_token: string
}

/** Parceiro usado na coexistência: o número continua no aplicativo WhatsApp Business. */
export type WaConfigYCloud = {
  provedor: 'ycloud'
  ycloud_api_key: string
  /**
   * Número da loja como a YCloud o registrou, ex.: +554192550123. Com o nono
   * dígito a mais o envio é recusado (WHATSAPP_PHONE_NUMBER_UNAVAILABLE).
   */
  ycloud_numero: string
}

export type WaConfig = WaConfigMeta | WaConfigYCloud

type LinhaWaConfig = {
  provedor?: string | null
  phone_number_id?: string | null
  access_token?: string | null
  ycloud_api_key?: string | null
  ycloud_numero?: string | null
}

/** Monta a configuração de envio a partir da linha de wa_config; null se faltar credencial do provedor escolhido. */
export function configDeEnvio(linha: LinhaWaConfig | null | undefined): WaConfig | null {
  if (!linha) return null
  if (linha.provedor === 'ycloud') {
    if (!linha.ycloud_api_key || !linha.ycloud_numero) return null
    return { provedor: 'ycloud', ycloud_api_key: linha.ycloud_api_key, ycloud_numero: linha.ycloud_numero }
  }
  if (!linha.phone_number_id || !linha.access_token) return null
  return { provedor: 'meta', phone_number_id: linha.phone_number_id, access_token: linha.access_token }
}

/** Colunas de wa_config que configDeEnvio precisa. */
export const COLUNAS_ENVIO = 'provedor, phone_number_id, access_token, ycloud_api_key, ycloud_numero'

/**
 * O WhatsApp identifica celulares de boa parte do Brasil sem o nono dígito
 * (55 + DDD + 8 dígitos), e é assim que o número chega no webhook. A Meta
 * aceita os dois formatos no envio, mas a lista de destinatários do número de
 * teste só casa com o formato completo; por isso o 9 é recolocado.
 * Fixos (assinante começando em 2 a 5) e números de outros países não mudam.
 */
export function normalizarDestino(to: string): string {
  const digitos = to.replace(/\D/g, '')
  if (digitos.length === 12 && digitos.startsWith('55') && /[6-9]/.test(digitos[4])) {
    return `${digitos.slice(0, 4)}9${digitos.slice(4)}`
  }
  return digitos
}

/**
 * As duas formas em que um celular brasileiro pode estar gravado, com e sem o
 * nono dígito: o cadastro do cliente costuma ter o 9 e o id do WhatsApp, não.
 */
export function variantesDeTelefone(telefone: string): string[] {
  const d = telefone.replace(/\D/g, '')
  if (!d.startsWith('55')) return [d]
  if (d.length === 13 && d[4] === '9') return [d, `${d.slice(0, 4)}${d.slice(5)}`]
  if (d.length === 12 && /[6-9]/.test(d[4])) return [d, `${d.slice(0, 4)}9${d.slice(4)}`]
  return [d]
}

type CorpoMensagem =
  | { type: 'text'; text: { body: string } }
  | { type: 'template'; template: { name: string; language: { code: string }; components: unknown[] } }
  | { type: 'video'; video: { link: string; caption?: string } }
  | { type: 'image'; image: { link: string; caption?: string } }
  | { type: 'document'; document: { link: string; caption?: string; filename?: string } }

// Os dois provedores respondem 200 assim que aceitam a mensagem; a entrega (ou a
// falha) chega depois, pelo webhook, identificada pelo id devolvido aqui.
async function enviar(config: WaConfig, to: string, corpo: CorpoMensagem, rotulo: string): Promise<string[]> {
  const destino = normalizarDestino(to)

  const res = config.provedor === 'ycloud'
    ? await fetch(`${YCLOUD_API}/whatsapp/messages/sendDirectly`, {
        method: 'POST',
        headers: { 'X-API-Key': config.ycloud_api_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.ycloud_numero, to: `+${destino}`, ...corpo }),
      })
    : await fetch(`${META_API}/${config.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, ...corpo }),
      })

  if (!res.ok) {
    const err = await res.text()
    console.error(`[WA ${rotulo}]`, err)
    throw new Error(`Erro do provedor: ${err}`)
  }

  const json = (await res.json().catch(() => null)) as { id?: string; wamid?: string; messages?: { id?: string }[] } | null
  // YCloud devolve o id dela na raiz (e o do WhatsApp em wamid, quando já existe); a Meta, em messages[0].id
  return [json?.id, json?.wamid, json?.messages?.[0]?.id].filter((v): v is string => !!v)
}

export async function sendMessage(config: WaConfig, to: string, text: string): Promise<string | null> {
  return (await sendMessageIds(config, to, text))[0] ?? null
}

/**
 * Como sendMessage, devolvendo todos os identificadores da mensagem: quem
 * responde citando-a informa o id do WhatsApp, que nem sempre é o primeiro.
 */
export async function sendMessageIds(config: WaConfig, to: string, text: string): Promise<string[]> {
  return enviar(config, to, { type: 'text', text: { body: text } }, 'sendMessage')
}

export async function sendTemplate(
  config: WaConfig,
  to: string,
  templateName: string,
  params: string[],
  languageCode = 'pt_BR'
): Promise<string | null> {
  return (await sendTemplateIds(config, to, templateName, params, languageCode))[0] ?? null
}

export async function sendTemplateIds(
  config: WaConfig,
  to: string,
  templateName: string,
  params: string[],
  languageCode = 'pt_BR'
): Promise<string[]> {
  const components =
    params.length > 0
      ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }]
      : []

  return enviar(
    config,
    to,
    { type: 'template', template: { name: templateName, language: { code: languageCode }, components } },
    'sendTemplate'
  )
}

export type TipoMidia = 'video' | 'image' | 'document'

/**
 * Envia um arquivo por link (o provedor baixa na hora, então um link assinado
 * de curta duração serve). Como texto livre, só passa dentro da janela de 24h.
 */
export async function sendMedia(
  config: WaConfig,
  to: string,
  tipo: TipoMidia,
  link: string,
  legenda?: string | null,
  nomeDoArquivo?: string | null
): Promise<string | null> {
  const caption = legenda?.trim() || undefined
  const corpo: CorpoMensagem =
    tipo === 'video' ? { type: 'video', video: { link, caption } }
      : tipo === 'image' ? { type: 'image', image: { link, caption } }
      : { type: 'document', document: { link, caption, filename: nomeDoArquivo ?? undefined } }
  return (await enviar(config, to, corpo, 'sendMedia'))[0] ?? null
}

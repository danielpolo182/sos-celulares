// src/lib/whatsapp/send.ts
export const META_API = 'https://graph.facebook.com/v26.0'

export type WaConfig = {
  phone_number_id: string
  access_token: string
}

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

// A Meta responde 200 assim que aceita a mensagem; a entrega (ou a falha) chega
// depois, pelo webhook, identificada por este id.
async function idDaMensagem(res: Response): Promise<string | null> {
  const json = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null
  return json?.messages?.[0]?.id ?? null
}

export async function sendMessage(config: WaConfig, to: string, text: string): Promise<string | null> {
  const res = await fetch(`${META_API}/${config.phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizarDestino(to),
      type: 'text',
      text: { body: text },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[WA sendMessage]', err)
    throw new Error(`Meta API error: ${err}`)
  }
  return idDaMensagem(res)
}

export async function sendTemplate(
  config: WaConfig,
  to: string,
  templateName: string,
  params: string[],
  languageCode = 'pt_BR'
): Promise<string | null> {
  const components =
    params.length > 0
      ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }]
      : []

  const res = await fetch(`${META_API}/${config.phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizarDestino(to),
      type: 'template',
      template: { name: templateName, language: { code: languageCode }, components },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[WA sendTemplate]', err)
    throw new Error(`Meta API error: ${err}`)
  }
  return idDaMensagem(res)
}

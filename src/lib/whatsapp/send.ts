// src/lib/whatsapp/send.ts
const META_API = 'https://graph.facebook.com/v19.0'

export type WaConfig = {
  phone_number_id: string
  access_token: string
}

export async function sendMessage(config: WaConfig, to: string, text: string): Promise<void> {
  const res = await fetch(`${META_API}/${config.phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[WA sendMessage]', err)
    throw new Error(`Meta API error: ${err}`)
  }
}

export async function sendTemplate(
  config: WaConfig,
  to: string,
  templateName: string,
  params: string[],
  languageCode = 'pt_BR'
): Promise<void> {
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
      to,
      type: 'template',
      template: { name: templateName, language: { code: languageCode }, components },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[WA sendTemplate]', err)
    throw new Error(`Meta API error: ${err}`)
  }
}

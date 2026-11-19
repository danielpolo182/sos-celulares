// src/lib/whatsapp/ycloud.ts
import crypto from 'crypto'

// Diferença máxima aceita entre o horário da assinatura e o do servidor
const TOLERANCIA_SEGUNDOS = 300

/**
 * Confere o cabeçalho YCloud-Signature de um evento de webhook.
 * Formato: "t=<segundos>,s=<hmac hex>"; o HMAC-SHA256, com o segredo do
 * endpoint, cobre "<t>.<corpo bruto>". `agora` existe para os testes.
 */
export function assinaturaYCloudValida(
  cabecalho: string,
  corpoBruto: string,
  segredo: string,
  agora: number = Date.now()
): boolean {
  const partes = new Map(
    cabecalho.split(',').map(p => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as [string, string]
    })
  )
  const t = partes.get('t')
  const s = partes.get('s')
  if (!t || !s || !/^\d+$/.test(t)) return false
  if (Math.abs(agora / 1000 - Number(t)) > TOLERANCIA_SEGUNDOS) return false

  const esperado = Buffer.from(crypto.createHmac('sha256', segredo).update(`${t}.${corpoBruto}`).digest('hex'))
  const recebido = Buffer.from(s)
  return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado)
}

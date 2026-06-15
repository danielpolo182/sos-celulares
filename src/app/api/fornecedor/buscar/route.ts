import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BOT_BASE = 'https://bot.gestorv3.com/api/v1'
const BOT_ID   = 'iplay-cwb-web'

export interface ProdutoFornecedor {
  codigo: string
  nome: string
  preco: number
}

function getText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) return (n.children as unknown[]).map(getText).join('')
  return ''
}

function parseProducts(messages: unknown[]): ProdutoFornecedor[] {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const msg = messages[0] as Record<string, unknown>
  const richText = (msg?.content as Record<string, unknown>)?.richText
  if (!Array.isArray(richText)) return []

  const varBlock = richText.find((b: unknown) => (b as Record<string, unknown>).type === 'variable')
  if (!varBlock) return []

  const fullText = getText(varBlock)

  const produtos: ProdutoFornecedor[] = []
  const regex = /\d+\s*-\s*(\d+)\s*-\s*(.+?)\s*-\s*\[R\$\s*([\d,.]+)\]/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(fullText)) !== null) {
    produtos.push({
      codigo: m[1].trim(),
      nome: m[2].trim(),
      preco: parseFloat(m[3].replace('.', '').replace(',', '.')),
    })
  }
  return produtos
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query: string }
    if (!query?.trim()) return NextResponse.json({ error: 'query obrigatória' }, { status: 400 })

    // 1. Inicia sessão
    const startRes = await fetch(`${BOT_BASE}/typebots/${BOT_ID}/startChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const startText = await startRes.text()
    if (!startRes.ok) {
      return NextResponse.json({ error: `startChat falhou: ${startRes.status} — ${startText.slice(0, 300)}` }, { status: 502 })
    }

    let startData: { sessionId?: string; messages?: unknown[] }
    try { startData = JSON.parse(startText) } catch { return NextResponse.json({ error: `startChat resposta inválida: ${startText.slice(0, 300)}` }, { status: 502 }) }

    const sessionId = startData.sessionId
    if (!sessionId) return NextResponse.json({ error: `sessionId ausente. Resposta: ${startText.slice(0, 400)}` }, { status: 502 })

    // 2. Envia a busca
    const chatRes = await fetch(`${BOT_BASE}/sessions/${sessionId}/continueChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: query.trim() }),
    })

    if (!chatRes.ok) {
      return NextResponse.json({ error: `continueChat falhou: ${chatRes.status}` }, { status: 502 })
    }

    const chatData = await chatRes.json() as { messages?: unknown[] }
    const produtos = parseProducts(chatData.messages ?? [])

    return NextResponse.json({ produtos, total: produtos.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

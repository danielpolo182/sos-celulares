import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Loja Fix Cell Parts — plataforma Tray Commerce.
// A busca é um GET simples que devolve HTML; fazemos scraping dos produtos.
const BUSCA_URL = 'https://www.fixcellparts.com.br/loja/busca.php'
const LOJA_ID = '1183835'

export interface ProdutoFixcell {
  nome: string
  preco: number
  url: string
}

function decode(s: string): string {
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

function parseProducts(html: string): ProdutoFixcell[] {
  const produtos: ProdutoFixcell[] = []
  // Cada produto: <a class="product-info" href="URL"> ... <div class="product-name">NOME</div>
  // ... <span class="current-price"> R$ 79,00 </span>
  const regex = /<a class="product-info" href="([^"]+)"[\s\S]*?<div class="product-name">\s*([^<]+?)\s*<\/div>[\s\S]*?<span class="current-price">\s*R\$\s*([\d.,]+)\s*<\/span>/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) {
    const preco = parseFloat(m[3].replace(/\./g, '').replace(',', '.'))
    if (!isNaN(preco)) {
      produtos.push({ url: m[1], nome: decode(m[2]), preco })
    }
  }
  return produtos
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query: string }
    if (!query?.trim()) return NextResponse.json({ error: 'query obrigatória' }, { status: 400 })

    const url = `${BUSCA_URL}?loja=${LOJA_ID}&palavra_busca=${encodeURIComponent(query.trim())}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `busca falhou: ${res.status}` }, { status: 502 })
    }

    const html = await res.text()
    const produtos = parseProducts(html)

    return NextResponse.json({ produtos, total: produtos.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

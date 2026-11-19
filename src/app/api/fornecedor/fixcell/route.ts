import { NextRequest, NextResponse } from 'next/server'
import { buscarFixcell, guardarPecas } from '@/lib/fornecedores'

export const dynamic = 'force-dynamic'

export interface ProdutoFixcell {
  nome: string
  preco: number
  url: string
}

// Busca livre na loja da Fix Cell Parts (tela de OS)
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query: string }
    if (!query?.trim()) return NextResponse.json({ error: 'query obrigatória' }, { status: 400 })

    const pecas = await buscarFixcell(query)
    await guardarPecas(pecas, query.trim().toLowerCase())

    const produtos: ProdutoFixcell[] = pecas.map(p => ({ nome: p.nome, preco: p.preco, url: p.url ?? '' }))
    return NextResponse.json({ produtos, total: produtos.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}

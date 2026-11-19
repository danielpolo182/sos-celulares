import { NextRequest, NextResponse } from 'next/server'
import { buscarIPlay, guardarPecas } from '@/lib/fornecedores'

export const dynamic = 'force-dynamic'

export interface ProdutoFornecedor {
  codigo: string
  nome: string
  preco: number
}

// Busca livre no catálogo da iPlay (tela de OS e recondicionamento)
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query: string }
    if (!query?.trim()) return NextResponse.json({ error: 'query obrigatória' }, { status: 400 })

    const pecas = await buscarIPlay(query)
    await guardarPecas(pecas, query.trim().toLowerCase())

    const produtos: ProdutoFornecedor[] = pecas.map(p => ({ codigo: p.codigo ?? '', nome: p.nome, preco: p.preco }))
    return NextResponse.json({ produtos, total: produtos.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}

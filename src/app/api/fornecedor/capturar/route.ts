// src/app/api/fornecedor/capturar/route.ts
// Um passo da captura do catálogo dos fornecedores. A tela chama esta rota
// repetidamente, com intervalo entre as chamadas, para não pesar no site deles.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  TIPOS_DE_PECA, TipoPeca, buscarFixcellPagina, buscarIPlay, consultaParaModelo, guardarPecas,
} from '@/lib/fornecedores'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Pedido =
  | { fornecedor: 'fixcell'; pagina: number }
  | { fornecedor: 'iplay'; modelo: string; tipo: TipoPeca }

const SEM_TABELA = 'A tabela de peças ainda não existe. Rode o arquivo supabase-whatsapp-agente-migration.sql no banco.'

// 409 faz a tela parar a captura: repetir não resolve um problema de banco
function falhaAoGravar(gravacao: { erro: string; tabelaAusente: boolean }) {
  return NextResponse.json(
    { error: gravacao.tabelaAusente ? SEM_TABELA : `Não consegui gravar as peças no banco: ${gravacao.erro}` },
    { status: 409 }
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const pedido = await req.json() as Pedido

  try {
    if (pedido.fornecedor === 'fixcell') {
      const pagina = Math.max(1, Math.floor(Number(pedido.pagina) || 1))
      // Busca vazia: a loja devolve todos os produtos, paginados
      const { pecas, ultimaPagina } = await buscarFixcellPagina('', pagina)
      const gravacao = await guardarPecas(pecas, 'catálogo completo')
      if (!gravacao.ok) return falhaAoGravar(gravacao)
      return NextResponse.json({ encontradas: pecas.length, ultimaPagina })
    }

    if (pedido.fornecedor === 'iplay') {
      if (!pedido.modelo?.trim() || !TIPOS_DE_PECA.includes(pedido.tipo)) {
        return NextResponse.json({ error: 'modelo e tipo são obrigatórios' }, { status: 400 })
      }
      const consulta = consultaParaModelo('iplay', pedido.modelo, pedido.tipo)
      const pecas = await buscarIPlay(consulta)
      const gravacao = await guardarPecas(pecas, consulta)
      if (!gravacao.ok) return falhaAoGravar(gravacao)
      return NextResponse.json({ encontradas: pecas.length, consulta })
    }

    return NextResponse.json({ error: 'fornecedor inválido' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}

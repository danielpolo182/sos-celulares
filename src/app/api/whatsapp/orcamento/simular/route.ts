// src/app/api/whatsapp/orcamento/simular/route.ts
// Mostra ao dono da loja o orçamento que o agente daria para um aparelho, com
// as regras que estão na tela (mesmo antes de salvar) e os custos por trás.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TIPOS_DE_PECA, TipoPeca } from '@/lib/fornecedores'
import { montarOrcamento } from '@/lib/whatsapp/orcamento'
import { lerConfigPrecos } from '@/lib/whatsapp/precoRegras'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const corpo = await req.json().catch(() => null) as { modelo?: string; servico?: string; precos?: unknown } | null
  const modelo = String(corpo?.modelo ?? '').trim().slice(0, 80)
  const servico = corpo?.servico as TipoPeca
  if (modelo.length < 2 || !TIPOS_DE_PECA.includes(servico)) {
    return NextResponse.json({ error: 'Informe o aparelho e o serviço.' }, { status: 400 })
  }

  try {
    const o = await montarOrcamento(modelo, servico, lerConfigPrecos(corpo?.precos))
    return NextResponse.json({
      modelo: o.modelo,
      servico: o.servico,
      opcoes: o.opcoes.map(x => ({ rotulo: x.rotulo, preco: x.preco, custo: x.custo, custos: x.pecas.map(p => p.preco) })),
      deFora: o.deFora,
      falhas: o.falhas,
    })
  } catch (e) {
    console.error('[orcamento] simulação', e)
    return NextResponse.json({ error: 'A consulta aos fornecedores falhou. Tente de novo em instantes.' }, { status: 502 })
  }
}

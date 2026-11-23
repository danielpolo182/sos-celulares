// src/app/api/bancada/route.ts
// Tela da bancada: o técnico digita o número da OS e escolhe "Em andamento" ou
// "Pronta". A rota confere a OS, muda o status e dispara o aviso ao cliente.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notificarEventoOS } from '@/lib/whatsapp/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ACOES = {
  em_andamento: { evento: 'andamento', rotulo: 'Em andamento' },
  pronta: { evento: 'pronta', rotulo: 'Pronta' },
} as const
type Acao = keyof typeof ACOES

const NOME_DO_STATUS: Record<string, string> = {
  aberta: 'Aberta', aguardando_diagnostico: 'Aguardando diagnóstico', em_orcamento: 'Em orçamento',
  aguardando_aprovacao_cliente: 'Aguardando aprovação', em_andamento: 'Em andamento', em_reparo: 'Em reparo',
  aguardando_peca: 'Aguardando peça', aguardando: 'Aguardando', pronta: 'Pronta', entregue: 'Entregue', cancelada: 'Cancelada',
}

// Na tela aparece só o final do número, o bastante para o técnico conferir
const finalDoTelefone = (telefone: string | null | undefined) => {
  const d = String(telefone ?? '').replace(/\D/g, '')
  return d.length >= 8 ? `final ${d.slice(-4)}` : ''
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Faça login no OctaOS neste aparelho.' }, { status: 401 })

  const corpo = await req.json().catch(() => null) as { numero?: unknown; status?: unknown; confirmar?: unknown } | null
  const numero = Number(String(corpo?.numero ?? '').replace(/\D/g, ''))
  const acao = corpo?.status as Acao
  if (!Number.isInteger(numero) || numero <= 0 || !(acao in ACOES)) {
    return NextResponse.json({ error: 'Digite o número da OS.' }, { status: 400 })
  }

  // A sessão só enxerga as ordens da própria loja
  const { data: os, error } = await supabase
    .from('ordens_servico')
    .select('id, numero, status, marca, modelo, clientes(nome, telefone)')
    .eq('numero', numero)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Não consegui consultar as ordens de serviço.' }, { status: 500 })
  if (!os) return NextResponse.json({ error: `Não existe OS nº ${numero}.` }, { status: 404 })

  const cliente = Array.isArray(os.clientes) ? os.clientes[0] : os.clientes
  const resumo = {
    numero: os.numero as number,
    cliente: (cliente?.nome as string | null) ?? 'sem cliente cadastrado',
    telefone: finalDoTelefone(cliente?.telefone as string | null),
    aparelho: String(os.modelo ?? '').trim() || String(os.marca ?? '').trim() || 'aparelho sem modelo cadastrado',
    statusAtual: NOME_DO_STATUS[os.status as string] ?? String(os.status),
  }

  if (os.status === 'entregue' || os.status === 'cancelada') {
    return NextResponse.json({ error: `A OS nº ${numero} já está como "${resumo.statusAtual}". Confira o número.`, os: resumo }, { status: 409 })
  }

  // Primeiro Enter: só mostra de quem é a OS, para o técnico conferir antes de avisar o cliente
  if (corpo?.confirmar !== true) return NextResponse.json({ os: resumo, confirmar: true })

  const { error: erroStatus } = await supabase
    .from('ordens_servico')
    .update({ status: acao, updated_at: new Date().toISOString() })
    .eq('id', os.id)
  if (erroStatus) return NextResponse.json({ error: `Não consegui mudar o status: ${erroStatus.message}`, os: resumo }, { status: 500 })

  let aviso: Awaited<ReturnType<typeof notificarEventoOS>>
  try {
    // Quem digitou aqui quer o aviso: vale mesmo com o aviso automático desligado nas Configurações
    aviso = await notificarEventoOS(os.id as string, ACOES[acao].evento, { forcar: true })
  } catch (e) {
    aviso = { resultado: 'falhou', erro: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json({ os: { ...resumo, statusAtual: ACOES[acao].rotulo }, feito: true, aviso })
}

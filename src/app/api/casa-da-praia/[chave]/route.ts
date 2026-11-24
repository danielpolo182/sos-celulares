// TEMPORÁRIO — votação da família para a casa de praia do Réveillon 2026/27.
// A página estática fica em public/casa-da-praia/ e não exige login; esta rota
// guarda um voto por pessoa. Para remover tudo depois: apagar esta pasta, a
// pasta public/casa-da-praia, a liberação no middleware e rodar no banco
//   delete from events where type = 'CASA_PRAIA_VOTO';
import { NextRequest, NextResponse } from 'next/server'
import { clienteDeServico } from '@/lib/whatsapp/notify'

export const dynamic = 'force-dynamic'

// O endereço da página traz este código; sem ele a rota não responde
const CHAVE = 'rv27-09fvecf'
const TIPO = 'CASA_PRAIA_VOTO'
const CASAS = ['g199', 'g133', 'g145', 'g195', 'g178', 'g192', 'a1', 'a2']
const MAX_PESSOAS = 60

const slug = (n: string) => n.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'anon'
const negado = () => NextResponse.json({ error: 'not found' }, { status: 404 })

type Voto = { name: string; votes: Record<string, number>; final: string | null; at: string }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ chave: string }> }) {
  if ((await params).chave !== CHAVE) return negado()
  const { data, error } = await clienteDeServico().from('events').select('payload').eq('type', TIPO).order('created_at', { ascending: true }).limit(500)
  if (error) return NextResponse.json({ error: 'falha ao ler os votos' }, { status: 500 })
  // Um voto por pessoa: o mais recente substitui o anterior
  const porPessoa = new Map<string, Voto>()
  for (const linha of data ?? []) {
    const v = linha.payload as Voto | null
    if (v && typeof v.name === 'string' && v.votes) porPessoa.set(slug(v.name), v)
  }
  return NextResponse.json({ votos: [...porPessoa.values()] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ chave: string }> }) {
  if ((await params).chave !== CHAVE) return negado()
  const corpo = await req.json().catch(() => null) as { name?: unknown; votes?: unknown; final?: unknown } | null
  const name = String(corpo?.name ?? '').replace(/[|\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  if (!name || !corpo?.votes || typeof corpo.votes !== 'object') return NextResponse.json({ error: 'voto inválido' }, { status: 400 })

  const votes: Record<string, number> = {}
  for (const id of CASAS) {
    const v = (corpo.votes as Record<string, unknown>)[id]
    if (v === 1 || v === 0) votes[id] = v
  }
  const final = typeof corpo.final === 'string' && CASAS.includes(corpo.final) ? corpo.final : null
  const voto: Voto = { name, votes, final, at: new Date().toISOString() }

  const supabase = clienteDeServico()
  const chaveDaPessoa = `praia:${slug(name)}`
  const { data: existentes } = await supabase.from('events').select('entity').eq('type', TIPO).limit(1000)
  const pessoas = new Set((existentes ?? []).map(e => e.entity as string))
  if (!pessoas.has(chaveDaPessoa) && pessoas.size >= MAX_PESSOAS) return NextResponse.json({ error: 'limite de pessoas atingido' }, { status: 429 })

  await supabase.from('events').delete().eq('type', TIPO).eq('entity', chaveDaPessoa)
  const { error } = await supabase.from('events').insert({ type: TIPO, entity: chaveDaPessoa, payload: voto, processado: true })
  if (error) return NextResponse.json({ error: 'falha ao gravar o voto' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ chave: string }> }) {
  if ((await params).chave !== CHAVE) return negado()
  const pessoa = slug(String(req.nextUrl.searchParams.get('slug') ?? ''))
  const { error } = await clienteDeServico().from('events').delete().eq('type', TIPO).eq('entity', `praia:${pessoa}`)
  if (error) return NextResponse.json({ error: 'falha ao remover' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

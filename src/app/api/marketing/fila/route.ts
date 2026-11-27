// src/app/api/marketing/fila/route.ts
// Fila de aprovação de publicações: lista os itens da loja e aplica as ações da página /aprovacoes.
// Só responde para usuário logado cuja loja tem a fila ligada (linha em marketing_config).
// Toda mudança de situação passa por aqui e confere a situação atual antes de mudar.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clienteDeServico } from '@/lib/whatsapp/notify'
import { distribuir, HORARIOS_PADRAO } from '@/lib/marketing/grade'
import { publicarItem, type Resultado } from '@/lib/marketing/publicar'
import { depsReais, BALDE } from '@/lib/marketing/publicar-deps'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const COLUNAS = 'id, titulo, situacao, dados, agendado_para, publicado_em, ig_link, erro, video_path, quadro_path, criado_em'
const ASSINATURA_TELA_S = 3600
const ATRASO_MS = 10 * 60_000
const ACOES = ['aprovar', 'descartar', 'publicar_agora', 'cancelar', 'tentar_de_novo'] as const
type Acao = typeof ACOES[number]
type Linha = {
  id: string; titulo: string; situacao: string; dados: unknown; agendado_para: string | null; publicado_em: string | null
  ig_link: string | null; erro: string | null; video_path: string | null; quadro_path: string | null; criado_em: string
}

/** Sessão + loja com a fila ligada. Devolve a resposta de erro quando não passa. */
async function portao() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Faça login no OctaOS.' }, { status: 401 }) }
  // A política de loja filtra: só vem a linha da loja do usuário. Tabela inexistente também cai aqui.
  const { data: config, error } = await supabase.from('marketing_config').select('filial_id, horarios').limit(1).maybeSingle()
  if (error || !config) return { erro: NextResponse.json({ error: 'A fila não está ligada para esta loja.' }, { status: 404 }) }
  const horarios = Array.isArray(config.horarios) && config.horarios.length ? config.horarios as string[] : HORARIOS_PADRAO
  return { supabase, user, horarios }
}

export async function GET(req: NextRequest) {
  const p = await portao()
  if (p.erro) return p.erro
  const { supabase } = p
  const aba = req.nextUrl.searchParams.get('aba') ?? 'aprovar'

  let consulta = supabase.from('marketing_fila').select(COLUNAS).limit(60)
  if (aba === 'agendados') consulta = consulta.in('situacao', ['aprovado', 'publicando']).order('agendado_para', { ascending: true })
  else if (aba === 'publicados') {
    consulta = consulta.eq('situacao', 'publicado').gte('publicado_em', new Date(Date.now() - 7 * 86_400_000).toISOString())
      .order('publicado_em', { ascending: false })
  } else consulta = consulta.in('situacao', ['pendente', 'falhou']).order('criado_em', { ascending: false })

  const [{ data, error }, { count }] = await Promise.all([
    consulta,
    supabase.from('marketing_fila').select('id', { count: 'exact', head: true }).in('situacao', ['pendente', 'falhou']),
  ])
  if (error) return NextResponse.json({ error: 'Não consegui ler a fila.' }, { status: 500 })
  const linhas = (data ?? []) as Linha[]

  // Endereços assinados só para os arquivos de itens que a sessão enxergou
  const caminhos = linhas.flatMap(l => [l.video_path, l.quadro_path]).filter((c): c is string => !!c)
  const assinados = new Map<string, string>()
  if (caminhos.length) {
    const { data: urls } = await clienteDeServico().storage.from(BALDE).createSignedUrls(caminhos, ASSINATURA_TELA_S)
    for (const u of urls ?? []) if (u.path && u.signedUrl) assinados.set(u.path, u.signedUrl)
  }

  const agora = Date.now()
  const itens = linhas.map(l => ({
    id: l.id, titulo: l.titulo, situacao: l.situacao, dados: l.dados, agendado_para: l.agendado_para,
    publicado_em: l.publicado_em, ig_link: l.ig_link, erro: l.erro,
    atrasado: l.situacao === 'aprovado' && !!l.agendado_para && agora - new Date(l.agendado_para).getTime() > ATRASO_MS,
    video_url: l.video_path ? assinados.get(l.video_path) ?? null : null,
    quadro_url: l.quadro_path ? assinados.get(l.quadro_path) ?? null : null,
  }))
  return NextResponse.json({ itens, pendentes: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const p = await portao()
  if (p.erro) return p.erro
  const { supabase, user, horarios } = p

  const corpo = await req.json().catch(() => null) as { acao?: unknown; ids?: unknown } | null
  const acao = ACOES.find(a => a === corpo?.acao) as Acao | undefined
  const ids = Array.isArray(corpo?.ids) ? [...new Set(corpo!.ids.filter((x): x is string => typeof x === 'string'))].slice(0, 50) : []
  if (!acao || !ids.length) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  if (acao === 'publicar_agora' && ids.length !== 1) return NextResponse.json({ error: 'Publique um item de cada vez.' }, { status: 400 })

  const token = process.env.INSTAGRAM_TOKEN
  if (acao === 'publicar_agora' && !token) {
    return NextResponse.json({ error: 'O token do Instagram não está configurado no servidor.' }, { status: 503 })
  }

  // Lidos pela sessão: item de outra loja simplesmente não vem
  const { data, error } = await supabase.from('marketing_fila').select(COLUNAS).in('id', ids).order('criado_em', { ascending: true })
  if (error) return NextResponse.json({ error: 'Não consegui ler a fila.' }, { status: 500 })
  const linhas = (data ?? []) as Linha[]

  const EXIGE: Record<Acao, string[]> = {
    aprovar: ['pendente'], descartar: ['pendente', 'falhou'], publicar_agora: ['pendente', 'falhou', 'aprovado'],
    cancelar: ['aprovado'], tentar_de_novo: ['falhou'],
  }
  const recusados: { id: string; motivo: string }[] = ids.filter(id => !linhas.some(l => l.id === id)).map(id => ({ id, motivo: 'Item não encontrado.' }))
  const aptos = linhas.filter(l => {
    if (EXIGE[acao].includes(l.situacao)) return true
    recusados.push({ id: l.id, motivo: `"${l.titulo}" está como ${l.situacao}; a ação não se aplica.` })
    return false
  })

  const agora = new Date()
  const agoraIso = agora.toISOString()
  let horas: Date[] = []
  if (acao === 'aprovar' && aptos.length) {
    const { data: ocup } = await supabase.from('marketing_fila').select('agendado_para')
      .in('situacao', ['aprovado', 'publicando', 'publicado']).gte('agendado_para', new Date(agora.getTime() - 86_400_000).toISOString())
    const ocupados = (ocup ?? []).filter(o => o.agendado_para).map(o => new Date(o.agendado_para as string))
    horas = distribuir(agora, horarios, ocupados, aptos.length)
  }

  let feitos = 0
  let resultado: Resultado | undefined
  for (const [i, l] of aptos.entries()) {
    const campos: Record<string, unknown> =
      acao === 'aprovar' ? { situacao: 'aprovado', agendado_para: horas[i].toISOString(), aprovado_por: user.id, aprovado_em: agoraIso }
      : acao === 'descartar' ? { situacao: 'descartado', video_path: null, quadro_path: null, agendado_para: null }
      : acao === 'cancelar' ? { situacao: 'pendente', agendado_para: null }
      : { situacao: 'aprovado', agendado_para: agoraIso, tentativas: 0, erro: null, ig_container_id: null,
          ...(acao === 'publicar_agora' ? { aprovado_por: user.id, aprovado_em: agoraIso } : {}) }

    // A situação é conferida de novo na própria gravação: se o relógio pegou o item no meio, nada muda
    const { data: mudou, error: erroGravar } = await supabase.from('marketing_fila')
      .update({ ...campos, atualizado_em: agoraIso }).eq('id', l.id).in('situacao', EXIGE[acao]).select('id')
    if (erroGravar || !mudou?.length) {
      recusados.push({ id: l.id, motivo: `"${l.titulo}" mudou de situação agora há pouco. Atualize a página.` })
      continue
    }
    feitos++

    if (acao === 'descartar') {
      const caminhos = [l.video_path, l.quadro_path].filter((c): c is string => !!c)
      if (caminhos.length) await clienteDeServico().storage.from(BALDE).remove(caminhos)
    }
    if (acao === 'publicar_agora') {
      try {
        resultado = await publicarItem(depsReais(clienteDeServico(), token!), l.id)
      } catch (e) {
        console.error('[fila] publicar agora falhou:', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: 'Não consegui publicar agora. O item continua aprovado e o relógio vai tentar.' }, { status: 500 })
      }
    }
  }
  return NextResponse.json({ ok: true, feitos, recusados, resultado })
}

// src/app/api/whatsapp/lembretes/route.ts
// Rotina diária (Vercel Cron): lembretes e último aviso das OS prontas e não retiradas.
import { NextRequest, NextResponse } from 'next/server'
import { buscarConfigEnvio } from '@/lib/whatsapp/config'
import { avisoDeRetiradaDevido, lerConfigAvisos } from '@/lib/whatsapp/avisos'
import {
  COLUNAS_OS_AVISO, OsParaAviso, carregarInfoLoja, clienteDeServico, enviarAvisoOS,
} from '@/lib/whatsapp/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIA_MS = 86_400_000
// O que não couber numa execução sai na do dia seguinte
const LIMITE_POR_EXECUCAO = 40
const TEMPO_MAXIMO_MS = 45_000

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const inicio = Date.now()
  const supabase = clienteDeServico()

  const { data: filiais, error } = await supabase.from('wa_config').select('filial_id, avisos')
  if (error) return NextResponse.json({ ok: true, aviso: 'migração dos avisos ainda não foi rodada' })

  const resumo = { enviados: 0, falhas: 0, semTelefone: 0 }

  for (const filial of filiais ?? []) {
    const config = lerConfigAvisos(filial.avisos)
    if (!config.lembrete && !config.ultimo_aviso) continue

    const envio = await buscarConfigEnvio(supabase, filial.filial_id)
    if (!envio) continue
    // Cada loja tem o seu horário, prazo e taxa de retirada
    const loja = await carregarInfoLoja(supabase, filial.filial_id)

    const menorPrazo = Math.min(...config.lembrete_dias, config.ultimo_aviso_dias)
    // Só entram OS com pronta_em preenchido, ou seja, que ficaram prontas depois de os avisos existirem
    const { data: ordens, error: erroOs } = await supabase
      .from('ordens_servico')
      .select(COLUNAS_OS_AVISO)
      .eq('filial_id', filial.filial_id)
      .eq('status', 'pronta')
      .is('deleted_at', null)
      .not('pronta_em', 'is', null)
      .lte('pronta_em', new Date(inicio - menorPrazo * DIA_MS).toISOString())
      .order('pronta_em', { ascending: true })
      .limit(500)
    if (erroOs) { console.error('[WA lembretes] consulta', erroOs.message); continue }

    for (const os of (ordens ?? []) as unknown as OsParaAviso[]) {
      const total = resumo.enviados + resumo.falhas
      if (total >= LIMITE_POR_EXECUCAO || Date.now() - inicio > TEMPO_MAXIMO_MS) {
        return NextResponse.json({ ok: true, ...resumo, interrompido: true })
      }

      const dias = Math.floor((inicio - new Date(os.pronta_em as string).getTime()) / DIA_MS)
      const prazoDaOsVencido = inicio > new Date(os.created_at).getTime() + loja.prazoRetiradaDias * DIA_MS
      const devido = avisoDeRetiradaDevido(dias, config, os.wa_avisos ?? {}, prazoDaOsVencido)
      if (!devido) continue

      const resultado = await enviarAvisoOS({ supabase, envio, loja }, os, devido.aviso, devido.chave, devido.pular)
      if (resultado === 'enviado') resumo.enviados++
      else if (resultado === 'falhou') resumo.falhas++
      else resumo.semTelefone++
    }
  }

  console.log('[WA lembretes]', resumo)
  return NextResponse.json({ ok: true, ...resumo })
}

'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReportLayout, periodoToDates } from '../ReportLayout'

const STATUS_LABELS: Record<string,string> = { aberta:'Aberta', em_andamento:'Em andamento', pronta:'Pronta', entregue:'Entregue', cancelada:'Cancelada' }

export default function RelOS() {
  const supabase = createClient()
  const [periodo, setPeriodo] = useState('30d')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroModelo, setFiltroModelo] = useState('')
  const [dados, setDados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { inicio, fim } = periodoToDates(periodo, dataInicio, dataFim)
    let q = supabase.from('ordens_servico').select('id,numero,status,modelo,marca,defeito_relatado,valor_orcamento,valor_final,pago,forma_pagamento,created_at,entregue_em,clientes(nome,telefone)').is('deleted_at',null).gte('created_at', inicio+'T00:00:00').lte('created_at', fim+'T23:59:59').order('numero',{ascending:false})
    if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus)
    if (filtroModelo) q = q.ilike('modelo', `%${filtroModelo}%`)
    const { data } = await q.limit(200)
    setDados(data ?? [])
    setLoading(false)
  }, [supabase, periodo, dataInicio, dataFim, filtroStatus, filtroModelo])

  useEffect(() => { fetch() }, [fetch])

  const totalReceita = dados.filter(o => o.status === 'entregue').reduce((s:number, o:any) => s + (o.valor_final ?? o.valor_orcamento ?? 0), 0)
  const ticketMedio = dados.filter(o => o.status === 'entregue').length > 0 ? totalReceita / dados.filter(o => o.status === 'entregue').length : 0

  function exportCSV() {
    const rows = [['OS','Status','Modelo','Defeito','Valor','Pago','Data']]
    dados.forEach((o:any) => rows.push([o.numero, STATUS_LABELS[o.status]??o.status, o.modelo??'', o.defeito_relatado, o.valor_final??o.valor_orcamento??'', o.pago?'Sim':'Não', new Date(o.created_at).toLocaleDateString('pt-BR')]))
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = 'relatorio-os.csv'; a.click()
  }

  return (
    <ReportLayout title="Ordens de Serviço" subtitle={`${dados.length} registros`} periodo={periodo} setPeriodo={setPeriodo} dataInicio={dataInicio} setDataInicio={setDataInicio} dataFim={dataFim} setDataFim={setDataFim} onExport={exportCSV}>
      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[{l:'Total OS',v:dados.length,c:'#6366f1'},{l:'Entregues',v:dados.filter((o:any)=>o.status==='entregue').length,c:'#10b981'},{l:'Receita',v:`R$ ${totalReceita.toFixed(2).replace('.',',')}`,c:'#f59e0b'},{l:'Ticket médio',v:`R$ ${ticketMedio.toFixed(2).replace('.',',')}`,c:'#3b82f6'},{l:'Canceladas',v:dados.filter((o:any)=>o.status==='cancelada').length,c:'#ef4444'}].map(m=>(
          <div key={m.l} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.l}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: m.c }}>{m.v}</p>
          </div>
        ))}
      </div>

      {/* Filtros extras */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, background: '#fff', outline: 'none' }}>
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input value={filtroModelo} onChange={e => setFiltroModelo(e.target.value)} placeholder="Filtrar por modelo..." style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, background: '#fff', outline: 'none', width: 180 }} />
      </div>

      {/* Tabela */}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div> : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['OS','Cliente','Modelo','Defeito','Valor','Status','Data'].map(h=><th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.04em' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {dados.map((o:any) => (
                <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding:'9px 14px', fontWeight:600, color:'#6366f1' }}>#{o.numero}</td>
                  <td style={{ padding:'9px 14px', color:'#374151' }}>{o.clientes?.nome ?? '—'}</td>
                  <td style={{ padding:'9px 14px', color:'#374151', fontSize:12 }}>{o.modelo ?? '—'}</td>
                  <td style={{ padding:'9px 14px', color:'#64748b', fontSize:12, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.defeito_relatado}</td>
                  <td style={{ padding:'9px 14px', fontWeight:500, color:'#0f172a', fontFamily:'monospace', fontSize:12 }}>{o.valor_final||o.valor_orcamento ? `R$ ${(o.valor_final??o.valor_orcamento).toFixed(2).replace('.',',')}` : '—'}</td>
                  <td style={{ padding:'9px 14px' }}><span style={{ fontSize:11, fontWeight:500, padding:'2px 8px', borderRadius:20, background: o.status==='entregue'?'#ecfdf5':o.status==='pronta'?'#f0fdf4':o.status==='cancelada'?'#fef2f2':'#eff6ff', color: o.status==='entregue'?'#065f46':o.status==='cancelada'?'#991b1b':'#1d4ed8' }}>{STATUS_LABELS[o.status]??o.status}</span></td>
                  <td style={{ padding:'9px 14px', color:'#94a3b8', fontSize:12 }}>{new Date(o.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportLayout>
  )
}

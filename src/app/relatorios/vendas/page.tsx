'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ReportLayout, periodoToDates } from '../ReportLayout'

export default function RelVendas() {
  const supabase = createClient()
  const router = useRouter()
  const [periodo, setPeriodo] = useState('30d')
  const [dataInicio, setDataInicio] = useState(''); const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])
  const [filtroForma, setFiltroForma] = useState('todos')
  const [dados, setDados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { inicio, fim } = periodoToDates(periodo, dataInicio, dataFim)
    let q = supabase.from('vendas').select('*,venda_itens(*)').eq('status','finalizada').gte('created_at',inicio+'T00:00:00').lte('created_at',fim+'T23:59:59').order('created_at',{ascending:false}).limit(200)
    if (filtroForma !== 'todos') q = q.eq('forma_pagamento', filtroForma)
    const { data } = await q
    setDados(data ?? [])
    setLoading(false)
  }, [supabase, periodo, dataInicio, dataFim, filtroForma])

  useEffect(() => { fetch() }, [fetch])

  const total = dados.reduce((s:number,v:any)=>s+Number(v.total??0),0)
  const formas: Record<string,number> = {}
  dados.forEach((v:any) => { formas[v.forma_pagamento??'outro'] = (formas[v.forma_pagamento??'outro']??0) + Number(v.total??0) })

  function exportCSV() {
    const rows = [['Venda','Data','Forma','Total','Itens']]
    dados.forEach((v:any) => rows.push([v.numero, new Date(v.created_at).toLocaleDateString('pt-BR'), v.forma_pagamento??'—', Number(v.total??0).toFixed(2), v.venda_itens?.length??0]))
    const csv = rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n')
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='relatorio-vendas.csv'; a.click()
  }

  return (
    <ReportLayout title="Vendas PDV" subtitle={`${dados.length} vendas`} periodo={periodo} setPeriodo={setPeriodo} dataInicio={dataInicio} setDataInicio={setDataInicio} dataFim={dataFim} setDataFim={setDataFim} onExport={exportCSV}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[{l:'Total vendas',v:dados.length,c:'#6366f1'},{l:'Receita total',v:`R$ ${total.toFixed(2).replace('.',',')}`,c:'#10b981'},{l:'Ticket médio',v:dados.length>0?`R$ ${(total/dados.length).toFixed(2).replace('.',',')}`:'-',c:'#f59e0b'}].map(m=>(
          <div key={m.l} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}><p style={{ fontSize:11,color:'#64748b',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em' }}>{m.l}</p><p style={{ fontSize:20,fontWeight:700,color:m.c }}>{m.v}</p></div>
        ))}
        {Object.entries(formas).map(([forma, val]) => (
          <div key={forma} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}><p style={{ fontSize:11,color:'#64748b',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em' }}>{forma}</p><p style={{ fontSize:18,fontWeight:700,color:'#374151' }}>R$ {val.toFixed(2).replace('.',',')}</p></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <select value={filtroForma} onChange={e=>setFiltroForma(e.target.value)} style={{ padding:'7px 10px',border:'1px solid #e2e8f0',borderRadius:7,fontSize:12,background:'#fff',outline:'none' }}>
          <option value="todos">Todas as formas</option>
          {['dinheiro','pix','credito','debito','misto'].map(f=><option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {loading ? <div style={{ textAlign:'center',padding:40,color:'#94a3b8' }}>Carregando...</div> : (
        <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead><tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
              {['Venda','Data','Forma','Itens','Desconto','Total'].map(h=><th key={h} style={{ padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {dados.map((v:any)=>(
                <tr key={v.id} onClick={() => router.push('/vendas/' + v.id)} style={{ borderBottom:'1px solid #f1f5f9', cursor:'pointer', transition:'background 0.15s' }} onMouseEnter={e=>(e.currentTarget.style.background='#f8fafc')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                  <td style={{ padding:'9px 14px',fontWeight:600,color:'#6366f1' }}>#{v.numero}</td>
                  <td style={{ padding:'9px 14px',color:'#94a3b8',fontSize:12 }}>{new Date(v.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                  <td style={{ padding:'9px 14px',color:'#374151',textTransform:'capitalize' }}>{v.forma_pagamento??'—'}</td>
                  <td style={{ padding:'9px 14px',color:'#374151' }}>{v.venda_itens?.length??0}</td>
                  <td style={{ padding:'9px 14px',color:'#ef4444',fontSize:12 }}>{Number(v.desconto??0)>0?`- R$ ${Number(v.desconto).toFixed(2).replace('.',',')}`:'-'}</td>
                  <td style={{ padding:'9px 14px',fontWeight:600,color:'#0f172a',fontFamily:'monospace' }}>R$ {Number(v.total??0).toFixed(2).replace('.',',')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportLayout>
  )
}

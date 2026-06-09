'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReportLayout, periodoToDates } from '../ReportLayout'
export default function RelLogs() {
  const supabase = createClient()
  const [periodo, setPeriodo] = useState('7d'); const [dataInicio, setDataInicio] = useState(''); const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])
  const [dados, setDados] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [filtroTipo, setFiltroTipo] = useState('')
  const fetch = useCallback(async () => {
    setLoading(true)
    const { inicio, fim } = periodoToDates(periodo, dataInicio, dataFim)
    let q = supabase.from('events').select('*').gte('created_at',inicio+'T00:00:00').lte('created_at',fim+'T23:59:59').order('created_at',{ascending:false}).limit(500)
    if (filtroTipo) q = q.ilike('type',`%${filtroTipo}%`)
    const { data } = await q; setDados(data ?? []); setLoading(false)
  }, [supabase, periodo, dataInicio, dataFim, filtroTipo])
  useEffect(() => { fetch() }, [fetch])
  function exportCSV() {
    const rows = [['Tipo','Entidade','Data']]
    dados.forEach((e:any)=>rows.push([e.type,e.entity??'',new Date(e.created_at).toLocaleString('pt-BR')]))
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='relatorio-logs.csv'; a.click()
  }
  return (
    <ReportLayout title="Logs do sistema" subtitle={`${dados.length} eventos`} periodo={periodo} setPeriodo={setPeriodo} dataInicio={dataInicio} setDataInicio={setDataInicio} dataFim={dataFim} setDataFim={setDataFim} onExport={exportCSV}>
      <div style={{ display:'flex',gap:8,marginBottom:14 }}>
        <input value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} placeholder="Filtrar por tipo de evento..." style={{ padding:'7px 10px',border:'1px solid #e2e8f0',borderRadius:7,fontSize:12,background:'#fff',outline:'none',width:220 }} />
      </div>
      {loading ? <div style={{ textAlign:'center',padding:40,color:'#94a3b8' }}>Carregando...</div> : (
        <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead><tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
              {['Tipo','Entidade','ID ref.','Data'].map(h=><th key={h} style={{ padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em' }}>{h}</th>)}
            </tr></thead>
            <tbody>{dados.map((e:any)=>(
              <tr key={e.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                <td style={{ padding:'9px 14px' }}><code style={{ fontSize:11,background:'#eef2ff',color:'#3730a3',padding:'2px 8px',borderRadius:6 }}>{e.type}</code></td>
                <td style={{ padding:'9px 14px',color:'#64748b',fontSize:12 }}>{e.entity??'—'}</td>
                <td style={{ padding:'9px 14px',color:'#94a3b8',fontFamily:'monospace',fontSize:11 }}>{e.entity_id?.slice(0,8)??'—'}...</td>
                <td style={{ padding:'9px 14px',color:'#94a3b8',fontSize:12 }}>{new Date(e.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ReportLayout>
  )
}

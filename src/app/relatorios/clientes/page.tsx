'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReportLayout, periodoToDates } from '../ReportLayout'

export default function RelClientes() {
  const supabase = createClient()
  const [periodo, setPeriodo] = useState('30d')
  const [dataInicio, setDataInicio] = useState(''); const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [dados, setDados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { inicio, fim } = periodoToDates(periodo, dataInicio, dataFim)
    let q = supabase.from('clientes').select('*').is('deleted_at',null).gte('created_at',inicio+'T00:00:00').lte('created_at',fim+'T23:59:59').order('nome').limit(300)
    if (filtroStatus !== 'todos') q = q.eq('status_crm', filtroStatus)
    const { data } = await q
    setDados(data ?? [])
    setLoading(false)
  }, [supabase, periodo, dataInicio, dataFim, filtroStatus])

  useEffect(() => { fetch() }, [fetch])

  function exportCSV() {
    const rows = [['Nome','Telefone','Email','CPF','Status','Cadastrado em']]
    dados.forEach((c:any) => rows.push([c.nome,c.telefone??'',c.email??'',c.cpf??'',c.status_crm??'',new Date(c.created_at).toLocaleDateString('pt-BR')]))
    const csv = rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n')
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='relatorio-clientes.csv'; a.click()
  }

  return (
    <ReportLayout title="Clientes" subtitle={`${dados.length} registros`} periodo={periodo} setPeriodo={setPeriodo} dataInicio={dataInicio} setDataInicio={setDataInicio} dataFim={dataFim} setDataFim={setDataFim} onExport={exportCSV}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[{l:'Total',v:dados.length,c:'#6366f1'},{l:'Ativos',v:dados.filter((c:any)=>c.status_crm==='ativo').length,c:'#10b981'},{l:'Em risco',v:dados.filter((c:any)=>c.status_crm==='em_risco').length,c:'#f59e0b'}].map(m=>(
          <div key={m.l} style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px' }}><p style={{ fontSize:11,color:'#64748b',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em' }}>{m.l}</p><p style={{ fontSize:20,fontWeight:700,color:m.c }}>{m.v}</p></div>
        ))}
      </div>
      <div style={{ display:'flex',gap:8,marginBottom:14 }}>
        <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)} style={{ padding:'7px 10px',border:'1px solid #e2e8f0',borderRadius:7,fontSize:12,background:'#fff',outline:'none' }}>
          <option value="todos">Todos</option><option value="ativo">Ativo</option><option value="em_risco">Em risco</option><option value="inativo">Inativo</option>
        </select>
      </div>
      {loading ? <div style={{ textAlign:'center',padding:40,color:'#94a3b8' }}>Carregando...</div> : (
        <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead><tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
              {['Nome','Telefone','Email','CPF','Status','Cadastrado'].map(h=><th key={h} style={{ padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em' }}>{h}</th>)}
            </tr></thead>
            <tbody>{dados.map((c:any)=>(
              <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                <td style={{ padding:'9px 14px',fontWeight:500,color:'#0f172a' }}>{c.nome}</td>
                <td style={{ padding:'9px 14px',color:'#64748b',fontSize:12 }}>{c.telefone??'—'}</td>
                <td style={{ padding:'9px 14px',color:'#64748b',fontSize:12 }}>{c.email??'—'}</td>
                <td style={{ padding:'9px 14px',color:'#94a3b8',fontSize:12 }}>{c.cpf??'—'}</td>
                <td style={{ padding:'9px 14px' }}><span style={{ fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:20,background:c.status_crm==='ativo'?'#ecfdf5':c.status_crm==='em_risco'?'#fef3c7':'#f1f5f9',color:c.status_crm==='ativo'?'#065f46':c.status_crm==='em_risco'?'#92400e':'#94a3b8' }}>{c.status_crm??'—'}</span></td>
                <td style={{ padding:'9px 14px',color:'#94a3b8',fontSize:12 }}>{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ReportLayout>
  )
}

'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReportLayout, periodoToDates } from '../ReportLayout'
export default function RelFinanceiro() {
  const supabase = createClient()
  const [periodo, setPeriodo] = useState('30d'); const [dataInicio, setDataInicio] = useState(''); const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])
  const [dados, setDados] = useState<any[]>([]); const [loading, setLoading] = useState(true)
  const fetch = useCallback(async () => {
    setLoading(true)
    const { inicio, fim } = periodoToDates(periodo, dataInicio, dataFim)
    const { data } = await supabase.from('caixa_movimentos').select('*').gte('data_ref',inicio).lte('data_ref',fim).order('created_at',{ascending:false}).limit(500)
    setDados(data ?? []); setLoading(false)
  }, [supabase, periodo, dataInicio, dataFim])
  useEffect(() => { fetch() }, [fetch])
  const entradas = dados.filter((m:any)=>['abertura','suprimento','venda','os'].includes(m.tipo)).reduce((s:number,m:any)=>s+Number(m.valor??0),0)
  const saidas = dados.filter((m:any)=>['sangria','estorno'].includes(m.tipo)).reduce((s:number,m:any)=>s+Number(m.valor??0),0)
  const saldo = entradas - saidas
  const porForma: Record<string,number> = {}
  dados.forEach((m:any) => { if (m.forma) porForma[m.forma] = (porForma[m.forma]??0) + Number(m.valor??0) })
  function exportCSV() {
    const rows = [['Tipo','Valor','Forma','Observações','Data']]
    dados.forEach((m:any)=>rows.push([m.tipo,m.valor,m.forma??'',m.observacoes??'',new Date(m.created_at).toLocaleDateString('pt-BR')]))
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='relatorio-financeiro.csv'; a.click()
  }
  return (
    <ReportLayout title="Financeiro" subtitle={`${dados.length} movimentos de caixa`} periodo={periodo} setPeriodo={setPeriodo} dataInicio={dataInicio} setDataInicio={setDataInicio} dataFim={dataFim} setDataFim={setDataFim} onExport={exportCSV}>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12,marginBottom:20 }}>
        {[{l:'Entradas',v:`R$ ${entradas.toFixed(2).replace('.',',')}`,c:'#10b981'},{l:'Saídas',v:`R$ ${saidas.toFixed(2).replace('.',',')}`,c:'#ef4444'},{l:'Saldo líquido',v:`R$ ${saldo.toFixed(2).replace('.',',')}`,c:saldo>=0?'#065f46':'#991b1b'},
          ...Object.entries(porForma).map(([f,v])=>({l:f,v:`R$ ${v.toFixed(2).replace('.',',')}`,c:'#374151'}))
        ].map(m=>(
          <div key={m.l} style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px' }}><p style={{ fontSize:11,color:'#64748b',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em' }}>{m.l}</p><p style={{ fontSize:16,fontWeight:700,color:m.c }}>{m.v}</p></div>
        ))}
      </div>
      {loading ? <div style={{ textAlign:'center',padding:40,color:'#94a3b8' }}>Carregando...</div> : (
        <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead><tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
              {['Tipo','Valor','Forma','Obs.','Data'].map(h=><th key={h} style={{ padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em' }}>{h}</th>)}
            </tr></thead>
            <tbody>{dados.map((m:any,i:number)=>(
              <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                <td style={{ padding:'9px 14px' }}><span style={{ fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:20,background:['sangria','estorno'].includes(m.tipo)?'#fef2f2':'#ecfdf5',color:['sangria','estorno'].includes(m.tipo)?'#991b1b':'#065f46' }}>{m.tipo}</span></td>
                <td style={{ padding:'9px 14px',fontWeight:600,fontFamily:'monospace',color:['sangria','estorno'].includes(m.tipo)?'#ef4444':'#065f46' }}>{['sangria','estorno'].includes(m.tipo)?'-':'+'}R$ {Number(m.valor??0).toFixed(2).replace('.',',')}</td>
                <td style={{ padding:'9px 14px',color:'#64748b',textTransform:'capitalize',fontSize:12 }}>{m.forma??'—'}</td>
                <td style={{ padding:'9px 14px',color:'#94a3b8',fontSize:12,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.observacoes??'—'}</td>
                <td style={{ padding:'9px 14px',color:'#94a3b8',fontSize:12 }}>{new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ReportLayout>
  )
}

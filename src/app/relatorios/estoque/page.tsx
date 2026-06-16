'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReportLayout, periodoToDates } from '../ReportLayout'
import ProdutoDetalheModal from '@/components/ProdutoDetalheModal'
export default function RelEstoque() {
  const supabase = createClient()
  const [periodo, setPeriodo] = useState('30d'); const [dataInicio, setDataInicio] = useState(''); const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])
  const [produtoSelecionado, setProdutoSelecionado] = useState<string | null>(null)
  const [dados, setDados] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [filtroTipo, setFiltroTipo] = useState('todos')
  const fetch = useCallback(async () => {
    setLoading(true)
    const { inicio, fim } = periodoToDates(periodo, dataInicio, dataFim)
    let q = supabase.from('estoque_movimentos').select('*,produtos(nome,codigo_interno)').gte('created_at',inicio+'T00:00:00').lte('created_at',fim+'T23:59:59').order('created_at',{ascending:false}).limit(300)
    if (filtroTipo !== 'todos') q = q.eq('tipo', filtroTipo)
    const { data } = await q; setDados(data ?? []); setLoading(false)
  }, [supabase, periodo, dataInicio, dataFim, filtroTipo])
  useEffect(() => { fetch() }, [fetch])
  const entradas = dados.filter((m:any)=>m.tipo==='entrada').reduce((s:number,m:any)=>s+(m.quantidade??0),0)
  const saidas = dados.filter((m:any)=>['saida','venda','os'].includes(m.tipo)).reduce((s:number,m:any)=>s+(m.quantidade??0),0)
  function exportCSV() {
    const rows = [['Produto','Tipo','Quantidade','Custo unit','Data']]
    dados.forEach((m:any)=>rows.push([m.produtos?.nome??'',m.tipo,m.quantidade,m.custo_unit??'',new Date(m.created_at).toLocaleDateString('pt-BR')]))
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='relatorio-estoque.csv'; a.click()
  }
  return (
    <>
    <ReportLayout title="Movimentações de Estoque" subtitle={`${dados.length} movimentos`} periodo={periodo} setPeriodo={setPeriodo} dataInicio={dataInicio} setDataInicio={setDataInicio} dataFim={dataFim} setDataFim={setDataFim} onExport={exportCSV}>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12,marginBottom:20 }}>
        {[{l:'Total movimentos',v:dados.length,c:'#6366f1'},{l:'Entradas (un)',v:entradas,c:'#10b981'},{l:'Saídas (un)',v:saidas,c:'#ef4444'}].map(m=>(
          <div key={m.l} style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px' }}><p style={{ fontSize:11,color:'#64748b',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em' }}>{m.l}</p><p style={{ fontSize:20,fontWeight:700,color:m.c }}>{m.v}</p></div>
        ))}
      </div>
      <div style={{ marginBottom:14 }}>
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} style={{ padding:'7px 10px',border:'1px solid #e2e8f0',borderRadius:7,fontSize:12,background:'#fff',outline:'none' }}>
          <option value="todos">Todos os tipos</option>
          {['entrada','saida','ajuste','os','venda'].map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {loading ? <div style={{ textAlign:'center',padding:40,color:'#94a3b8' }}>Carregando...</div> : (
        <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead><tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
              {['Produto','Tipo','Quantidade','Custo unit','Data'].map(h=><th key={h} style={{ padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em' }}>{h}</th>)}
            </tr></thead>
            <tbody>{dados.map((m:any,i:number)=>(
              <tr key={i} onClick={() => { if (m.produto_id) setProdutoSelecionado(m.produto_id) }} style={{ borderBottom:'1px solid #f1f5f9', cursor:'pointer', transition:'background 0.15s' }} onMouseEnter={e=>(e.currentTarget.style.background='#f8fafc')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                <td style={{ padding:'9px 14px',fontWeight:500,color:'#0f172a' }}>{m.produtos?.nome??'—'}</td>
                <td style={{ padding:'9px 14px' }}><span style={{ fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:20,background:m.tipo==='entrada'?'#ecfdf5':m.tipo==='ajuste'?'#eff6ff':'#fef2f2',color:m.tipo==='entrada'?'#065f46':m.tipo==='ajuste'?'#1d4ed8':'#991b1b' }}>{m.tipo}</span></td>
                <td style={{ padding:'9px 14px',fontWeight:600,color:m.tipo==='entrada'?'#065f46':'#991b1b' }}>{m.tipo==='entrada'?'+':'-'}{m.quantidade}</td>
                <td style={{ padding:'9px 14px',fontFamily:'monospace',fontSize:12,color:'#374151' }}>{m.custo_unit?`R$ ${Number(m.custo_unit).toFixed(2).replace('.',',')}`:'-'}</td>
                <td style={{ padding:'9px 14px',color:'#94a3b8',fontSize:12 }}>{new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ReportLayout>
    {produtoSelecionado && <ProdutoDetalheModal produtoId={produtoSelecionado} onClose={() => setProdutoSelecionado(null)} />}
    </>
  )
}

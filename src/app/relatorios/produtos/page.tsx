'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReportLayout, periodoToDates } from '../ReportLayout'

export default function RelProdutos() {
  const supabase = createClient()
  const [periodo, setPeriodo] = useState('30d')
  const [dataInicio, setDataInicio] = useState(''); const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])
  const [dados, setDados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [grupos, setGrupos] = useState<any[]>([])

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('produtos').select('*,produto_grupos(nome),estoque(qtd_atual,custo_medio)').is('deleted_at',null).order('nome').limit(300)
    if (search) q = q.ilike('nome',`%${search}%`)
    if (filtroGrupo) q = q.eq('grupo_id',filtroGrupo)
    const { data } = await q
    setDados(data ?? [])
    const { data: g } = await supabase.from('produto_grupos').select('id,nome').eq('ativo',true).order('nome')
    setGrupos(g ?? [])
    setLoading(false)
  }, [supabase, search, filtroGrupo])

  useEffect(() => { fetch() }, [fetch])

  function exportCSV() {
    const rows = [['Nome','Código','Grupo','Custo','Preço','Margem','Estoque']]
    dados.forEach((p:any) => rows.push([p.nome,p.codigo_interno??'',p.produto_grupos?.nome??'',p.custo_final??0,p.preco_venda??0,p.margem_pct??0,(p.estoque?.[0]?.qtd_atual??0)]))
    const csv = rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n')
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='relatorio-produtos.csv'; a.click()
  }

  return (
    <ReportLayout title="Produtos" subtitle={`${dados.length} produtos`} periodo={periodo} setPeriodo={setPeriodo} dataInicio={dataInicio} setDataInicio={setDataInicio} dataFim={dataFim} setDataFim={setDataFim} onExport={exportCSV}>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12,marginBottom:20 }}>
        {[{l:'Total',v:dados.length,c:'#6366f1'},{l:'Ativos',v:dados.filter((p:any)=>p.ativo).length,c:'#10b981'},{l:'Estoque baixo',v:dados.filter((p:any)=>{const est=p.estoque?.[0]; return est&&est.qtd_minima>0&&est.qtd_atual<=est.qtd_minima}).length,c:'#ef4444'},{l:'Incompletos',v:dados.filter((p:any)=>p.cadastro_rapido).length,c:'#f59e0b'}].map(m=>(
          <div key={m.l} style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px' }}><p style={{ fontSize:11,color:'#64748b',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em' }}>{m.l}</p><p style={{ fontSize:20,fontWeight:700,color:m.c }}>{m.v}</p></div>
        ))}
      </div>
      <div style={{ display:'flex',gap:8,marginBottom:14,flexWrap:'wrap' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar produto..." style={{ padding:'7px 10px',border:'1px solid #e2e8f0',borderRadius:7,fontSize:12,background:'#fff',outline:'none',width:200 }} />
        <select value={filtroGrupo} onChange={e=>setFiltroGrupo(e.target.value)} style={{ padding:'7px 10px',border:'1px solid #e2e8f0',borderRadius:7,fontSize:12,background:'#fff',outline:'none' }}>
          <option value="">Todos os grupos</option>
          {grupos.map((g:any)=><option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </div>
      {loading ? <div style={{ textAlign:'center',padding:40,color:'#94a3b8' }}>Carregando...</div> : (
        <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead><tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
              {['Nome','Código','Grupo','Custo','Preço','Margem','Estoque'].map(h=><th key={h} style={{ padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em' }}>{h}</th>)}
            </tr></thead>
            <tbody>{dados.map((p:any)=>{
              const est = p.estoque?.[0]
              const baixo = est&&est.qtd_minima>0&&est.qtd_atual<=est.qtd_minima
              return (
                <tr key={p.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'9px 14px',fontWeight:500,color:'#0f172a' }}>{p.nome}{p.cadastro_rapido&&<span style={{ fontSize:10,background:'#fef3c7',color:'#92400e',padding:'1px 6px',borderRadius:10,marginLeft:6 }}>incompleto</span>}</td>
                  <td style={{ padding:'9px 14px',color:'#94a3b8',fontFamily:'monospace',fontSize:11 }}>{p.codigo_interno??'—'}</td>
                  <td style={{ padding:'9px 14px',color:'#64748b',fontSize:12 }}>{p.produto_grupos?.nome??'—'}</td>
                  <td style={{ padding:'9px 14px',fontFamily:'monospace',fontSize:12,color:'#374151' }}>{p.custo_final>0?`R$ ${Number(p.custo_final).toFixed(2).replace('.',',')}`:'-'}</td>
                  <td style={{ padding:'9px 14px',fontWeight:500,fontFamily:'monospace',fontSize:12 }}>R$ {Number(p.preco_venda??0).toFixed(2).replace('.',',')}</td>
                  <td style={{ padding:'9px 14px' }}>{p.margem_pct>0?<span style={{ fontSize:12,fontWeight:600,color:p.margem_pct>=30?'#065f46':p.margem_pct>=15?'#92400e':'#991b1b' }}>{Number(p.margem_pct).toFixed(1)}%</span>:'—'}</td>
                  <td style={{ padding:'9px 14px' }}><span style={{ fontSize:12,fontWeight:500,color:baixo?'#991b1b':'#374151' }}>{est?est.qtd_atual:'—'}</span></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
    </ReportLayout>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  clienteId: string
  onClose: () => void
}

type OSItem = { id: string; numero: number | string; status: string; modelo: string | null; defeito_relatado: string; created_at: string; valor_final: number | null }
type VendaItem = { id: string; numero: number | string; total: number; forma_pagamento: string | null; created_at: string; status: string }
type GarantiaItem = { id: string; numero: number | string; status: string; created_at: string; descricao_problema: string | null }

type Cliente = {
  id: string; nome: string; telefone: string | null; email: string | null
  cpf: string | null; endereco: string | null; created_at: string
  campos_extras?: { custom?: Record<string, string> }
}

export default function ClienteDetalheModal({ clienteId, onClose }: Props) {
  const supabase = createClient()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [osList, setOsList] = useState<OSItem[]>([])
  const [vendas, setVendas] = useState<VendaItem[]>([])
  const [garantias, setGarantias] = useState<GarantiaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'info'|'os'|'vendas'|'garantias'>('info')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: perfil } = await supabase.from('perfis').select('filial_id').eq('id', user.id).single()
      const filialId = perfil?.filial_id

      const [cResult, osResult, vResult, gResult] = await Promise.allSettled([
        supabase.from('clientes').select('*').eq('id', clienteId).single(),
        supabase.from('ordens_servico').select('id,numero,status,modelo,defeito_relatado,created_at,valor_final')
          .eq('cliente_id', clienteId).eq('filial_id', filialId).order('created_at', { ascending: false }).limit(50),
        supabase.from('vendas').select('id,numero,total,forma_pagamento,created_at,status')
          .eq('cliente_id', clienteId).eq('filial_id', filialId).order('created_at', { ascending: false }).limit(50),
        supabase.from('garantias').select('id,numero,status,created_at,descricao_problema')
          .eq('cliente_id', clienteId).eq('filial_id', filialId).order('created_at', { ascending: false }).limit(50),
      ])

      if (cResult.status === 'fulfilled') setCliente(cResult.value.data as Cliente ?? null)
      if (osResult.status === 'fulfilled') setOsList((osResult.value.data ?? []) as OSItem[])
      if (vResult.status === 'fulfilled') setVendas((vResult.value.data ?? []) as VendaItem[])
      if (gResult.status === 'fulfilled') setGarantias((gResult.value.data ?? []) as GarantiaItem[])
      setLoading(false)
    }
    load()
  }, [clienteId])

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

  const totalGasto = vendas.reduce((s, v) => s + (v.total ?? 0), 0)
  const totalOS = osList.reduce((s, o) => s + (o.valor_final ?? 0), 0)

  const statusColor: Record<string, string> = {
    finalizada: '#16a34a', entregue: '#16a34a', concluida: '#16a34a',
    cancelada: '#dc2626', cancelado: '#dc2626',
    aberta: '#2563eb', em_andamento: '#d97706', pendente: '#ea580c',
    aguardando_peca: '#7c3aed',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{loading ? 'Carregando...' : cliente?.nome ?? '—'}</div>
            {!loading && cliente?.telefone && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{cliente.telefone}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: '4px 8px' }}>✕</button>
        </div>

        {/* Summary stats */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
            {[
              { label: 'OS abertas', value: osList.length },
              { label: 'Compras', value: vendas.length },
              { label: 'Garantias', value: garantias.length },
              { label: 'Total gasto', value: fmt(totalGasto + totalOS) },
            ].map(s => (
              <div key={s.label} style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', flexShrink: 0, padding: '0 16px' }}>
          {([['info','📋 Info'],['os','🔧 OS'],['vendas','🛒 Vendas'],['garantias','🛡 Garantias']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setAba(k)}
              style={{ padding: '10px 14px', border: 'none', background: 'none', fontSize: 13, fontWeight: aba === k ? 600 : 400, color: aba === k ? '#2563eb' : '#64748b', cursor: 'pointer', borderBottom: aba === k ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -1 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading && <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>Carregando...</div>}

          {!loading && aba === 'info' && cliente && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Nome', value: cliente.nome },
                { label: 'Telefone', value: cliente.telefone },
                { label: 'Email', value: cliente.email },
                { label: 'CPF', value: cliente.cpf },
                { label: 'Endereço', value: cliente.endereco },
                { label: 'Cliente desde', value: fmtDate(cliente.created_at) },
              ].filter(r => r.value).map(r => (
                <div key={r.label} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ minWidth: 110, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.label}</span>
                  <span style={{ fontSize: 14, color: '#1e293b' }}>{r.value}</span>
                </div>
              ))}
            </div>
          )}

          {!loading && aba === 'os' && (
            osList.length === 0
              ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>Nenhuma OS encontrada.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['OS','Data','Modelo','Defeito','Status','Valor'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{osList.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#2563eb' }}>#{o.numero}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{fmtDate(o.created_at)}</td>
                      <td style={{ padding: '8px 12px' }}>{o.modelo ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.defeito_relatado}</td>
                      <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: (statusColor[o.status] ?? '#64748b') + '20', color: statusColor[o.status] ?? '#64748b' }}>{o.status}</span></td>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{o.valor_final ? fmt(o.valor_final) : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
          )}

          {!loading && aba === 'vendas' && (
            vendas.length === 0
              ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>Nenhuma venda encontrada.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['Venda','Data','Total','Pagamento','Status'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{vendas.map(v => (
                    <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#2563eb' }}>#{v.numero}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{fmtDate(v.created_at)}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{fmt(v.total)}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{v.forma_pagamento ?? '—'}</td>
                      <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: (statusColor[v.status] ?? '#64748b') + '20', color: statusColor[v.status] ?? '#64748b' }}>{v.status}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
          )}

          {!loading && aba === 'garantias' && (
            garantias.length === 0
              ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>Nenhuma garantia encontrada.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['Garantia','Data','Problema','Status'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{garantias.map(g => (
                    <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#2563eb' }}>#{g.numero}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{fmtDate(g.created_at)}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{g.descricao_problema ?? '—'}</td>
                      <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: (statusColor[g.status] ?? '#64748b') + '20', color: statusColor[g.status] ?? '#64748b' }}>{g.status}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
          )}
        </div>
      </div>
    </div>
  )
}

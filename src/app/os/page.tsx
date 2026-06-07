'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type OS = {
  id: string
  numero: number
  status: string
  marca: string | null
  modelo: string | null
  defeito_relatado: string
  valor_orcamento: number | null
  created_at: string
  clientes: { nome: string; telefone: string | null } | null
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  aberta:       { label: 'Aberta',       bg: '#eff6ff', color: '#1d4ed8' },
  em_andamento: { label: 'Em andamento', bg: '#fef3c7', color: '#92400e' },
  pronta:       { label: 'Pronta',       bg: '#ecfdf5', color: '#065f46' },
  entregue:     { label: 'Entregue',     bg: '#f0fdf4', color: '#14532d' },
  cancelada:    { label: 'Cancelada',    bg: '#fef2f2', color: '#991b1b' },
}

export default function OSPage() {
  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<OS[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')

  const fetchOS = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('ordens_servico')
      .select('id,numero,status,marca,modelo,defeito_relatado,valor_orcamento,created_at,clientes(nome,telefone)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (filtroStatus !== 'todos') query = query.eq('status', filtroStatus)
    if (search.trim()) query = query.or(`modelo.ilike.%${search}%,defeito_relatado.ilike.%${search}%`)

    const { data } = await query
    setItems((data as unknown as OS[]) ?? [])
    setLoading(false)
  }, [supabase, filtroStatus, search])

  useEffect(() => { fetchOS() }, [fetchOS])

  const inp: React.CSSProperties = {
    padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7,
    fontSize: 13, color: '#1e293b', background: '#f8fafc', outline: 'none', fontFamily: 'inherit',
  }

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Ordens de Serviço</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{items.length} registros</p>
        </div>
        <Link href="/os/nova" style={{
          padding: '9px 18px', background: '#6366f1', color: '#fff',
          borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500,
        }}>+ Nova OS</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          style={{ ...inp, flex: 1, minWidth: 200 }}
          placeholder="Buscar por modelo, defeito..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {['todos', 'aberta', 'em_andamento', 'pronta', 'entregue'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)} style={{
              padding: '8px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid',
              fontWeight: filtroStatus === s ? 500 : 400,
              background: filtroStatus === s ? '#e0e7ff' : '#fff',
              color: filtroStatus === s ? '#3730a3' : '#64748b',
              borderColor: filtroStatus === s ? '#818cf8' : '#e2e8f0',
            }}>{s === 'todos' ? 'Todas' : STATUS_CONFIG[s]?.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhuma OS encontrada</p>
          <Link href="/os/nova" style={{
            display: 'inline-block', marginTop: 16, padding: '9px 18px',
            background: '#6366f1', color: '#fff', borderRadius: 8,
            textDecoration: 'none', fontSize: 13, fontWeight: 500,
          }}>+ Nova OS</Link>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['OS', 'Cliente', 'Aparelho', 'Defeito', 'Valor', 'Status', 'Data'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 11,
                    fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(os => {
                const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
                return (
                  <tr
                    key={os.id}
                    onClick={() => router.push(`/os/${os.id}`)}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fafafa' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#6366f1' }}>#{os.numero}</td>
                    <td style={{ padding: '12px 16px', color: '#0f172a' }}>{os.clientes?.nome ?? '—'}</td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>{os.modelo ?? '—'}</td>
                    <td style={{ padding: '12px 16px', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {os.defeito_relatado}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 500 }}>
                      {os.valor_orcamento ? `R$ ${os.valor_orcamento.toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                      {new Date(os.created_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

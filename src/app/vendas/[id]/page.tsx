'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type VendaItem = {
  id: string
  produto_id: string | null
  descricao: string
  quantidade: number
  preco_unit: number
}

type Venda = {
  id: string
  numero?: number
  status: string
  tipo: string
  created_at: string
  total: number
  desconto: number
  subtotal: number
  forma_pagamento: string
  taxa_pagamento?: number
  observacoes?: string
  campos_extras?: { custom?: Record<string, string> }
  perfis?: { nome: string } | null
  venda_itens?: VendaItem[]
  pagamentos?: any
}

type CampoPersonalizado = {
  id: string
  nome: string
  tipo: string
}

type NotaFiscal = {
  id: string
  referencia: string
  status: string
  numero: string | null
  chave: string | null
  url_danfe: string | null
  url_xml: string | null
  mensagem_erro: string | null
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const statusColor: Record<string, string> = {
  finalizada: '#16a34a',
  cancelada: '#dc2626',
  pendente: '#ea580c',
}

export default function VendaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [venda, setVenda] = useState<Venda | null>(null)
  const [campos, setCampos] = useState<CampoPersonalizado[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nota, setNota] = useState<NotaFiscal | null>(null)
  const [nfeAtivo, setNfeAtivo] = useState(false)
  const [emitindo, setEmitindo] = useState(false)
  const [nfeErro, setNfeErro] = useState<string | null>(null)

  async function carregarNota() {
    const supabase = createClient()
    const { data } = await supabase.from('notas_fiscais')
      .select('id, referencia, status, numero, chave, url_danfe, url_xml, mensagem_erro')
      .eq('venda_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    setNota((data as NotaFiscal) ?? null)
  }

  async function emitirNota() {
    setEmitindo(true); setNfeErro(null)
    try {
      const res = await fetch('/api/nfe/emitir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venda_id: id }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok || data.error) setNfeErro(data.error ?? 'Erro ao emitir')
      await carregarNota()
    } catch (e) {
      setNfeErro(String(e))
    } finally {
      setEmitindo(false)
    }
  }

  async function consultarNota() {
    if (!nota) return
    setEmitindo(true)
    try {
      await fetch(`/api/nfe/status?ref=${encodeURIComponent(nota.referencia)}`)
      await carregarNota()
    } finally {
      setEmitindo(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data, error: err } = await supabase
          .from('vendas')
          .select('*, perfis(nome), venda_itens(*)')
          .eq('id', id)
          .single()

        if (err) throw err
        setVenda(data as Venda)

        const res = await fetch('/api/campos-personalizados?entidade=venda')
        const d = await res.json()
        setCampos(d.campos ?? [])

        const { data: cfg } = await supabase.from('nfe_config').select('ativo').maybeSingle()
        setNfeAtivo(cfg?.ativo ?? false)
        const { data: nf } = await supabase.from('notas_fiscais')
          .select('id, referencia, status, numero, chave, url_danfe, url_xml, mensagem_erro')
          .eq('venda_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        setNota((nf as NotaFiscal) ?? null)
      } catch (e: any) {
        setError(e.message ?? 'Erro ao carregar venda')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', color: '#64748b' }}>
        Carregando...
      </div>
    )
  }

  if (error || !venda) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', color: '#dc2626' }}>
        {error ?? 'Venda não encontrada.'}
      </div>
    )
  }

  const label = venda.numero ? `#${venda.numero}` : `#${venda.id.slice(0, 8)}`
  const statusBg = statusColor[venda.status] ?? '#64748b'
  const dataFormatada = new Date(venda.created_at).toLocaleString('pt-BR')
  const customFields = venda.campos_extras?.custom ?? {}
  const camposComValor = campos.filter((c) => customFields[c.id])

  return (
    <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', color: '#1e293b', maxWidth: 900, margin: '0 auto' }}>
      {/* Back button */}
      <button
        onClick={() => router.push('/relatorios/vendas')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#3b82f6',
          fontSize: 14,
          padding: '4px 0',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        ← Voltar
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Venda {label}</h1>
        <span
          style={{
            background: statusBg,
            color: '#fff',
            borderRadius: 20,
            padding: '4px 14px',
            fontSize: 13,
            fontWeight: 600,
            textTransform: 'capitalize',
          }}
        >
          {venda.status}
        </span>
      </div>
      <p style={{ margin: '0 0 32px', color: '#64748b', fontSize: 14 }}>{dataFormatada}</p>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Subtotal', value: fmt(venda.subtotal ?? 0) },
          { label: 'Desconto', value: fmt(venda.desconto ?? 0) },
          { label: 'Total', value: fmt(venda.total ?? 0) },
          { label: 'Forma de pagamento', value: venda.forma_pagamento ?? '—' },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '20px 24px',
            }}
          >
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {card.label}
            </p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Nota fiscal */}
      {(nfeAtivo || nota) && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>🧾 Nota fiscal</h2>
              {nota ? (
                <span style={{
                  padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: nota.status === 'autorizada' ? '#dcfce7' : nota.status === 'processando' ? '#fef3c7' : '#fee2e2',
                  color: nota.status === 'autorizada' ? '#166534' : nota.status === 'processando' ? '#92400e' : '#991b1b',
                }}>
                  {nota.status === 'autorizada' ? `Autorizada${nota.numero ? ` · nº ${nota.numero}` : ''}` : nota.status === 'processando' ? 'Processando na SEFAZ' : nota.status === 'cancelada' ? 'Cancelada' : 'Erro na emissão'}
                </span>
              ) : (
                <span style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma nota emitida para esta venda</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {nota?.status === 'autorizada' && nota.url_danfe && (
                <a href={nota.url_danfe} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, background: '#f0fdf4', color: '#166534', fontWeight: 600, textDecoration: 'none' }}>Ver DANFE</a>
              )}
              {nota?.status === 'autorizada' && nota.url_xml && (
                <a href={nota.url_xml} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#374151', textDecoration: 'none' }}>XML</a>
              )}
              {nota?.status === 'processando' && (
                <button onClick={consultarNota} disabled={emitindo} style={{ padding: '8px 16px', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontWeight: 500 }}>
                  {emitindo ? 'Consultando...' : 'Consultar status'}
                </button>
              )}
              {nfeAtivo && venda.status === 'finalizada' && (!nota || nota.status === 'erro' || nota.status === 'cancelada') && (
                <button onClick={emitirNota} disabled={emitindo} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, fontSize: 13, background: emitindo ? '#93c5fd' : '#2563eb', color: '#fff', fontWeight: 600, cursor: emitindo ? 'wait' : 'pointer' }}>
                  {emitindo ? 'Emitindo...' : nota ? 'Emitir novamente' : 'Emitir NFC-e'}
                </button>
              )}
            </div>
          </div>
          {(nfeErro || nota?.mensagem_erro) && nota?.status !== 'autorizada' && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px' }}>
              {nfeErro ?? nota?.mensagem_erro}
            </p>
          )}
        </div>
      )}

      {/* Items table */}
      {venda.venda_itens && venda.venda_itens.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 32, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Itens</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['#', 'Produto', 'Qtd', 'Preço unit.', 'Subtotal'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: '#64748b',
                        fontSize: 12,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderBottom: '1px solid #e2e8f0',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {venda.venda_itens.map((item, idx) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{idx + 1}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{item.descricao}</td>
                    <td style={{ padding: '12px 16px' }}>{item.quantidade}</td>
                    <td style={{ padding: '12px 16px' }}>{fmt(item.preco_unit)}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{fmt(item.quantidade * item.preco_unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info section */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Informações</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operador</p>
            <p style={{ margin: 0, fontWeight: 500 }}>{venda.perfis?.nome ?? '—'}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data</p>
            <p style={{ margin: 0, fontWeight: 500 }}>{dataFormatada}</p>
          </div>
          {venda.taxa_pagamento !== undefined && venda.taxa_pagamento > 0 && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taxa de pagamento</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{venda.taxa_pagamento}%</p>
            </div>
          )}
          {venda.observacoes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observações</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{venda.observacoes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Custom fields */}
      {camposComValor.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Campos personalizados</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {camposComValor.map((campo) => (
              <div key={campo.id}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{campo.nome}</p>
                <p style={{ margin: 0, fontWeight: 500 }}>{customFields[campo.id]}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

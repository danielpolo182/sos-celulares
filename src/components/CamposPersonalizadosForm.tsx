'use client'
import { useState, useEffect } from 'react'

export type CampoPersonalizado = {
  id: string
  nome: string
  tipo: 'texto' | 'numero' | 'lista'
  opcoes: string[]
  obrigatorio: boolean
  ordem: number
}

type Props = {
  entidade: 'produto' | 'venda' | 'os' | 'cliente'
  valores: Record<string, string>
  onChange: (valores: Record<string, string>) => void
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0',
  borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b',
  marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em',
}

export default function CamposPersonalizadosForm({ entidade, valores, onChange }: Props) {
  const [campos, setCampos] = useState<CampoPersonalizado[]>([])

  useEffect(() => {
    fetch(`/api/campos-personalizados?entidade=${entidade}`)
      .then(r => r.json())
      .then(d => setCampos(d.campos ?? []))
      .catch(() => {})
  }, [entidade])

  if (campos.length === 0) return null

  function set(id: string, val: string) {
    onChange({ ...valores, [id]: val })
  }

  return (
    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 16, paddingTop: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Campos personalizados
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
        {campos.map(c => (
          <div key={c.id}>
            <label style={lbl}>
              {c.nome}{c.obrigatorio && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
            </label>
            {c.tipo === 'lista' ? (
              <select
                value={valores[c.id] ?? ''}
                onChange={e => set(c.id, e.target.value)}
                style={inp}
              >
                <option value="">Selecionar...</option>
                {c.opcoes.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={c.tipo === 'numero' ? 'number' : 'text'}
                value={valores[c.id] ?? ''}
                onChange={e => set(c.id, e.target.value)}
                style={inp}
                placeholder={c.tipo === 'numero' ? '0' : ''}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

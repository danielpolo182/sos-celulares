'use client'
import { useState, useEffect, useRef } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0',
  borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

export default function CategoriaSelect({ value, onChange, placeholder = 'Ex: Display, Bateria...' }: Props) {
  const [sugestoes, setSugestoes] = useState<string[]>([])
  const [aberto, setAberto] = useState(false)
  const [digitando, setDigitando] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function buscar(q: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/categorias?q=${encodeURIComponent(q)}`)
        const d = await res.json()
        setSugestoes(d.categorias ?? [])
        setAberto(true)
      } catch { /* ignore */ }
    }, 300)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    onChange(v)
    setDigitando(true)
    buscar(v)
  }

  function handleFocus() {
    buscar(value)
  }

  function selecionar(cat: string) {
    onChange(cat)
    setAberto(false)
    setDigitando(false)
  }

  const mostrarCriar = digitando && value.trim() && !sugestoes.includes(value.trim())

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        style={inp}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder}
      />
      {aberto && (sugestoes.length > 0 || mostrarCriar) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)', marginTop: 2, overflow: 'hidden',
        }}>
          {sugestoes.map(s => (
            <div
              key={s}
              onMouseDown={() => selecionar(s)}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#1e293b' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}
            >
              {s}
            </div>
          ))}
          {mostrarCriar && (
            <div
              onMouseDown={() => selecionar(value.trim())}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#2563eb', borderTop: sugestoes.length > 0 ? '1px solid #f1f5f9' : 'none', fontWeight: 500 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#eff6ff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}
            >
              ＋ Criar categoria "{value.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  )
}

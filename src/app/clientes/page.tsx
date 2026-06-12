'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validarCPF, validarTelefone, formatarCPF, formatarTelefone } from '@/lib/validators'

type Cliente = {
  id: string
  nome: string
  telefone: string | null
  cpf: string | null
  email: string | null
  data_nascimento: string | null
  endereco: {
    cep?: string
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    estado?: string
  } | null
  status_crm: string
  created_at: string
}

type FormData = {
  nome: string
  telefone: string
  cpf: string
  email: string
  data_nascimento: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
}

const emptyForm: FormData = {
  nome: '', telefone: '', cpf: '', email: '',
  data_nascimento: '', cep: '', logradouro: '',
  numero: '', complemento: '', bairro: '', cidade: '', estado: '',
}

function formatPhone(v: string) { return formatarTelefone(v) }
function rawCPF(v: string) { return v.replace(/\D/g, '') }
function rawPhone(v: string) { return v.replace(/\D/g, '') }

function clienteToForm(c: Cliente): FormData {
  return {
    nome: c.nome ?? '',
    telefone: c.telefone ? formatPhone(c.telefone) : '',
    cpf: c.cpf ? formatarCPF(c.cpf) : '',
    email: c.email ?? '',
    data_nascimento: c.data_nascimento ?? '',
    cep: c.endereco?.cep ?? '',
    logradouro: c.endereco?.logradouro ?? '',
    numero: c.endereco?.numero ?? '',
    complemento: c.endereco?.complemento ?? '',
    bairro: c.endereco?.bairro ?? '',
    cidade: c.endereco?.cidade ?? '',
    estado: c.endereco?.estado ?? '',
  }
}

function highlight(text: string, query: string) {
  if (!query.trim()) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <strong style={{ color: '#2563eb', fontWeight: 600 }}>{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </span>
  )
}

type DropdownProps = {
  results: Cliente[]
  query: string
  field: 'nome' | 'cpf' | 'telefone'
  onSelect: (c: Cliente) => void
  visible: boolean
}

function Dropdown({ results, query, field, onSelect, visible }: DropdownProps) {
  if (!visible || results.length === 0) return null
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 8, marginTop: 4,
      boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
      overflow: 'hidden',
    }}>
      {results.map((c, i) => (
        <div
          key={c.id}
          onMouseDown={e => { e.preventDefault(); onSelect(c) }}
          style={{
            padding: '10px 14px',
            borderBottom: i < results.length - 1 ? '1px solid #f1f5f9' : 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#fff',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#dbeafe', color: '#2563eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600, flexShrink: 0,
          }}>{c.nome.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>
              {field === 'nome' ? highlight(c.nome, query) : c.nome}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', gap: 8 }}>
              {c.cpf && <span>{field === 'cpf' ? highlight(formatarCPF(c.cpf), query) : formatarCPF(c.cpf)}</span>}
              {c.telefone && <span>{field === 'telefone' ? highlight(formatPhone(c.telefone), query) : formatPhone(c.telefone)}</span>}
            </div>
          </div>
          <span style={{ fontSize: 11, color: '#93c5fd', fontWeight: 500 }}>usar →</span>
        </div>
      ))}
    </div>
  )
}

export default function ClientesPage() {
  const supabase = createClient()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [cpfErro, setCpfErro] = useState('')
  const [telErro, setTelErro] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)

  // Dropdown state per field
  const [dropdown, setDropdown] = useState<{ field: 'nome' | 'cpf' | 'telefone'; results: Cliente[] } | null>(null)
  const [activeField, setActiveField] = useState<string | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchClientes = useCallback(async (q = '') => {
    setLoading(true)
    let query = supabase
      .from('clientes')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    if (q.trim()) {
      const raw = q.replace(/\D/g, '')
      if (raw.length >= 3 && /^\d+$/.test(raw)) {
        query = query.or(`cpf.ilike.%${raw}%,telefone.ilike.%${raw}%`)
      } else {
        query = query.ilike('nome', `%${q}%`)
      }
    }

    const { data } = await query
    setClientes(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => fetchClientes(search), 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search, fetchClientes])

  async function searchDropdown(field: 'nome' | 'cpf' | 'telefone', value: string) {
    const raw = value.replace(/\D/g, '')
    const searchVal = field === 'nome' ? value : raw
    if (searchVal.length < 2) { setDropdown(null); return }

    let query = supabase.from('clientes').select('*').is('deleted_at', null).limit(5)

    if (field === 'nome') {
      query = query.ilike('nome', `%${value}%`)
    } else {
      query = query.ilike(field, `%${raw}%`)
    }

    const { data } = await query.order('nome')
    if (data && data.length > 0) {
      setDropdown({ field, results: data })
    } else {
      setDropdown(null)
    }
  }

  function handleFormField(field: keyof FormData, value: string) {
    setForm(f => ({ ...f, [field]: value }))

    if (field === 'cpf') {
      const raw = value.replace(/\D/g, '')
      setCpfErro(raw.length > 0 && raw.length < 11 ? 'CPF incompleto' : raw.length === 11 && !validarCPF(raw) ? 'CPF inválido' : '')
    }
    if (field === 'telefone') {
      const raw = value.replace(/\D/g, '')
      setTelErro(raw.length > 0 && !validarTelefone(raw) ? 'Telefone inválido' : '')
    }

    if (field === 'nome' || field === 'cpf' || field === 'telefone') {
      if (dropdownTimer.current) clearTimeout(dropdownTimer.current)
      dropdownTimer.current = setTimeout(() => {
        searchDropdown(field as 'nome' | 'cpf' | 'telefone', value)
      }, 250)
    }
  }

  function selectFromDropdown(c: Cliente) {
    setForm(clienteToForm(c))
    setEditId(c.id)
    setDropdown(null)
  }

  async function fetchCEP(cep: string) {
    const raw = cep.replace(/\D/g, '')
    if (raw.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(f => ({
          ...f,
          logradouro: data.logradouro ?? '',
          bairro: data.bairro ?? '',
          cidade: data.localidade ?? '',
          estado: data.uf ?? '',
        }))
      }
    } catch {}
  }

  function openNew() {
    setForm(emptyForm); setEditId(null)
    setError(''); setCpfErro(''); setTelErro('')
    setDropdown(null); setShowModal(true)
  }

  function openEdit(c: Cliente) {
    setForm(clienteToForm(c)); setEditId(c.id)
    setError(''); setCpfErro(''); setTelErro('')
    setDropdown(null); setShowModal(true)
  }

  async function handleSave() {
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return }
    if (cpfErro || telErro) return
    setSaving(true)
    setError('')

    const payload = {
      nome: form.nome.trim(),
      telefone: rawPhone(form.telefone) || null,
      cpf: rawCPF(form.cpf) || null,
      email: form.email.trim() || null,
      data_nascimento: form.data_nascimento || null,
      endereco: (form.cep || form.logradouro) ? {
        cep: form.cep.replace(/\D/g, '') || null,
        logradouro: form.logradouro || null,
        numero: form.numero || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
      } : null,
    }

    if (editId) {
      const { error: err } = await supabase.from('clientes').update(payload).eq('id', editId)
      if (err) { setError(`Erro ao atualizar: ${err.message} (${err.code})`); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('clientes').insert(payload)
      if (err) { setError(`Erro ao salvar: ${err.message} (${err.code})`); setSaving(false); return }
    }

    setSaving(false)
    setShowModal(false)
    fetchClientes(search)
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return
    await supabase.from('clientes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setSelectedCliente(null)
    fetchClientes(search)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    border: '1px solid #e2e8f0', borderRadius: 7,
    fontSize: 13, color: '#1e293b', background: '#fff',
    outline: 'none', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 500,
    color: '#64748b', marginBottom: 4,
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>

      {/* LIST */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e2e8f0' }}>
        <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Clientes</h1>
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{clientes.length} cadastrados</p>
            </div>
            <button onClick={openNew} style={{
              padding: '9px 18px', background: '#2563eb', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>+ Novo cliente</button>
          </div>
          <input
            placeholder="Buscar por nome, CPF ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inp, background: '#f8fafc' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
          ) : clientes.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhum cliente encontrado</p>
              <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Clique em "Novo cliente" para começar</p>
            </div>
          ) : clientes.map(c => (
            <div key={c.id} onClick={() => setSelectedCliente(c)} style={{
              padding: '14px 28px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
              background: selectedCliente?.id === c.id ? '#eff6ff' : '#fff',
              borderLeft: selectedCliente?.id === c.id ? '3px solid #2563eb' : '3px solid transparent',
              transition: 'all 0.1s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: '#dbeafe', color: '#2563eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 600, flexShrink: 0,
                }}>{c.nome.charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a', marginBottom: 2 }}>{c.nome}</p>
                  <p style={{ fontSize: 12, color: '#94a3b8' }}>
                    {[c.telefone ? formatPhone(c.telefone) : null, c.email].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                  </p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                  background: '#ecfdf5', color: '#065f46',
                }}>{c.status_crm}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DETAIL */}
      <div style={{ width: 360, background: '#f8fafc', overflowY: 'auto' }}>
        {selectedCliente ? (
          <div style={{ padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: '#dbeafe', color: '#2563eb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 600,
              }}>{selectedCliente.nome.charAt(0).toUpperCase()}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => openEdit(selectedCliente)} style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 500,
                  border: '1px solid #e2e8f0', borderRadius: 7,
                  background: '#fff', cursor: 'pointer', color: '#374151',
                }}>Editar</button>
                <button onClick={() => handleDelete(selectedCliente.id)} style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 500,
                  border: '1px solid #fee2e2', borderRadius: 7,
                  background: '#fff', cursor: 'pointer', color: '#dc2626',
                }}>Excluir</button>
              </div>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{selectedCliente.nome}</h2>
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#ecfdf5', color: '#065f46' }}>
              {selectedCliente.status_crm}
            </span>
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Telefone', value: selectedCliente.telefone ? formatPhone(selectedCliente.telefone) : null },
                { label: 'CPF', value: selectedCliente.cpf ? formatarCPF(selectedCliente.cpf) : null },
                { label: 'E-mail', value: selectedCliente.email },
                { label: 'Nascimento', value: selectedCliente.data_nascimento ? new Date(selectedCliente.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : null },
                { label: 'Endereço', value: selectedCliente.endereco?.logradouro ? `${selectedCliente.endereco.logradouro}${selectedCliente.endereco.numero ? ', ' + selectedCliente.endereco.numero : ''} — ${selectedCliente.endereco.cidade}/${selectedCliente.endereco.estado}` : null },
              ].map(row => row.value ? (
                <div key={row.label} style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{row.label}</p>
                  <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{row.value}</p>
                </div>
              ) : null)}
            </div>
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                Cadastrado em {new Date(selectedCliente.created_at).toLocaleDateString('pt-BR')}
              </p>
              <button style={{
                width: '100%', padding: '10px', background: '#2563eb', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>+ Nova OS para este cliente</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👈</div>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Selecione um cliente para ver os detalhes</p>
          </div>
        )}
      </div>

      {/* MODAL */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: 20,
          }}
          onClick={() => setDropdown(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                {editId ? 'Editar cliente' : 'Novo cliente'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '10px 12px', fontSize: 12, color: '#dc2626', wordBreak: 'break-word' }}>
                  <strong>Erro:</strong> {error}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                {/* NOME com dropdown */}
                <div style={{ gridColumn: '1/-1', position: 'relative' }}>
                  <label style={lbl}>Nome *</label>
                  <input
                    style={inp}
                    value={form.nome}
                    onChange={e => handleFormField('nome', e.target.value)}
                    onFocus={() => setActiveField('nome')}
                    onBlur={() => setTimeout(() => setDropdown(null), 150)}
                    placeholder="Nome completo"
                    autoComplete="off"
                  />
                  <Dropdown
                    results={dropdown?.field === 'nome' ? dropdown.results : []}
                    query={form.nome}
                    field="nome"
                    onSelect={selectFromDropdown}
                    visible={activeField === 'nome' && dropdown?.field === 'nome'}
                  />
                </div>

                {/* TELEFONE com dropdown */}
                <div style={{ position: 'relative' }}>
                  <label style={lbl}>Telefone</label>
                  <input
                    style={{ ...inp, borderColor: telErro ? '#ef4444' : '#e2e8f0' }}
                    value={form.telefone}
                    onChange={e => handleFormField('telefone', formatarTelefone(e.target.value))}
                    onFocus={() => setActiveField('telefone')}
                    onBlur={() => setTimeout(() => setDropdown(null), 150)}
                    placeholder="(11) 99999-9999"
                    autoComplete="off"
                  />
                  {telErro && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{telErro}</p>}
                  <Dropdown
                    results={dropdown?.field === 'telefone' ? dropdown.results : []}
                    query={form.telefone}
                    field="telefone"
                    onSelect={selectFromDropdown}
                    visible={activeField === 'telefone' && dropdown?.field === 'telefone'}
                  />
                </div>

                {/* CPF com dropdown */}
                <div style={{ position: 'relative' }}>
                  <label style={lbl}>CPF</label>
                  <input
                    style={{ ...inp, borderColor: cpfErro ? '#ef4444' : '#e2e8f0' }}
                    value={form.cpf}
                    onChange={e => handleFormField('cpf', formatarCPF(e.target.value))}
                    onFocus={() => setActiveField('cpf')}
                    onBlur={() => setTimeout(() => setDropdown(null), 150)}
                    placeholder="000.000.000-00"
                    autoComplete="off"
                  />
                  {cpfErro && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{cpfErro}</p>}
                  <Dropdown
                    results={dropdown?.field === 'cpf' ? dropdown.results : []}
                    query={form.cpf}
                    field="cpf"
                    onSelect={selectFromDropdown}
                    visible={activeField === 'cpf' && dropdown?.field === 'cpf'}
                  />
                </div>

                <div>
                  <label style={lbl}>E-mail</label>
                  <input style={inp} type="email" value={form.email} onChange={e => handleFormField('email', e.target.value)} placeholder="email@exemplo.com" />
                </div>

                <div>
                  <label style={lbl}>Data de nascimento</label>
                  <input style={inp} type="date" value={form.data_nascimento} onChange={e => handleFormField('data_nascimento', e.target.value)} />
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 10 }}>ENDEREÇO</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={lbl}>CEP</label>
                    <input style={inp} value={form.cep}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
                        handleFormField('cep', v)
                        if (v.replace(/\D/g, '').length === 8) fetchCEP(v)
                      }}
                      placeholder="00000-000" />
                  </div>
                  <div>
                    <label style={lbl}>Número</label>
                    <input style={inp} value={form.numero} onChange={e => handleFormField('numero', e.target.value)} placeholder="123" />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={lbl}>Logradouro</label>
                    <input style={inp} value={form.logradouro} onChange={e => handleFormField('logradouro', e.target.value)} placeholder="Rua, Avenida..." />
                  </div>
                  <div>
                    <label style={lbl}>Bairro</label>
                    <input style={inp} value={form.bairro} onChange={e => handleFormField('bairro', e.target.value)} placeholder="Bairro" />
                  </div>
                  <div>
                    <label style={lbl}>Complemento</label>
                    <input style={inp} value={form.complemento} onChange={e => handleFormField('complemento', e.target.value)} placeholder="Apto, sala..." />
                  </div>
                  <div>
                    <label style={lbl}>Cidade</label>
                    <input style={inp} value={form.cidade} onChange={e => handleFormField('cidade', e.target.value)} placeholder="Cidade" />
                  </div>
                  <div>
                    <label style={lbl}>Estado</label>
                    <input style={inp} value={form.estado} onChange={e => handleFormField('estado', e.target.value)} placeholder="SP" maxLength={2} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{
                padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: 13, fontWeight: 500, background: '#fff', cursor: 'pointer', color: '#374151',
              }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb',
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer',
              }}>{saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

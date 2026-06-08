'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type OSResult = {
  id: string
  numero: number
  status: string
  modelo: string | null
  defeito_relatado: string
  solucao: string | null
  valor_final: number | null
  valor_orcamento: number | null
  created_at: string
  clientes: { nome: string; telefone: string | null } | null
}

type Garantia = {
  id: string
  status: string
  motivo_retorno: string
  justificativa: string | null
  created_at: string
  os_origem: { numero: number; modelo: string | null } | null
  os_garantia: { numero: number } | null
}

const STATUS_GARANTIA: Record<string, { label: string; bg: string; color: string }> = {
  aberta:               { label: 'Aberta',             bg: '#eff6ff', color: '#1d4ed8' },
  aprovada:             { label: 'Aprovada',            bg: '#ecfdf5', color: '#065f46' },
  negada:               { label: 'Negada',              bg: '#fef2f2', color: '#991b1b' },
  parcial:              { label: 'Parcial',             bg: '#fef3c7', color: '#92400e' },
  acionando_fornecedor: { label: 'Acionando fornecedor', bg: '#faf5ff', color: '#6b21a8' },
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }

export default function GarantiasPage() {
  const supabase = createClient()
  const router = useRouter()
  const [aba, setAba] = useState<'buscar' | 'historico'>('buscar')

  // Busca OS
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [osEncontrada, setOsEncontrada] = useState<OSResult | null>(null)
  const [erroBusca, setErroBusca] = useState('')

  // Form garantia
  const [motivo, setMotivo] = useState('')
  const [acao, setAcao] = useState<'aprovada' | 'negada' | 'parcial' | 'acionando_fornecedor' | ''>('')
  const [justificativa, setJustificativa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)

  // Histórico
  const [garantias, setGarantias] = useState<Garantia[]>([])
  const [loadingHist, setLoadingHist] = useState(false)

  async function buscarOS() {
    const num = busca.replace(/\D/g, '')
    if (!num) return
    setBuscando(true); setErroBusca(''); setOsEncontrada(null); setSucesso(false)

    const { data } = await supabase
      .from('ordens_servico')
      .select('*,clientes(nome,telefone)')
      .eq('numero', parseInt(num))
      .is('deleted_at', null)
      .single()

    if (!data) { setErroBusca(`OS #${num} não encontrada.`); setBuscando(false); return }

    setOsEncontrada(data as unknown as OSResult)
    setBuscando(false)
  }

  function diasDesdeOS(created_at: string) {
    return Math.floor((Date.now() - new Date(created_at).getTime()) / (1000 * 60 * 60 * 24))
  }

  function dentroDoPrazo(created_at: string) {
    return diasDesdeOS(created_at) <= 90
  }

  async function registrarGarantia() {
    if (!osEncontrada || !motivo.trim() || !acao) return
    setSalvando(true)

    // Cria a garantia
    const { data: garantia } = await supabase.from('garantias').insert({
      os_origem_id: osEncontrada.id,
      status: acao,
      motivo_retorno: motivo.trim(),
      justificativa: justificativa || null,
    }).select('id').single()

    // Se aprovada ou parcial → abre nova OS vinculada
    if ((acao === 'aprovada' || acao === 'parcial') && garantia) {
      const { data: novaOS } = await supabase.from('ordens_servico').insert({
        cliente_id: null,
        modelo: osEncontrada.modelo,
        defeito_relatado: `[GARANTIA OS #${osEncontrada.numero}] ${motivo}`,
        status: 'aberta',
        valor_orcamento: acao === 'parcial' ? osEncontrada.valor_final : 0,
        observacoes: JSON.stringify({ texto: `Garantia da OS #${osEncontrada.numero}` }),
      }).select('id').single()

      if (novaOS) {
        await supabase.from('garantias').update({ os_garantia_id: novaOS.id }).eq('id', garantia.id)
      }
    }

    // Emite evento
    await supabase.from('events').insert({
      type: 'GARANTIA_REGISTRADA', entity: 'garantia',
      payload: { os_origem: osEncontrada.numero, acao, motivo },
    })

    setSalvando(false); setSucesso(true)
    setOsEncontrada(null); setBusca(''); setMotivo(''); setAcao(''); setJustificativa('')
  }

  const fetchHistorico = useCallback(async () => {
    setLoadingHist(true)
    const { data } = await supabase
      .from('garantias')
      .select('*,os_origem:os_origem_id(numero,modelo),os_garantia:os_garantia_id(numero)')
      .order('created_at', { ascending: false })
      .limit(50)
    setGarantias((data ?? []) as unknown as Garantia[])
    setLoadingHist(false)
  }, [supabase])

  function onAbaHistorico() { setAba('historico'); fetchHistorico() }

  const dias = osEncontrada ? diasDesdeOS(osEncontrada.created_at) : 0
  const prazoOk = osEncontrada ? dentroDoPrazo(osEncontrada.created_at) : false

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Central de Garantias</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Registre retornos, aprove ou negue garantias e acione fornecedores</p>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
        {([['buscar', '🔍 Registrar garantia'], ['historico', '📋 Histórico']] as const).map(([k, l]) => (
          <button key={k} onClick={() => k === 'historico' ? onAbaHistorico() : setAba(k)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === k ? '#6366f1' : '#64748b', borderBottom: aba === k ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {/* ═══ ABA BUSCAR ═══ */}
      {aba === 'buscar' && (
        <div>
          {sucesso && (
            <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#065f46', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <p style={{ fontWeight: 600 }}>Garantia registrada com sucesso!</p>
                <p style={{ marginTop: 2, opacity: 0.8 }}>Se aprovada ou parcial, uma nova OS foi aberta automaticamente.</p>
              </div>
            </div>
          )}

          {/* Busca */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>🔍 Buscar OS pelo número</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                style={{ ...inp, flex: 1, fontSize: 16 }}
                value={busca}
                onChange={e => setBusca(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarOS()}
                placeholder="Número da OS (ex: 42)"
                type="number"
              />
              <button onClick={buscarOS} disabled={buscando} style={{ padding: '9px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {buscando ? 'Buscando...' : 'Buscar OS'}
              </button>
            </div>
            {erroBusca && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>{erroBusca}</p>}
          </div>

          {/* OS encontrada */}
          {osEncontrada && (
            <div>
              {/* Card da OS */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>OS #{osEncontrada.numero}</h2>
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 20,
                        background: prazoOk ? '#ecfdf5' : '#fef2f2',
                        color: prazoOk ? '#065f46' : '#991b1b',
                      }}>
                        {prazoOk ? `✓ Dentro do prazo (${dias} dias)` : `⚠ Fora do prazo (${dias} dias)`}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                      {osEncontrada.clientes?.nome ?? 'Cliente não identificado'} · {osEncontrada.modelo ?? '—'}
                    </p>
                  </div>
                  <button onClick={() => router.push(`/os/${osEncontrada.id}`)} style={{ fontSize: 12, color: '#6366f1', background: '#f5f3ff', border: '1px solid #e0e7ff', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>
                    Abrir OS →
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Defeito original</p>
                    <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{osEncontrada.defeito_relatado}</p>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Solução aplicada</p>
                    <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{osEncontrada.solucao ?? 'Não registrada'}</p>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Valor cobrado</p>
                    <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>
                      {osEncontrada.valor_final ? `R$ ${osEncontrada.valor_final.toFixed(2).replace('.', ',')}` : osEncontrada.valor_orcamento ? `R$ ${osEncontrada.valor_orcamento.toFixed(2).replace('.', ',')}` : '—'}
                    </p>
                  </div>
                </div>

                {!prazoOk && (
                  <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991b1b' }}>
                    ⚠ Esta OS está <strong>fora do prazo de garantia de 90 dias</strong>. Você ainda pode registrar a garantia, mas isso ficará documentado como exceção.
                  </div>
                )}
              </div>

              {/* Formulário de garantia */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>📝 Registrar retorno em garantia</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={lbl}>Motivo do retorno *</label>
                    <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Descreva o que o cliente relatou ao retornar..." />
                  </div>

                  <div>
                    <label style={lbl}>Ação a tomar *</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {[
                        { v: 'aprovada',             icon: '✅', label: 'Aprovar garantia',         sub: 'Refazer o serviço sem custo',          color: '#065f46', bg: '#ecfdf5', border: '#bbf7d0' },
                        { v: 'parcial',              icon: '🔄', label: 'Garantia parcial',          sub: 'Cliente paga parte (mão de obra)',     color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
                        { v: 'negada',               icon: '❌', label: 'Negar garantia',            sub: 'Mal uso, queda, dano externo',         color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
                        { v: 'acionando_fornecedor', icon: '🏭', label: 'Acionar fornecedor',        sub: 'Peça com defeito de fábrica',          color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setAcao(opt.v as typeof acao)} style={{
                          padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                          border: `1.5px solid ${acao === opt.v ? opt.border : '#e2e8f0'}`,
                          background: acao === opt.v ? opt.bg : '#fff',
                        }}>
                          <div style={{ fontSize: 16, marginBottom: 3 }}>{opt.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: acao === opt.v ? opt.color : '#374151' }}>{opt.label}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{opt.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {(acao === 'negada' || acao === 'parcial' || acao === 'acionando_fornecedor') && (
                    <div>
                      <label style={lbl}>Justificativa {acao === 'negada' ? '(obrigatória para negativa)' : '(opcional)'}</label>
                      <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder={acao === 'negada' ? 'Ex: Aparelho apresenta sinais de queda — garantia não cobre danos físicos...' : 'Detalhes adicionais...'} />
                    </div>
                  )}

                  {acao && (
                    <div style={{ background: '#f8f7ff', border: '1px solid #e0e7ff', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#4338ca' }}>
                      {acao === 'aprovada' && '✅ Uma nova OS será aberta automaticamente vinculada a esta, com custo R$ 0,00.'}
                      {acao === 'parcial' && '🔄 Uma nova OS será aberta para cobrar a mão de obra. O sistema vinculará à OS original.'}
                      {acao === 'negada' && '❌ A garantia será negada e registrada no histórico. Nenhuma nova OS será aberta.'}
                      {acao === 'acionando_fornecedor' && '🏭 O retorno será registrado no histórico do fornecedor, impactando o ranking de confiabilidade.'}
                    </div>
                  )}

                  <button onClick={registrarGarantia} disabled={salvando || !motivo.trim() || !acao || (acao === 'negada' && !justificativa.trim())} style={{
                    padding: '12px', background: !motivo.trim() || !acao ? '#e2e8f0' : salvando ? '#a5b4fc' : '#6366f1',
                    color: !motivo.trim() || !acao ? '#94a3b8' : '#fff',
                    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                    cursor: !motivo.trim() || !acao ? 'not-allowed' : 'pointer',
                  }}>
                    {salvando ? 'Registrando...' : 'Registrar garantia'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ ABA HISTÓRICO ═══ */}
      {aba === 'historico' && (
        loadingHist ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div> :
        garantias.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🛡</div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhuma garantia registrada ainda</p>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['OS Origem', 'Nova OS', 'Motivo', 'Ação', 'Data'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {garantias.map(g => {
                  const st = STATUS_GARANTIA[g.status] ?? STATUS_GARANTIA.aberta
                  return (
                    <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontWeight: 600, color: '#6366f1' }}>#{g.os_origem?.numero}</span>
                        {g.os_origem?.modelo && <div style={{ fontSize: 11, color: '#94a3b8' }}>{g.os_origem.modelo}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#374151' }}>
                        {g.os_garantia ? <span style={{ fontWeight: 500, color: '#6366f1' }}>#{g.os_garantia.numero}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.motivo_retorno}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>{new Date(g.created_at).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

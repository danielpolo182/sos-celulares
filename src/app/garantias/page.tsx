'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type OSResult = {
  id: string; numero: number; status: string; modelo: string | null
  defeito_relatado: string; solucao: string | null
  valor_final: number | null; valor_orcamento: number | null
  created_at: string
  clientes: { nome: string; telefone: string | null } | null
}

type Garantia = {
  id: string; numero: number; status: string; motivo_retorno: string
  justificativa: string | null; created_at: string
  os_origem: { numero: number; modelo: string | null } | null
  os_garantia: { numero: number } | null
  fornecedores_destino: { nome: string } | null
}

type Fornecedor = { id: string; nome: string; telefone: string | null }

const STATUS_GARANTIA: Record<string, { label: string; bg: string; color: string }> = {
  aberta:               { label: 'Aberta',             bg: '#eff6ff', color: '#1d4ed8' },
  aprovada:             { label: 'Aprovada',            bg: '#ecfdf5', color: '#065f46' },
  negada:               { label: 'Negada',              bg: '#fef2f2', color: '#991b1b' },
  parcial:              { label: 'Parcial',             bg: '#fef3c7', color: '#92400e' },
  acionando_fornecedor: { label: 'Acion. fornecedor',  bg: '#faf5ff', color: '#6b21a8' },
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }

export default function GarantiasPage() {
  const supabase = createClient()
  const router = useRouter()
  const [aba, setAba] = useState<'buscar' | 'historico'>('buscar')
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [osEncontrada, setOsEncontrada] = useState<OSResult | null>(null)
  const [erroBusca, setErroBusca] = useState('')
  const [motivo, setMotivo] = useState('')
  const [acao, setAcao] = useState<'aprovada' | 'negada' | 'parcial' | 'acionando_fornecedor' | ''>('')
  const [justificativa, setJustificativa] = useState('')
  const [fornecedorDestino, setFornecedorDestino] = useState('')
  const [obsForncedor, setObsFornecedor] = useState('')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [salvando, setSalvando] = useState(false)
  const [garantiaSalva, setGarantiaSalva] = useState<{ numero: number; acao: string; fornecedor: string | null } | null>(null)
  const [garantias, setGarantias] = useState<Garantia[]>([])
  const [loadingHist, setLoadingHist] = useState(false)

  async function buscarOS() {
    const num = busca.replace(/\D/g, '')
    if (!num) return
    setBuscando(true); setErroBusca(''); setOsEncontrada(null); setGarantiaSalva(null)

    const [{ data }, { data: forn }] = await Promise.all([
      supabase.from('ordens_servico').select('*,clientes(nome,telefone)').eq('numero', parseInt(num)).is('deleted_at', null).single(),
      supabase.from('fornecedores').select('id,nome,telefone').eq('ativo', true).order('nome'),
    ])

    if (!data) { setErroBusca(`OS #${num} não encontrada.`); setBuscando(false); return }
    setOsEncontrada(data as unknown as OSResult)
    setFornecedores((forn ?? []) as Fornecedor[])
    setBuscando(false)
  }

  function diasDesde(dt: string) { return Math.floor((Date.now() - new Date(dt).getTime()) / (1000 * 60 * 60 * 24)) }
  function dentroPrazo(dt: string) { return diasDesde(dt) <= 90 }

  async function registrarGarantia() {
    if (!osEncontrada || !motivo.trim() || !acao) return
    setSalvando(true)

    const fornNome = fornecedores.find(f => f.id === fornecedorDestino)?.nome ?? null

    const { data: garantia } = await supabase.from('garantias').insert({
      os_origem_id: osEncontrada.id, status: acao,
      motivo_retorno: motivo.trim(), justificativa: justificativa || null,
      fornecedor_destino_id: fornecedorDestino || null,
      observacoes_fornecedor: obsForncedor || null,
    }).select('id,numero').single()

    if ((acao === 'aprovada' || acao === 'parcial') && garantia) {
      const { data: novaOS } = await supabase.from('ordens_servico').insert({
        modelo: osEncontrada.modelo,
        defeito_relatado: `[GARANTIA OS #${osEncontrada.numero}] ${motivo}`,
        status: 'aberta',
        valor_orcamento: acao === 'parcial' ? osEncontrada.valor_final : 0,
        observacoes: JSON.stringify({ texto: `Garantia da OS #${osEncontrada.numero}` }),
      }).select('id').single()

      if (novaOS) await supabase.from('garantias').update({ os_garantia_id: novaOS.id }).eq('id', garantia.id)
    }

    await supabase.from('events').insert({
      type: 'GARANTIA_REGISTRADA', entity: 'garantia',
      payload: { os_origem: osEncontrada.numero, acao, motivo, fornecedor: fornNome },
    })

    setGarantiaSalva({ numero: garantia?.numero ?? 0, acao, fornecedor: fornNome })
    setSalvando(false)
    setOsEncontrada(null); setBusca(''); setMotivo(''); setAcao(''); setJustificativa(''); setFornecedorDestino(''); setObsFornecedor('')
  }

  function imprimirReciboFornecedor() {
    if (!garantiaSalva || !osEncontrada) return
    const forn = fornecedores.find(f => f.id === fornecedorDestino)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo Garantia</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;max-width:300px;margin:0 auto;padding:16px}
    .center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between;margin:4px 0}
    .title{font-size:14px;font-weight:bold;text-align:center;margin-bottom:4px}</style></head><body>
    <div class="title">SOS Celulares</div>
    <div class="center" style="font-size:9px;margin-bottom:8px">RECIBO DE DEVOLUÇÃO AO FORNECEDOR</div>
    <div class="line"></div>
    <div class="row"><span>Garantia Nº</span><span class="bold">#${garantiaSalva.numero}</span></div>
    <div class="row"><span>Data</span><span>${new Date().toLocaleDateString('pt-BR')}</span></div>
    <div class="line"></div>
    <div class="bold" style="margin-bottom:4px">FORNECEDOR</div>
    <div>${forn?.nome ?? '—'}</div>
    ${forn?.telefone ? `<div>${forn.telefone}</div>` : ''}
    <div class="line"></div>
    <div class="bold" style="margin-bottom:4px">PRODUTO / PEÇA</div>
    <div>${osEncontrada?.modelo ?? '—'}</div>
    <div class="line"></div>
    <div class="bold" style="margin-bottom:4px">MOTIVO DA DEVOLUÇÃO</div>
    <div style="line-height:1.5">${motivo}</div>
    ${obsForncedor ? `<div style="margin-top:4px;font-style:italic">${obsForncedor}</div>` : ''}
    <div class="line"></div>
    <div class="row"><span>OS de origem</span><span class="bold">#${osEncontrada?.numero}</span></div>
    <div class="line"></div>
    <div style="margin-top:16px;font-size:9px;text-align:center">Assinatura do recebedor</div>
    <div style="border-top:1px solid #000;margin-top:24px;padding-top:4px;font-size:9px;text-align:center">_________________________</div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`
    const w = window.open('', '_blank'); w?.document.write(html); w?.document.close()
  }

  const fetchHistorico = useCallback(async () => {
    setLoadingHist(true)
    const { data } = await supabase.from('garantias')
      .select('*,os_origem:os_origem_id(numero,modelo),os_garantia:os_garantia_id(numero),fornecedores_destino:fornecedor_destino_id(nome)')
      .order('created_at', { ascending: false }).limit(50)
    setGarantias((data ?? []) as unknown as Garantia[])
    setLoadingHist(false)
  }, [supabase])

  const dias = osEncontrada ? diasDesde(osEncontrada.created_at) : 0
  const prazoOk = osEncontrada ? dentroPrazo(osEncontrada.created_at) : false

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Central de Garantias</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Registre retornos, aprove ou negue e acione fornecedores</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
        {([['buscar', '🔍 Registrar'], ['historico', '📋 Histórico']] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setAba(k); if (k === 'historico') fetchHistorico() }} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === k ? '#6366f1' : '#64748b', borderBottom: aba === k ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {aba === 'buscar' && (
        <div>
          {/* Sucesso */}
          {garantiaSalva && (
            <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#065f46', marginBottom: 8 }}>✅ Garantia #{garantiaSalva.numero} registrada!</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {garantiaSalva.fornecedor && (
                  <button onClick={imprimirReciboFornecedor} style={{ padding: '8px 16px', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#065f46', fontWeight: 500 }}>
                    🖨 Imprimir recibo do fornecedor
                  </button>
                )}
                <button onClick={() => setGarantiaSalva(null)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                  Nova garantia
                </button>
              </div>
            </div>
          )}

          {/* Busca */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>🔍 Buscar OS pelo número</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <input style={{ ...inp, flex: 1, fontSize: 16 }} value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarOS()} placeholder="Número da OS (ex: 42)" type="number" />
              <button onClick={buscarOS} disabled={buscando} style={{ padding: '9px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {erroBusca && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>{erroBusca}</p>}
          </div>

          {osEncontrada && (
            <div>
              {/* Card OS */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>OS #{osEncontrada.numero}</h2>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 20, background: prazoOk ? '#ecfdf5' : '#fef2f2', color: prazoOk ? '#065f46' : '#991b1b' }}>
                        {prazoOk ? `✓ No prazo (${dias} dias)` : `⚠ Fora do prazo (${dias} dias)`}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: '#64748b' }}>{osEncontrada.clientes?.nome ?? '—'} · {osEncontrada.modelo ?? '—'}</p>
                  </div>
                  <button onClick={() => router.push(`/os/${osEncontrada.id}`)} style={{ fontSize: 12, color: '#6366f1', background: '#f5f3ff', border: '1px solid #e0e7ff', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Ver OS →</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[{ label: 'Defeito original', value: osEncontrada.defeito_relatado }, { label: 'Solução aplicada', value: osEncontrada.solucao ?? 'Não registrada' }, { label: 'Valor cobrado', value: osEncontrada.valor_final ? `R$ ${osEncontrada.valor_final.toFixed(2).replace('.', ',')}` : '—' }].map(r => (
                    <div key={r.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{r.label}</p>
                      <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{r.value}</p>
                    </div>
                  ))}
                </div>
                {!prazoOk && <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991b1b' }}>⚠ Fora do prazo de 90 dias. A garantia pode ser aprovada como exceção.</div>}
              </div>

              {/* Formulário */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>📝 Registrar retorno em garantia</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={lbl}>Motivo do retorno *</label>
                    <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="O que o cliente relatou..." />
                  </div>

                  <div>
                    <label style={lbl}>Ação *</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {[
                        { v: 'aprovada',             icon: '✅', label: 'Aprovar garantia',   sub: 'Refazer sem custo',           color: '#065f46', bg: '#ecfdf5', border: '#bbf7d0' },
                        { v: 'parcial',              icon: '🔄', label: 'Garantia parcial',   sub: 'Cliente paga mão de obra',    color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
                        { v: 'negada',               icon: '❌', label: 'Negar garantia',     sub: 'Mal uso, queda, dano externo', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
                        { v: 'acionando_fornecedor', icon: '🏭', label: 'Acionar fornecedor', sub: 'Defeito de fábrica da peça',   color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setAcao(opt.v as typeof acao)} style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${acao === opt.v ? opt.border : '#e2e8f0'}`, background: acao === opt.v ? opt.bg : '#fff' }}>
                          <div style={{ fontSize: 16, marginBottom: 3 }}>{opt.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: acao === opt.v ? opt.color : '#374151' }}>{opt.label}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{opt.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {(acao === 'negada' || acao === 'parcial') && (
                    <div>
                      <label style={lbl}>Justificativa</label>
                      <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Detalhe o motivo..." />
                    </div>
                  )}

                  {acao === 'acionando_fornecedor' && (
                    <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '14px 16px' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#6b21a8', marginBottom: 12 }}>🏭 Destinar ao fornecedor</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <label style={lbl}>Fornecedor da peça *</label>
                          <select style={inp} value={fornecedorDestino} onChange={e => setFornecedorDestino(e.target.value)}>
                            <option value="">Selecione o fornecedor...</option>
                            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}{f.telefone ? ` — ${f.telefone}` : ''}</option>)}
                          </select>
                          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Este registro impactará automaticamente o ranking de confiabilidade do fornecedor.</p>
                        </div>
                        <div>
                          <label style={lbl}>Observações para o fornecedor</label>
                          <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={obsForncedor} onChange={e => setObsFornecedor(e.target.value)} placeholder="Ex: Display apresentou defeito após 15 dias de uso..." />
                        </div>
                        {fornecedorDestino && (
                          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#374151' }}>
                            📄 Um recibo de devolução será gerado após salvar para identificar a peça junto ao fornecedor.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {acao && (
                    <div style={{ background: '#f8f7ff', border: '1px solid #e0e7ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#4338ca' }}>
                      {acao === 'aprovada' && '✅ Uma nova OS será aberta automaticamente com custo R$ 0,00.'}
                      {acao === 'parcial' && '🔄 Nova OS aberta para cobrar a mão de obra.'}
                      {acao === 'negada' && '❌ Registrado no histórico. Nenhuma OS será aberta.'}
                      {acao === 'acionando_fornecedor' && '🏭 Retorno registrado no histórico do fornecedor. Ranking atualizado automaticamente.'}
                    </div>
                  )}

                  <button onClick={registrarGarantia} disabled={salvando || !motivo.trim() || !acao || (acao === 'acionando_fornecedor' && !fornecedorDestino)} style={{ padding: '12px', background: !motivo.trim() || !acao || (acao === 'acionando_fornecedor' && !fornecedorDestino) ? '#e2e8f0' : salvando ? '#a5b4fc' : '#6366f1', color: !motivo.trim() || !acao || (acao === 'acionando_fornecedor' && !fornecedorDestino) ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    {salvando ? 'Registrando...' : 'Registrar garantia'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {aba === 'historico' && (
        loadingHist ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div> :
        garantias.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}><div style={{ fontSize: 40, marginBottom: 12 }}>🛡</div><p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhuma garantia registrada ainda</p></div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['#', 'OS Origem', 'Nova OS', 'Motivo', 'Fornecedor', 'Ação', 'Data'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {garantias.map(g => {
                  const st = STATUS_GARANTIA[g.status] ?? STATUS_GARANTIA.aberta
                  return (
                    <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>#{g.numero}</td>
                      <td style={{ padding: '12px 16px' }}><span style={{ fontWeight: 600, color: '#6366f1' }}>#{g.os_origem?.numero}</span>{g.os_origem?.modelo && <div style={{ fontSize: 11, color: '#94a3b8' }}>{g.os_origem.modelo}</div>}</td>
                      <td style={{ padding: '12px 16px' }}>{g.os_garantia ? <span style={{ fontWeight: 500, color: '#6366f1' }}>#{g.os_garantia.numero}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td style={{ padding: '12px 16px', color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.motivo_retorno}</td>
                      <td style={{ padding: '12px 16px', color: '#374151', fontSize: 12 }}>{g.fornecedores_destino?.nome ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span></td>
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

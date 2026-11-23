'use client'
// Entrega do aparelho: busca a OS aberta por número, nome ou telefone, recebe o
// pagamento (PIX com QR code, cartão na maquininha ou dinheiro) e conclui a OS.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type OS = {
  id: string; numero: number; status: string; marca: string | null; modelo: string | null
  valor_final: number | null; valor_orcamento: number | null; desconto: number | null; pago: boolean | null
  created_at: string
  clientes: { nome: string | null; telefone: string | null } | { nome: string | null; telefone: string | null }[] | null
}
type Forma = 'pix' | 'debito' | 'credito' | 'dinheiro'
type Pix = { cobrancaId: string; qrCodeBase64: string; pixCopiaCola: string; expiraEm: string }

const STATUS: Record<string, { rotulo: string; cor: string; fundo: string }> = {
  pronta: { rotulo: 'Pronta', cor: '#166534', fundo: '#dcfce7' },
  em_andamento: { rotulo: 'Em andamento', cor: '#92400e', fundo: '#fef3c7' },
  em_reparo: { rotulo: 'Em reparo', cor: '#92400e', fundo: '#fef3c7' },
  aberta: { rotulo: 'Aberta', cor: '#1e40af', fundo: '#dbeafe' },
  aguardando_diagnostico: { rotulo: 'Aguardando diagnóstico', cor: '#475569', fundo: '#f1f5f9' },
  em_orcamento: { rotulo: 'Em orçamento', cor: '#475569', fundo: '#f1f5f9' },
  aguardando_aprovacao_cliente: { rotulo: 'Aguardando aprovação', cor: '#475569', fundo: '#f1f5f9' },
  aguardando_peca: { rotulo: 'Aguardando peça', cor: '#475569', fundo: '#f1f5f9' },
  aguardando: { rotulo: 'Aguardando', cor: '#475569', fundo: '#f1f5f9' },
}
const FORMAS: { key: Forma; rotulo: string; icone: string }[] = [
  { key: 'pix', rotulo: 'PIX', icone: 'ti-qrcode' },
  { key: 'debito', rotulo: 'Débito', icone: 'ti-credit-card' },
  { key: 'credito', rotulo: 'Crédito', icone: 'ti-credit-card' },
  { key: 'dinheiro', rotulo: 'Dinheiro', icone: 'ti-cash' },
]
const COLUNAS = 'id,numero,status,marca,modelo,valor_final,valor_orcamento,desconto,pago,created_at,clientes(nome,telefone)'

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (t: string) => { const n = parseFloat(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN }
const clienteDe = (o: OS) => (Array.isArray(o.clientes) ? o.clientes[0] : o.clientes) ?? { nome: null, telefone: null }
const aparelhoDe = (o: OS) => o.modelo?.trim() || o.marca?.trim() || 'Aparelho sem modelo'
const valorDe = (o: OS) => Math.max(0, Number(o.valor_final ?? o.valor_orcamento ?? 0) - Number(o.desconto ?? 0))

const campo = { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' } as const
const rotulo = { fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 } as const

export default function EntregarDispositivo() {
  const supabase = useRef(createClient()).current
  const [busca, setBusca] = useState('')
  const [ordens, setOrdens] = useState<OS[]>([])
  const [carregando, setCarregando] = useState(true)
  const [maxParcelas, setMaxParcelas] = useState(10)
  const [aberta, setAberta] = useState<OS | null>(null)
  const [recado, setRecado] = useState<{ texto: string; ok: boolean } | null>(null)

  const carregar = useCallback(async (termoBruto: string) => {
    setCarregando(true)
    const termo = termoBruto.trim().replace(/[,()%]/g, ' ').trim()
    let consulta = supabase.from('ordens_servico').select(COLUNAS).is('deleted_at', null)
      .not('status', 'in', '(entregue,cancelada)').order('created_at', { ascending: false }).limit(60)
    if (termo.length >= 1) {
      const digitos = termo.replace(/\D/g, '')
      const filtros: string[] = []
      if (digitos && digitos === termo && digitos.length <= 7) filtros.push(`numero.eq.${parseInt(digitos, 10)}`)
      if (termo.length >= 2) {
        const doCliente = [`nome.ilike.%${termo}%`]
        if (digitos.length >= 3) doCliente.push(`telefone.ilike.%${digitos}%`)
        const { data: clientes } = await supabase.from('clientes').select('id').is('deleted_at', null).or(doCliente.join(',')).limit(100)
        const ids = (clientes ?? []).map(c => c.id as string)
        if (ids.length > 0) filtros.push(`cliente_id.in.(${ids.join(',')})`)
        filtros.push(`modelo.ilike.%${termo}%`)
      }
      if (filtros.length === 0) { setOrdens([]); setCarregando(false); return }
      consulta = consulta.or(filtros.join(','))
    }
    const { data } = await consulta
    // Prontas primeiro: são as que o cliente vem buscar
    const lista = ((data ?? []) as unknown as OS[]).sort((a, b) => Number(b.status === 'pronta') - Number(a.status === 'pronta'))
    setOrdens(lista)
    setCarregando(false)
  }, [supabase])

  useEffect(() => { const t = setTimeout(() => carregar(busca), 300); return () => clearTimeout(t) }, [busca, carregar])

  useEffect(() => {
    supabase.from('sistema_config').select('valor').eq('chave', 'formas_pgto_taxas').limit(1).then(({ data }) => {
      try {
        const formas = JSON.parse(String(data?.[0]?.valor ?? '[]')) as { key: string; max_parcelas?: number }[]
        const parcelado = formas.find(f => f.key === 'credito_parcela')
        if (parcelado?.max_parcelas && parcelado.max_parcelas >= 1) setMaxParcelas(Math.min(24, parcelado.max_parcelas))
      } catch { /* sem configuração: vale o padrão */ }
    })
  }, [supabase])

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Entregar dispositivo</h1>
      <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 16px' }}>Busque pelo número da OS, pelo nome do cliente ou pelo telefone. Clique na ordem para receber o pagamento e concluir a entrega.</p>

      <input name="busca-entrega" autoFocus autoComplete="off" placeholder="Nº da OS, nome ou telefone" value={busca} onChange={e => setBusca(e.target.value)}
        style={{ ...campo, fontSize: 18, padding: '14px 16px', borderRadius: 10 }} />

      {recado && (
        <div role="status" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: recado.ok ? '#f0fdf4' : '#fffbeb', color: recado.ok ? '#166534' : '#92400e', border: `1px solid ${recado.ok ? '#bbf7d0' : '#fde68a'}` }}>
          {recado.texto}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
        {ordens.map(o => {
          const st = STATUS[o.status] ?? { rotulo: o.status, cor: '#475569', fundo: '#f1f5f9' }
          const c = clienteDe(o)
          return (
            <button key={o.id} type="button" onClick={() => { setRecado(null); setAberta(o) }}
              style={{ textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>OS {o.numero}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.cor, background: st.fundo, padding: '3px 8px', borderRadius: 999 }}>{st.rotulo}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 8 }}>{c.nome ?? 'Sem cliente cadastrado'}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{aparelhoDe(o)}{c.telefone ? ` · ${c.telefone}` : ''}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10, color: o.pago ? '#166534' : '#0f172a' }}>
                {o.pago ? 'Já pago' : valorDe(o) > 0 ? reais(valorDe(o)) : 'Sem valor definido'}
              </div>
            </button>
          )
        })}
      </div>
      {!carregando && ordens.length === 0 && (
        <div style={{ marginTop: 28, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          {busca.trim() ? 'Nenhuma ordem em aberto com esses dados.' : 'Nenhuma ordem em aberto.'}
        </div>
      )}

      {aberta && (
        <ModalEntrega os={aberta} maxParcelas={maxParcelas} onFechar={() => setAberta(null)}
          onConcluida={texto => { setAberta(null); setRecado(texto); setBusca(''); carregar('') }} />
      )}
    </div>
  )
}

function ModalEntrega({ os, maxParcelas, onFechar, onConcluida }: {
  os: OS; maxParcelas: number; onFechar: () => void; onConcluida: (r: { texto: string; ok: boolean }) => void
}) {
  const jaPaga = os.pago === true
  const [valorTexto, setValorTexto] = useState(valorDe(os) > 0 ? valorDe(os).toFixed(2).replace('.', ',') : '')
  const [forma, setForma] = useState<Forma | null>(null)
  const [parcelas, setParcelas] = useState(1)
  const [recebidoTexto, setRecebidoTexto] = useState('')
  const [cartaoAprovado, setCartaoAprovado] = useState(false)
  const [pix, setPix] = useState<Pix | null>(null)
  const [pixPago, setPixPago] = useState(false)
  const [pixNaMao, setPixNaMao] = useState(false)
  const [gerandoPix, setGerandoPix] = useState(false)
  const [terceiro, setTerceiro] = useState(false)
  const [nomeTerceiro, setNomeTerceiro] = useState('')
  const [docTerceiro, setDocTerceiro] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const valor = numero(valorTexto)
  const semCobranca = jaPaga || valor === 0
  const recebido = numero(recebidoTexto)
  const troco = forma === 'dinheiro' && !Number.isNaN(recebido) && !Number.isNaN(valor) ? Math.round((recebido - valor) * 100) / 100 : 0
  const cliente = clienteDe(os)

  // Mudou o valor ou a forma: o que já estava conferido deixa de valer
  useEffect(() => { setCartaoAprovado(false) }, [forma, parcelas, valorTexto])
  useEffect(() => { setPix(null); setPixPago(false); setPixNaMao(false) }, [valorTexto])

  // Enquanto o QR está na tela, pergunta ao servidor se o PIX caiu
  useEffect(() => {
    if (!pix || pixPago) return
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/pix/${pix.cobrancaId}/status`).then(x => x.json()) as { status?: string }
        if (r.status === 'aprovado') setPixPago(true)
        if (r.status === 'expirado' || r.status === 'cancelado') { setPix(null); setErro('O QR code expirou. Gere outro.') }
      } catch { /* tenta de novo na próxima volta */ }
    }, 3000)
    return () => clearInterval(t)
  }, [pix, pixPago])

  async function gerarPix() {
    if (Number.isNaN(valor) || valor <= 0) { setErro('Informe o valor a cobrar.'); return }
    setGerandoPix(true); setErro('')
    try {
      const res = await fetch('/api/pix/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenciaId: os.id, tipoReferencia: 'os', valor, modalidade: 'presencial', descricao: `OS #${os.numero} — ${aparelhoDe(os)}` }),
      })
      const json = await res.json()
      if (!res.ok) setErro(json.error || 'Não consegui gerar o PIX.')
      else setPix(json as Pix)
    } catch { setErro('Não consegui gerar o PIX.') }
    setGerandoPix(false)
  }

  const pagamentoOk = semCobranca
    || (forma === 'pix' && (pixPago || pixNaMao))
    || ((forma === 'debito' || forma === 'credito') && cartaoAprovado)
    || (forma === 'dinheiro' && !Number.isNaN(recebido) && recebido >= valor)
  const terceiroOk = !terceiro || (nomeTerceiro.trim().length >= 3 && docTerceiro.trim().length >= 3)
  const podeConcluir = !salvando && !Number.isNaN(jaPaga ? 0 : valor) && pagamentoOk && terceiroOk

  async function concluir() {
    if (!podeConcluir) return
    setSalvando(true); setErro('')
    try {
      const res = await fetch('/api/os/entregar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osId: os.id, valor: jaPaga ? 0 : valor, forma, parcelas,
          valorRecebido: forma === 'dinheiro' ? recebido : undefined,
          pixConferidoNaMao: forma === 'pix' && pixNaMao && !pixPago,
          retirada: terceiro ? { nome: nomeTerceiro, documento: docTerceiro } : undefined,
        }),
      })
      const json = await res.json() as { error?: string; numero?: number; troco?: number; avisos?: string[] }
      if (!res.ok) { setErro(json.error || 'Não consegui concluir a entrega.'); setSalvando(false); return }
      const avisos = json.avisos ?? []
      onConcluida({
        texto: `OS ${json.numero} entregue.${json.troco ? ` Troco: ${reais(json.troco)}.` : ''}${avisos.length ? ' Atenção: ' + avisos.join(' ') : ''}`,
        ok: avisos.length === 0,
      })
    } catch { setErro('Sem conexão com o sistema. Tente de novo.'); setSalvando(false) }
  }

  // PIX confirmado: conclui sozinho, o atendente só entrega o aparelho
  const concluirRef = useRef(concluir)
  concluirRef.current = concluir
  useEffect(() => { if (pixPago && terceiroOk) concluirRef.current() }, [pixPago, terceiroOk])

  const botaoForma = (f: typeof FORMAS[number]) => {
    const ativa = forma === f.key
    return (
      <button key={f.key} type="button" onClick={() => { setForma(f.key); setErro(''); if (f.key !== 'credito') setParcelas(1) }}
        style={{ padding: '12px 6px', borderRadius: 10, border: `2px solid ${ativa ? '#2563eb' : '#e2e8f0'}`, background: ativa ? '#eff6ff' : '#fff', color: ativa ? '#1d4ed8' : '#334155', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
        <i className={`ti ${f.icone}`} style={{ fontSize: 20, display: 'block', marginBottom: 4 }} />{f.rotulo}
      </button>
    )
  }

  return (
    <div role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget && !salvando) onFechar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Entregar OS {os.numero}</div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>{cliente.nome ?? 'Sem cliente cadastrado'} · {aparelhoDe(os)}</div>
          </div>
          <button type="button" onClick={onFechar} disabled={salvando} aria-label="Fechar" style={{ background: 'none', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {os.status !== 'pronta' && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>
            Esta OS está como &quot;{STATUS[os.status]?.rotulo ?? os.status}&quot;, não como pronta. Confira se é o aparelho certo.
          </div>
        )}

        {jaPaga ? (
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 14, fontWeight: 700 }}>
            Esta OS já está paga. É só concluir a entrega.
          </div>
        ) : (
          <>
            <div style={{ marginTop: 16 }}>
              <label style={rotulo}>Valor a cobrar (R$)</label>
              <input name="entrega-valor" inputMode="decimal" autoComplete="off" value={valorTexto} onChange={e => setValorTexto(e.target.value)} placeholder="0,00"
                style={{ ...campo, fontSize: 22, fontWeight: 800, textAlign: 'right' }} />
              {valor === 0 && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Com valor zero a OS é concluída sem cobrança.</div>}
            </div>

            {!semCobranca && (
              <>
                <label style={{ ...rotulo, marginTop: 16 }}>Forma de pagamento</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>{FORMAS.map(botaoForma)}</div>

                {forma === 'pix' && (
                  <div style={{ marginTop: 14, textAlign: 'center' }}>
                    {!pix && !pixPago && (
                      <button type="button" onClick={gerarPix} disabled={gerandoPix} style={{ padding: '12px 18px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: gerandoPix ? 0.6 : 1 }}>
                        {gerandoPix ? 'Gerando…' : `Gerar QR code de ${Number.isNaN(valor) ? 'R$ 0,00' : reais(valor)}`}
                      </button>
                    )}
                    {pix && !pixPago && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR code do PIX" style={{ width: 230, height: 230, margin: '0 auto', display: 'block' }} />
                        <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>Aguardando o pagamento de <b>{reais(valor)}</b>…</div>
                        <button type="button" onClick={() => navigator.clipboard?.writeText(pix.pixCopiaCola)} style={{ marginTop: 8, padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>Copiar código PIX</button>
                      </>
                    )}
                    {pixPago && <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 14, fontWeight: 700 }}>PIX recebido.</div>}
                    {!pixPago && (
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                        <input type="checkbox" checked={pixNaMao} onChange={e => setPixNaMao(e.target.checked)} />
                        Conferi no aplicativo do banco que o PIX caiu
                      </label>
                    )}
                  </div>
                )}

                {(forma === 'debito' || forma === 'credito') && (
                  <div style={{ marginTop: 14 }}>
                    {forma === 'credito' && (
                      <>
                        <label style={rotulo}>Parcelas</label>
                        <select name="entrega-parcelas" value={parcelas} onChange={e => setParcelas(Number(e.target.value))} style={{ ...campo, background: '#fff' }}>
                          {Array.from({ length: maxParcelas }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}x de {Number.isNaN(valor) ? 'R$ 0,00' : reais(valor / n)}{n > 1 ? ' sem juros' : ''}</option>
                          ))}
                        </select>
                      </>
                    )}
                    <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Passe na maquininha</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{Number.isNaN(valor) ? 'R$ 0,00' : reais(valor)}</div>
                      <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{forma === 'debito' ? 'Débito' : parcelas === 1 ? 'Crédito à vista' : `Crédito em ${parcelas}x de ${reais(valor / parcelas)}`}</div>
                    </div>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
                      <input type="checkbox" checked={cartaoAprovado} onChange={e => setCartaoAprovado(e.target.checked)} style={{ width: 18, height: 18 }} />
                      Pagamento aprovado na maquininha
                    </label>
                  </div>
                )}

                {forma === 'dinheiro' && (
                  <div style={{ marginTop: 14 }}>
                    <label style={rotulo}>Valor que o cliente entregou (R$)</label>
                    <input name="entrega-recebido" inputMode="decimal" autoComplete="off" value={recebidoTexto} onChange={e => setRecebidoTexto(e.target.value)} placeholder="0,00" style={{ ...campo, fontSize: 18, fontWeight: 700, textAlign: 'right' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {[{ r: 'Exato', v: valor }, { r: 'R$ 50', v: 50 }, { r: 'R$ 100', v: 100 }, { r: 'R$ 200', v: 200 }].map(b => (
                        <button key={b.r} type="button" onClick={() => setRecebidoTexto(Number.isNaN(b.v) ? '' : b.v.toFixed(2).replace('.', ','))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>{b.r}</button>
                      ))}
                    </div>
                    {!Number.isNaN(recebido) && recebidoTexto !== '' && (
                      <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, fontSize: 15, fontWeight: 800, background: troco >= 0 ? '#f0fdf4' : '#fef2f2', color: troco >= 0 ? '#166534' : '#b91c1c', border: `1px solid ${troco >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
                        {troco >= 0 ? `Troco: ${reais(troco)}` : `Faltam ${reais(-troco)}`}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 18, fontSize: 13, color: '#0f172a', cursor: 'pointer' }}>
          <input type="checkbox" checked={terceiro} onChange={e => setTerceiro(e.target.checked)} style={{ width: 16, height: 16 }} />
          Quem está retirando é diferente do titular
        </label>
        {terceiro && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <label style={rotulo}>Nome de quem retira</label>
              <input name="entrega-terceiro-nome" autoComplete="off" value={nomeTerceiro} onChange={e => setNomeTerceiro(e.target.value)} style={campo} />
            </div>
            <div>
              <label style={rotulo}>Número do documento</label>
              <input name="entrega-terceiro-documento" autoComplete="off" value={docTerceiro} onChange={e => setDocTerceiro(e.target.value)} placeholder="RG ou CPF" style={campo} />
            </div>
          </div>
        )}

        {erro && <div role="alert" style={{ marginTop: 14, padding: '9px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>{erro}</div>}

        <button type="button" onClick={concluir} disabled={!podeConcluir}
          style={{ marginTop: 18, width: '100%', padding: 14, borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontSize: 15, fontWeight: 800, fontFamily: 'inherit', cursor: podeConcluir ? 'pointer' : 'not-allowed', opacity: podeConcluir ? 1 : 0.45 }}>
          {salvando ? 'Concluindo…' : 'Concluir entrega'}
        </button>
      </div>
    </div>
  )
}

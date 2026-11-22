'use client'
// Regras do orçamento automático do agente: liga/desliga, faixas de preço por
// tipo de peça e um simulador que mostra o que o agente responderia.
import { useState } from 'react'
import {
  CHAVES_DE_REGRA, ChaveDeRegra, ConfigPrecos, RegraDePreco, ROTULO_DA_REGRA, faixasParaTexto, textoParaFaixas,
} from '@/lib/whatsapp/precoRegras'

type Simulacao = {
  modelo: string
  opcoes: { rotulo: string; preco: number; custo: number; custos: number[] }[]
  deFora: { rotulo: string; motivo: string; custo: number }[]
  falhas: string[]
}

const campo = { padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' } as const
const rotulo = { fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 } as const
const ajuda = { fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 } as const
const reais = (v: number) => `R$ ${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')}`
const SERVICOS = [{ v: 'tela', l: 'Tela' }, { v: 'bateria', l: 'Bateria' }, { v: 'conector', l: 'Conector de carga' }]

export default function OrcamentoAutomatico({ precos, onChange }: { precos: ConfigPrecos; onChange: (p: ConfigPrecos) => void }) {
  // O texto das faixas só vira número ao sair do campo, para não atrapalhar a digitação
  const [textos, setTextos] = useState<Partial<Record<ChaveDeRegra, string>>>({})
  const [modelo, setModelo] = useState('')
  const [servico, setServico] = useState('tela')
  const [simulando, setSimulando] = useState(false)
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null)
  const [erro, setErro] = useState('')

  const mudar = (chave: ChaveDeRegra, parte: Partial<RegraDePreco>) =>
    onChange({ ...precos, regras: { ...precos.regras, [chave]: { ...precos.regras[chave], ...parte } } })
  const numero = (texto: string) => { const n = parseFloat(texto.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0 }

  async function simular() {
    if (modelo.trim().length < 2) return
    setSimulando(true); setErro(''); setSimulacao(null)
    try {
      const res = await fetch('/api/whatsapp/orcamento/simular', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelo, servico, precos }),
      })
      const json = await res.json()
      if (!res.ok) setErro(json.error || 'Não foi possível simular.')
      else setSimulacao(json as Simulacao)
    } catch { setErro('Não foi possível simular.') }
    setSimulando(false)
  }

  return (
    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', paddingTop: 16, marginTop: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Orçamento automático</div>
      <div style={ajuda}>
        Para troca de tela, bateria e conector de carga, o agente consulta a Fix Cell e a iPlay, aplica as regras abaixo e já passa o preço ao cliente, uma opção por tipo, sem citar marca. Desligado, ele pergunta o valor a você, como antes.
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, fontWeight: 600, color: precos.ativo ? '#15803d' : '#475569', cursor: 'pointer' }}>
        <input type="checkbox" checked={precos.ativo} onChange={e => onChange({ ...precos, ativo: e.target.checked })} />
        {precos.ativo ? 'Ligado: o agente passa o preço sozinho' : 'Desligado: o agente pergunta o preço a você'}
      </label>

      <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
        <label style={rotulo}>Simular: o que o agente responderia</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input name="orc-modelo" autoComplete="off" placeholder="ex.: Samsung Galaxy A15" style={{ ...campo, width: 240, fontSize: 13, background: '#fff' }} value={modelo} onChange={e => setModelo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') simular() }} />
          <select name="orc-servico" style={{ ...campo, fontSize: 13, background: '#fff' }} value={servico} onChange={e => setServico(e.target.value)}>
            {SERVICOS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
          <button type="button" onClick={simular} disabled={simulando || modelo.trim().length < 2} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: simulando ? 0.6 : 1 }}>
            {simulando ? 'Consultando fornecedores…' : 'Simular'}
          </button>
        </div>
        <div style={ajuda}>Usa as regras que estão na tela agora, mesmo antes de salvar. A consulta aos fornecedores leva alguns segundos.</div>
        {erro && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>{erro}</div>}
        {simulacao && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#334155', lineHeight: 1.7 }}>
            {simulacao.opcoes.length === 0
              ? <div style={{ color: '#92400e' }}>Nenhum preço automático para este aparelho: o agente perguntaria a você. Confira se o modelo está escrito por completo.</div>
              : simulacao.opcoes.map(o => (
                <div key={o.rotulo}>
                  <b>{o.rotulo}: {reais(o.preco)}</b>
                  <span style={{ color: '#64748b' }}> · custo usado {reais(o.custo)} · nos fornecedores: {o.custos.map(reais).join(', ')}</span>
                </div>
              ))}
            {simulacao.deFora.map(d => (
              <div key={d.rotulo} style={{ color: '#94a3b8' }}>Fica de fora: {d.rotulo} (custo {reais(d.custo)}): {d.motivo}</div>
            ))}
            {simulacao.falhas.length > 0 && <div style={{ color: '#92400e' }}>Fornecedor sem resposta agora: {simulacao.falhas.join(', ')}.</div>}
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 11 }}>
              <th style={{ padding: '6px 6px 6px 0', fontWeight: 600 }}>Opção</th>
              <th style={{ padding: 6, fontWeight: 600 }}>Custo que vale</th>
              <th style={{ padding: 6, fontWeight: 600 }}>Faixas: custo até = preço</th>
              <th style={{ padding: 6, fontWeight: 600 }}>Acima das faixas: custo ×</th>
              <th style={{ padding: 6, fontWeight: 600 }}>+ R$</th>
              <th style={{ padding: 6, fontWeight: 600 }}>Mínimo R$</th>
            </tr>
          </thead>
          <tbody>
            {CHAVES_DE_REGRA.map(chave => {
              const r = precos.regras[chave]
              return (
                <tr key={chave} style={{ borderTop: '1px solid #f1f5f9', opacity: r.oferecer ? 1 : 0.55 }}>
                  <td style={{ padding: '6px 6px 6px 0', whiteSpace: 'nowrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, color: '#0f172a' }}>
                      <input type="checkbox" checked={r.oferecer} onChange={e => mudar(chave, { oferecer: e.target.checked })} />
                      {ROTULO_DA_REGRA[chave].tela}
                    </label>
                  </td>
                  <td style={{ padding: 6 }}>
                    <select style={{ ...campo, background: '#fff' }} value={r.custo} onChange={e => mudar(chave, { custo: e.target.value as RegraDePreco['custo'] })}>
                      <option value="menor">marca mais barata</option>
                      <option value="meio">marca do meio</option>
                      <option value="maior">marca mais cara</option>
                    </select>
                  </td>
                  <td style={{ padding: 6 }}>
                    <input
                      style={{ ...campo, width: '100%', minWidth: 230 }} placeholder="sem faixas"
                      value={textos[chave] ?? faixasParaTexto(r.faixas)}
                      onChange={e => setTextos(t => ({ ...t, [chave]: e.target.value }))}
                      onBlur={e => { mudar(chave, { faixas: textoParaFaixas(e.target.value) }); setTextos(t => { const n = { ...t }; delete n[chave]; return n }) }}
                    />
                  </td>
                  <td style={{ padding: 6 }}><input type="number" step="0.01" min={0} style={{ ...campo, width: 70 }} value={r.mult} onChange={e => mudar(chave, { mult: numero(e.target.value) })} /></td>
                  <td style={{ padding: 6 }}><input type="number" step="1" min={0} style={{ ...campo, width: 70 }} value={r.soma} onChange={e => mudar(chave, { soma: numero(e.target.value) })} /></td>
                  <td style={{ padding: 6 }}><input type="number" step="1" min={0} style={{ ...campo, width: 70 }} value={r.minimo} onChange={e => mudar(chave, { minimo: numero(e.target.value) })} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={ajuda}>
        Como ler uma linha: em &quot;80=180; 90=190; 120=220&quot;, peça de até R$ 80 sai por R$ 180, de até R$ 90 por R$ 190 e de até R$ 120 por R$ 220. Acima da última faixa vale custo × multiplicador + valor em reais, arredondado para cima de 10 em 10. Opção desmarcada não entra no orçamento.
        Regras fixas: aparelho de tela OLED não recebe LCD sem aro; tela original só entra em aparelho OLED, com aro, quando custa bem mais que a OLED comum; bateria sem flex e conector avulso para solda continuam sendo perguntados a você.
      </div>
    </div>
  )
}

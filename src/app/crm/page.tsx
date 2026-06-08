'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type ItemCRM = {
  os_id?: string
  cliente_id?: string
  numero?: number
  nome: string
  telefone: string | null
  modelo?: string | null
  dias?: number
  valor?: number | null
  data_ref?: string
  data_nascimento?: string | null
}

type Config = Record<string, string>

function formatPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{4,5})(\d{4})$/, '$1-$2')
}

function buildMensagem(template: string, item: ItemCRM): string {
  return template
    .replace(/{nome}/g, item.nome?.split(' ')[0] ?? 'cliente')
    .replace(/{modelo}/g, item.modelo ?? 'aparelho')
    .replace(/{numero}/g, String(item.numero ?? ''))
    .replace(/{valor}/g, item.valor ? item.valor.toFixed(2).replace('.', ',') : '—')
    .replace(/{dias}/g, String(item.dias ?? ''))
}

function abrirWA(telefone: string | null, msg: string) {
  if (!telefone) return
  const num = telefone.replace(/\D/g, '')
  window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
}

function TabelaCRM({
  titulo, icone, descricao, items, templateKey, config, cor, colunas
}: {
  titulo: string
  icone: string
  descricao: string
  items: ItemCRM[]
  templateKey: string
  config: Config
  cor: { bg: string; color: string; border: string }
  colunas: { key: keyof ItemCRM; label: string }[]
}) {
  const [enviados, setEnviados] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`wa_enviado_${templateKey}`) ?? '[]')) } catch { return new Set() }
  })

  function marcarEnviado(id: string) {
    const novo = new Set(enviados).add(id)
    setEnviados(novo)
    localStorage.setItem(`wa_enviado_${templateKey}`, JSON.stringify([...novo]))
  }

  const template = config[templateKey] ?? ''

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ background: cor.bg, borderBottom: `1px solid ${cor.border}`, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: cor.color, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{icone}</span> {titulo}
            <span style={{ fontSize: 12, fontWeight: 500, background: cor.border, color: cor.color, padding: '1px 8px', borderRadius: 20 }}>{items.length}</span>
          </h3>
          <p style={{ fontSize: 12, color: cor.color, opacity: 0.7, marginTop: 2 }}>{descricao}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          ✅ Nenhum registro encontrado
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {colunas.map(c => (
                <th key={String(c.key)} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</th>
              ))}
              <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const uid = item.os_id ?? item.cliente_id ?? String(i)
              const msg = buildMensagem(template, item)
              const semTel = !item.telefone
              const jaEnviado = enviados.has(uid)
              return (
                <tr key={uid} style={{ borderBottom: '1px solid #f1f5f9' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fafafa' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                  {colunas.map(c => (
                    <td key={String(c.key)} style={{ padding: '10px 16px', color: '#374151' }}>
                      {c.key === 'telefone' && item.telefone ? formatPhone(item.telefone) :
                       c.key === 'valor' && item.valor ? `R$ ${item.valor.toFixed(2).replace('.', ',')}` :
                       c.key === 'dias' ? <span style={{ fontWeight: 600, color: (item.dias ?? 0) > 90 ? '#991b1b' : '#92400e' }}>{item.dias} dias</span> :
                       String(item[c.key] ?? '—')}
                    </td>
                  ))}
                  <td style={{ padding: '10px 16px' }}>
                    {semTel ? (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>Sem telefone</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => { abrirWA(item.telefone, msg); marcarEnviado(uid) }}
                          style={{
                            padding: '5px 12px', borderRadius: 7, border: '1px solid',
                            cursor: 'pointer', fontSize: 12, fontWeight: 500,
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: jaEnviado ? '#f0fdf4' : '#fff',
                            color: jaEnviado ? '#065f46' : '#374151',
                            borderColor: jaEnviado ? '#86efac' : '#e2e8f0',
                          }}
                        >
                          💬 {jaEnviado ? 'Reenviado' : 'Enviar'}
                        </button>
                        {jaEnviado && <span style={{ fontSize: 16 }}>✓</span>}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function CRMPage() {
  const supabase = createClient()
  const [config, setConfig] = useState<Config>({})
  const [aniversariantes, setAniversariantes] = useState<ItemCRM[]>([])
  const [inativos, setInativos] = useState<ItemCRM[]>([])
  const [nuncaRetornaram, setNuncaRetornaram] = useState<ItemCRM[]>([])
  const [aparelhos90, setAparelhos90] = useState<ItemCRM[]>([])
  const [osProntaNaoRetirada, setOsProntaNaoRetirada] = useState<ItemCRM[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTudo = useCallback(async () => {
    setLoading(true)
    const hoje = new Date()
    const mesAtual = hoje.getMonth() + 1
    const diaAtual = hoje.getDate()

    // Configs
    const { data: cfgData } = await supabase.from('sistema_config').select('chave,valor')
    const cfg: Config = {}
    cfgData?.forEach(c => { cfg[c.chave] = c.valor })
    setConfig(cfg)

    const diasInativo = parseInt(cfg.cliente_inativo_dias ?? '90')
    const diasOsPronta = parseInt(cfg.os_pronta_alerta_dias ?? '3')
    const diasRetirada = parseInt(cfg.retirada_prazo_dias ?? '90')

    const dataLimiteInativo = new Date(hoje)
    dataLimiteInativo.setDate(dataLimiteInativo.getDate() - diasInativo)

    const dataLimitePronta = new Date(hoje)
    dataLimitePronta.setDate(dataLimitePronta.getDate() - diasOsPronta)

    const dataLimiteRetirada = new Date(hoje)
    dataLimiteRetirada.setDate(dataLimiteRetirada.getDate() - diasRetirada)

    // 1. Aniversariantes do dia
    const { data: anivData } = await supabase
      .from('clientes')
      .select('id,nome,telefone,data_nascimento')
      .is('deleted_at', null)
      .not('data_nascimento', 'is', null)

    const aniv = (anivData ?? []).filter(c => {
      if (!c.data_nascimento) return false
      const nasc = new Date(c.data_nascimento + 'T12:00:00')
      return nasc.getMonth() + 1 === mesAtual && nasc.getDate() === diaAtual
    }).map(c => ({ cliente_id: c.id, nome: c.nome, telefone: c.telefone, data_nascimento: c.data_nascimento }))
    setAniversariantes(aniv)

    // 2. Clientes sem OS há mais de X dias
    const { data: ativData } = await supabase
      .from('ordens_servico')
      .select('cliente_id, created_at, clientes(id,nome,telefone)')
      .is('deleted_at', null)
      .neq('status', 'cancelada')
      .order('created_at', { ascending: false })

    // Última OS por cliente
    const ultimaOsPorCliente: Record<string, { data: Date; nome: string; telefone: string | null }> = {}
    ;(ativData ?? []).forEach((os: any) => {
      if (!os.cliente_id || !os.clientes) return
      if (!ultimaOsPorCliente[os.cliente_id]) {
        ultimaOsPorCliente[os.cliente_id] = {
          data: new Date(os.created_at),
          nome: os.clientes.nome,
          telefone: os.clientes.telefone,
        }
      }
    })

    const inativ = Object.entries(ultimaOsPorCliente)
      .filter(([, v]) => v.data < dataLimiteInativo)
      .map(([id, v]) => ({
        cliente_id: id, nome: v.nome, telefone: v.telefone,
        dias: Math.floor((hoje.getTime() - v.data.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => b.dias - a.dias)
    setInativos(inativ)

    // 3. Clientes que abriram só 1 OS e nunca mais voltaram (há mais de 30 dias)
    const contagemOS: Record<string, number> = {}
    ;(ativData ?? []).forEach((os: any) => {
      if (os.cliente_id) contagemOS[os.cliente_id] = (contagemOS[os.cliente_id] ?? 0) + 1
    })

    const nuncaRet = Object.entries(ultimaOsPorCliente)
      .filter(([id, v]) => {
        const count = contagemOS[id] ?? 0
        const diasPassados = Math.floor((hoje.getTime() - v.data.getTime()) / (1000 * 60 * 60 * 24))
        return count === 1 && diasPassados > 30
      })
      .map(([id, v]) => ({
        cliente_id: id, nome: v.nome, telefone: v.telefone,
        dias: Math.floor((hoje.getTime() - v.data.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => b.dias - a.dias)
    setNuncaRetornaram(nuncaRet)

    // 4. Aparelhos com +90 dias sem retirar (status != entregue)
    const { data: ap90Data } = await supabase
      .from('ordens_servico')
      .select('id,numero,modelo,valor_final,valor_orcamento,created_at,clientes(nome,telefone)')
      .is('deleted_at', null)
      .not('status', 'eq', 'entregue')
      .not('status', 'eq', 'cancelada')
      .lt('created_at', dataLimiteRetirada.toISOString())

    const ap90 = (ap90Data ?? []).map((os: any) => ({
      os_id: os.id, numero: os.numero, nome: os.clientes?.nome ?? '—',
      telefone: os.clientes?.telefone ?? null, modelo: os.modelo,
      valor: os.valor_final ?? os.valor_orcamento,
      dias: Math.floor((hoje.getTime() - new Date(os.created_at).getTime()) / (1000 * 60 * 60 * 24)),
    })).sort((a: ItemCRM, b: ItemCRM) => (b.dias ?? 0) - (a.dias ?? 0))
    setAparelhos90(ap90)

    // 5. OS prontas não retiradas há mais de X dias
    const { data: prontaData } = await supabase
      .from('ordens_servico')
      .select('id,numero,modelo,valor_final,valor_orcamento,updated_at,clientes(nome,telefone)')
      .is('deleted_at', null)
      .eq('status', 'pronta')
      .lt('updated_at', dataLimitePronta.toISOString())

    const pronta = (prontaData ?? []).map((os: any) => ({
      os_id: os.id, numero: os.numero, nome: os.clientes?.nome ?? '—',
      telefone: os.clientes?.telefone ?? null, modelo: os.modelo,
      valor: os.valor_final ?? os.valor_orcamento,
      dias: Math.floor((hoje.getTime() - new Date(os.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
    })).sort((a: ItemCRM, b: ItemCRM) => (b.dias ?? 0) - (a.dias ?? 0))
    setOsProntaNaoRetirada(pronta)

    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchTudo() }, [fetchTudo])

  const total = aniversariantes.length + inativos.length + nuncaRetornaram.length + aparelhos90.length + osProntaNaoRetirada.length

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>CRM & Acompanhamento</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
          {loading ? 'Carregando...' : `${total} contato${total !== 1 ? 's' : ''} para acompanhar hoje`}
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>Analisando dados dos clientes...</div>
      ) : (
        <>
          <TabelaCRM
            titulo="Aniversariantes hoje"
            icone="🎂"
            descricao="Clientes que fazem aniversário hoje"
            items={aniversariantes}
            templateKey="wa_aniversario"
            config={config}
            cor={{ bg: '#fdf4ff', color: '#701a75', border: '#f0abfc' }}
            colunas={[
              { key: 'nome', label: 'Cliente' },
              { key: 'telefone', label: 'Telefone' },
              { key: 'data_nascimento', label: 'Nascimento' },
            ]}
          />

          <TabelaCRM
            titulo="OS prontas não retiradas"
            icone="⏰"
            descricao={`Aparelhos prontos há mais de ${config.os_pronta_alerta_dias ?? 3} dias aguardando retirada`}
            items={osProntaNaoRetirada}
            templateKey="wa_os_pronta_nao_retirada"
            config={config}
            cor={{ bg: '#fff7ed', color: '#9a3412', border: '#fed7aa' }}
            colunas={[
              { key: 'numero', label: 'OS' },
              { key: 'nome', label: 'Cliente' },
              { key: 'telefone', label: 'Telefone' },
              { key: 'modelo', label: 'Aparelho' },
              { key: 'valor', label: 'Valor' },
              { key: 'dias', label: 'Há quanto tempo' },
            ]}
          />

          <TabelaCRM
            titulo="Aparelhos +90 dias sem retirar"
            icone="📦"
            descricao={`Aparelhos na loja há mais de ${config.retirada_prazo_dias ?? 90} dias — taxa de armazenamento sendo gerada`}
            items={aparelhos90}
            templateKey="wa_retirada_90dias"
            config={config}
            cor={{ bg: '#fef2f2', color: '#991b1b', border: '#fecaca' }}
            colunas={[
              { key: 'numero', label: 'OS' },
              { key: 'nome', label: 'Cliente' },
              { key: 'telefone', label: 'Telefone' },
              { key: 'modelo', label: 'Aparelho' },
              { key: 'dias', label: 'Dias na loja' },
            ]}
          />

          <TabelaCRM
            titulo="Clientes inativos"
            icone="😴"
            descricao={`Sem OS há mais de ${config.cliente_inativo_dias ?? 90} dias`}
            items={inativos}
            templateKey="wa_cliente_inativo"
            config={config}
            cor={{ bg: '#f0f9ff', color: '#075985', border: '#bae6fd' }}
            colunas={[
              { key: 'nome', label: 'Cliente' },
              { key: 'telefone', label: 'Telefone' },
              { key: 'dias', label: 'Sem OS há' },
            ]}
          />

          <TabelaCRM
            titulo="Nunca retornaram"
            icone="👋"
            descricao="Clientes que fizeram apenas 1 OS e nunca mais voltaram (mais de 30 dias)"
            items={nuncaRetornaram}
            templateKey="wa_nunca_retornou"
            config={config}
            cor={{ bg: '#f0fdf4', color: '#065f46', border: '#bbf7d0' }}
            colunas={[
              { key: 'nome', label: 'Cliente' },
              { key: 'telefone', label: 'Telefone' },
              { key: 'dias', label: 'Última OS há' },
            ]}
          />
        </>
      )}
    </div>
  )
}

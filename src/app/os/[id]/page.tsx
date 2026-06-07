'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type OS = {
  id: string
  numero: number
  status: string
  marca: string | null
  modelo: string | null
  imei: string | null
  cor: string | null
  acessorios: string[] | null
  senha_aparelho: string | null
  defeito_relatado: string
  defeito_tecnico: string | null
  solucao: string | null
  valor_orcamento: number | null
  valor_final: number | null
  desconto: number | null
  forma_pagamento: string | null
  pago: boolean
  observacoes: string | null
  created_at: string
  updated_at: string
  clientes: { id: string; nome: string; telefone: string | null; cpf: string | null } | null
}

const STATUS_FLOW = ['aberta', 'em_andamento', 'pronta', 'entregue']
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: string; waMensagem: string }> = {
  aberta:       { label: 'Aberta',       bg: '#eff6ff', color: '#1d4ed8', icon: '📋', waMensagem: 'Olá, {nome}! 😊 Seu aparelho *{modelo}* foi recebido em nossa assistência técnica.\n\n🔧 *OS Nº {numero}*\n📱 Aparelho: {modelo}\n🛠 Defeito: {defeito}\n\nAssim que tivermos novidades, entraremos em contato. Obrigado pela confiança!' },
  em_andamento: { label: 'Em andamento', bg: '#fef3c7', color: '#92400e', icon: '🔧', waMensagem: 'Olá, {nome}! 👋 Sua *OS Nº {numero}* está em andamento.\n\n📱 Aparelho: {modelo}\n🔧 Nosso técnico já está trabalhando no seu dispositivo.\n\nEm breve teremos mais informações!' },
  pronta:       { label: 'Pronta',       bg: '#ecfdf5', color: '#065f46', icon: '✅', waMensagem: 'Olá, {nome}! 🎉 Ótima notícia!\n\nSua *OS Nº {numero}* está *PRONTA* para retirada!\n\n📱 Aparelho: {modelo}\n💰 Valor: R$ {valor}\n\nPasse em nossa loja para retirar. Aguardamos você! 😊' },
  entregue:     { label: 'Entregue',     bg: '#f0fdf4', color: '#14532d', icon: '📦', waMensagem: 'Olá, {nome}! Confirmando a entrega do seu *{modelo}*. Obrigado pela preferência! 🙏\n\n*OS Nº {numero}* finalizada.' },
  cancelada:    { label: 'Cancelada',    bg: '#fef2f2', color: '#991b1b', icon: '❌', waMensagem: '' },
}

const PAGAMENTOS = ['Dinheiro', 'PIX', 'Cartão débito', 'Cartão crédito', 'Transferência']

const CHECKLIST_ITEMS = [
  { key: 'tela',         label: 'Tela / Display',      icon: '🖥' },
  { key: 'touch',        label: 'Touch screen',         icon: '👆' },
  { key: 'microfone',    label: 'Microfone',            icon: '🎤' },
  { key: 'alto_falante', label: 'Alto-falante',         icon: '🔊' },
  { key: 'fone',         label: 'Entrada de fone',      icon: '🎧' },
  { key: 'camera_tras',  label: 'Câmera traseira',      icon: '📷' },
  { key: 'camera_fron',  label: 'Câmera frontal',       icon: '🤳' },
  { key: 'chip',         label: 'Leitor de chip',       icon: '📶' },
  { key: 'wifi',         label: 'Wi-Fi',                icon: '📡' },
  { key: 'bluetooth',    label: 'Bluetooth',            icon: '🦷' },
  { key: 'gps',          label: 'GPS',                  icon: '📍' },
  { key: 'bateria',      label: 'Bateria',              icon: '🔋' },
  { key: 'botao_power',  label: 'Botão power',          icon: '⏻' },
  { key: 'botao_vol',    label: 'Botões de volume',     icon: '🔈' },
  { key: 'biometria',    label: 'Biometria / Face ID',  icon: '👁' },
  { key: 'carregamento', label: 'Carregamento',         icon: '⚡' },
  { key: 'usb',          label: 'Porta USB / dados',    icon: '🔌' },
  { key: 'vibracao',     label: 'Vibração',             icon: '📳' },
]

type ChecklistState = Record<string, 'ok' | 'falha' | 'nao_testado'>

function formatPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{4,5})(\d{4})$/, '$1-$2')
}

function parseSenha(raw: string | null) {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function PatternDisplay({ sequencia }: { sequencia: number[] }) {
  const SIZE = 100, PAD = 18, STEP = (SIZE - PAD * 2) / 2
  function dotPos(i: number) { return { x: PAD + (i % 3) * STEP, y: PAD + Math.floor(i / 3) * STEP } }
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ background: '#0f172a', borderRadius: 8 }}>
      {sequencia.map((dot, idx) => {
        if (idx === 0) return null
        const from = dotPos(sequencia[idx - 1]), to = dotPos(dot)
        return <line key={idx} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#6366f1" strokeWidth="1.5" opacity="0.8" />
      })}
      {Array.from({ length: 9 }, (_, i) => {
        const p = dotPos(i), drawn = sequencia.includes(i)
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={7} fill={drawn ? '#6366f1' : '#1e293b'} stroke={drawn ? '#818cf8' : '#334155'} strokeWidth="1" />
            <circle cx={p.x} cy={p.y} r={2.5} fill={drawn ? '#fff' : '#475569'} />
          </g>
        )
      })}
    </svg>
  )
}

function gerarMensagemWA(template: string, os: OS, valor: string) {
  const nome = os.clientes?.nome?.split(' ')[0] ?? 'cliente'
  return template
    .replace('{nome}', nome)
    .replace(/{numero}/g, String(os.numero))
    .replace(/{modelo}/g, os.modelo ?? 'aparelho')
    .replace('{defeito}', os.defeito_relatado)
    .replace('{valor}', valor || (os.valor_orcamento ? os.valor_orcamento.toFixed(2).replace('.', ',') : 'a combinar'))
}

function abrirWhatsApp(telefone: string | null, mensagem: string) {
  const num = telefone?.replace(/\D/g, '') ?? ''
  window.open(`https://wa.me/55${num}?text=${encodeURIComponent(mensagem)}`, '_blank')
}

export default function OSDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const [os, setOs] = useState<OS | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aba, setAba] = useState<'os' | 'checklist'>('os')

  const [status, setStatus] = useState('')
  const [defeitoTecnico, setDefeitoTecnico] = useState('')
  const [solucao, setSolucao] = useState('')
  const [valorFinal, setValorFinal] = useState('')
  const [desconto, setDesconto] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [pago, setPago] = useState(false)
  const [observacoes, setObservacoes] = useState('')
  const [checklist, setChecklist] = useState<ChecklistState>({})

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('ordens_servico')
        .select('*,clientes(id,nome,telefone,cpf)')
        .eq('id', id)
        .single()
      if (data) {
        const d = data as unknown as OS
        setOs(d)
        setStatus(d.status)
        setDefeitoTecnico(d.defeito_tecnico ?? '')
        setSolucao(d.solucao ?? '')
        setValorFinal(d.valor_final ? String(d.valor_final) : d.valor_orcamento ? String(d.valor_orcamento) : '')
        setDesconto(d.desconto ? String(d.desconto) : '')
        setFormaPagamento(d.forma_pagamento ?? '')
        setPago(d.pago ?? false)
        try {
          const obs = JSON.parse(d.observacoes ?? '{}')
          setObservacoes(obs.texto ?? d.observacoes ?? '')
          if (obs.__checklist) setChecklist(obs.__checklist)
        } catch { setObservacoes(d.observacoes ?? '') }
      }
      setLoading(false)
    }
    load()
  }, [id, supabase])

  async function salvar() {
    setSaving(true)
    const obsPayload = JSON.stringify({ texto: observacoes, __checklist: checklist })
    await supabase.from('ordens_servico').update({
      status, defeito_tecnico: defeitoTecnico || null, solucao: solucao || null,
      valor_final: valorFinal ? parseFloat(valorFinal) : null,
      desconto: desconto ? parseFloat(desconto) : 0,
      forma_pagamento: formaPagamento || null, pago,
      observacoes: obsPayload,
      ...(status === 'entregue' && os?.status !== 'entregue' ? { entregue_em: new Date().toISOString() } : {}),
    }).eq('id', id)
    await supabase.from('events').insert({ type: 'OS_ATUALIZADA', entity: 'os', entity_id: id, payload: { status, pago } })
    const { data } = await supabase.from('ordens_servico').select('*,clientes(id,nome,telefone,cpf)').eq('id', id).single()
    if (data) setOs(data as unknown as OS)
    setSaving(false)
  }

  function toggleChecklist(key: string, val: 'ok' | 'falha' | 'nao_testado') {
    setChecklist(c => ({ ...c, [key]: val }))
  }

  function imprimir() {
    if (!os) return
    const senha = parseSenha(os.senha_aparelho)
    let senhaTexto = 'Não fornecida pelo cliente'
    if (senha) {
      if (senha.tipo === 'pin') senhaTexto = `PIN: ${senha.valor}`
      else if (senha.tipo === 'senha') senhaTexto = `Senha: ${senha.valor}`
      else if (senha.tipo === 'padrao') senhaTexto = `Padrão: ${senha.sequencia.map((n: number) => n + 1).join(' → ')}`
    }
    const vFinal = valorFinal ? parseFloat(valorFinal) : (os.valor_orcamento ?? 0)
    const vDesc = desconto ? parseFloat(desconto) : 0
    const vTotal = (vFinal - vDesc).toFixed(2).replace('.', ',')
    const vOrc = os.valor_orcamento ? `R$ ${os.valor_orcamento.toFixed(2).replace('.', ',')}` : '—'
    const dataAbertura = new Date(os.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const dataRetirada = new Date(new Date(os.created_at).getTime() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')

    const via = (titulo: string, corTitulo: string) => `
      <div class="via">
        <!-- CABEÇALHO -->
        <div class="cabecalho">
          <div class="logo-area">
            <div class="logo-icon">📱</div>
            <div class="logo-texto">
              <div class="logo-nome">SOS Celulares</div>
              <div class="logo-sub">Assistência Técnica Especializada</div>
            </div>
          </div>
          <div class="loja-info">
            <div>📍 Rua das Flores, 123 — Centro</div>
            <div>📞 (11) 99999-9999</div>
            <div>✉ contato@soscelulares.com.br</div>
            <div>🕐 Seg–Sex 9h–18h · Sáb 9h–13h</div>
          </div>
          <div class="os-badge">
            <div class="os-via">${titulo}</div>
            <div class="os-num">OS Nº ${os.numero}</div>
            <div class="os-data">${dataAbertura}</div>
          </div>
        </div>

        <!-- CORPO PRINCIPAL em 3 colunas -->
        <div class="corpo">

          <!-- COLUNA 1: Cliente + Aparelho -->
          <div class="coluna">
            <div class="secao">
              <div class="secao-titulo" style="border-color:${corTitulo};color:${corTitulo}">CLIENTE</div>
              <div class="linha"><span>Nome</span><strong>${os.clientes?.nome ?? '—'}</strong></div>
              <div class="linha"><span>Telefone</span>${os.clientes?.telefone ? formatPhone(os.clientes.telefone) : '—'}</div>
              <div class="linha"><span>CPF</span>${os.clientes?.cpf ?? '—'}</div>
            </div>
            <div class="secao" style="margin-top:8px">
              <div class="secao-titulo" style="border-color:${corTitulo};color:${corTitulo}">APARELHO</div>
              <div class="linha"><span>Modelo</span><strong>${os.modelo ?? '—'}</strong></div>
              <div class="linha"><span>IMEI</span>${os.imei ?? '—'}</div>
              <div class="linha"><span>Cor</span>${os.cor ?? '—'}</div>
              <div class="linha"><span>Acessórios</span>${os.acessorios?.join(', ') || 'Nenhum'}</div>
              <div class="linha"><span>Senha</span>${senhaTexto}</div>
            </div>
          </div>

          <!-- COLUNA 2: Defeito + Solução -->
          <div class="coluna">
            <div class="secao">
              <div class="secao-titulo" style="border-color:${corTitulo};color:${corTitulo}">DEFEITO RELATADO</div>
              <div class="texto-longo">${os.defeito_relatado}</div>
            </div>
            ${solucao ? `
            <div class="secao" style="margin-top:8px">
              <div class="secao-titulo" style="border-color:${corTitulo};color:${corTitulo}">SOLUÇÃO APLICADA</div>
              <div class="texto-longo">${solucao}</div>
            </div>` : ''}
            <div class="secao" style="margin-top:8px">
              <div class="secao-titulo" style="border-color:${corTitulo};color:${corTitulo}">FINANCEIRO</div>
              <div class="linha"><span>Orçamento</span>${vOrc}</div>
              ${desconto ? `<div class="linha"><span>Desconto</span>R$ ${vDesc.toFixed(2).replace('.', ',')}</div>` : ''}
              <div class="linha total"><span>TOTAL</span><strong>R$ ${vTotal}</strong></div>
              <div class="linha"><span>Pagamento</span>${formaPagamento || '—'} · ${pago ? '✓ PAGO' : 'Pendente'}</div>
            </div>
          </div>

          <!-- COLUNA 3: Políticas + Assinatura -->
          <div class="coluna">
            <div class="secao politica">
              <div class="secao-titulo" style="border-color:#dc2626;color:#dc2626">PRAZO DE RETIRADA</div>
              <p>O aparelho deverá ser retirado em até <strong>90 dias</strong> a contar da data de abertura da OS. Prazo limite: <strong>${dataRetirada}</strong>.</p>
              <p style="margin-top:4px">Após esse período, o cliente será notificado. O aparelho será armazenado em local seguro com custo de <strong>R$ 10,00/mês</strong> até a retirada.</p>
            </div>
            <div class="secao politica" style="margin-top:6px">
              <div class="secao-titulo" style="border-color:#92400e;color:#92400e">GARANTIA E RESPONSABILIDADE</div>
              <p>• A garantia cobre exclusivamente o serviço realizado e os componentes substituídos.</p>
              <p>• A troca de um componente (ex.: display) não inclui outros itens (ex.: alto-falante, câmera).</p>
              <p>• Danos por mau uso, queda, umidade ou tentativa de reparo por terceiros anulam a garantia.</p>
              <p>• A assistência não se responsabiliza por dados armazenados no aparelho.</p>
            </div>
            <div class="aceite">
              <p>Ao assinar, o cliente declara estar ciente e de acordo com todas as condições acima, confirma ter entregado o aparelho nas condições descritas e autoriza a execução do serviço pelo valor informado.</p>
              <div class="assinatura-linha">
                <div class="ass"><div class="ass-linha"></div><div class="ass-label">Assinatura do cliente</div></div>
                <div class="ass"><div class="ass-linha"></div><div class="ass-label">Técnico responsável</div></div>
              </div>
            </div>
          </div>
        </div>

        <!-- RODAPÉ LEGAL -->
        <div class="rodape-legal">
          Em conformidade com o CDC (Lei 8.078/90), Art. 18 e 26, os serviços possuem garantia mínima de 90 dias. 
          Peças originais podem ser substituídas por similares de qualidade equivalente, mediante ciência do cliente. 
          Equipamentos não retirados no prazo poderão ser destinados conforme legislação vigente após aviso prévio.
          SOS Celulares — CNPJ 00.000.000/0001-00
        </div>
      </div>
    `

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OS ${os.numero}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; font-size: 9px; background: #fff; }
      @page { size: A4 landscape; margin: 8mm; }
      .pagina { width: 277mm; display: flex; flex-direction: row; gap: 6mm; min-height: 190mm; }
      .via { flex: 1; border: 1.5px solid #334155; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden; }
      .separador { width: 6mm; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 3px; }
      .sep-linha { flex: 1; border-left: 2px dashed #94a3b8; }
      .sep-texto { writing-mode: vertical-rl; font-size: 7px; color: #94a3b8; letter-spacing: 2px; text-transform: uppercase; white-space: nowrap; }

      /* Cabeçalho */
      .cabecalho { background: #0f172a; color: #f8fafc; padding: 8px 10px; display: flex; align-items: center; gap: 8px; }
      .logo-area { display: flex; align-items: center; gap: 6px; flex: 1; }
      .logo-icon { font-size: 20px; }
      .logo-nome { font-size: 13px; font-weight: bold; letter-spacing: -0.5px; }
      .logo-sub { font-size: 7px; color: #94a3b8; margin-top: 1px; }
      .loja-info { font-size: 7.5px; color: #94a3b8; line-height: 1.7; flex: 1; }
      .os-badge { text-align: right; }
      .os-via { font-size: 7px; color: #818cf8; text-transform: uppercase; letter-spacing: 1px; }
      .os-num { font-size: 16px; font-weight: bold; color: #818cf8; letter-spacing: -1px; }
      .os-data { font-size: 7px; color: #64748b; margin-top: 2px; }

      /* Corpo */
      .corpo { display: flex; flex: 1; gap: 0; }
      .coluna { flex: 1; padding: 8px 10px; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; }
      .coluna:last-child { border-right: none; }

      /* Seções */
      .secao { display: flex; flex-direction: column; gap: 3px; }
      .secao-titulo { font-size: 7px; font-weight: bold; letter-spacing: 0.8px; padding-bottom: 3px; border-bottom: 1.5px solid; margin-bottom: 4px; text-transform: uppercase; }
      .linha { display: flex; justify-content: space-between; gap: 4px; padding: 1.5px 0; border-bottom: 1px dotted #f1f5f9; font-size: 8px; }
      .linha span { color: #64748b; }
      .linha.total { background: #f0fdf4; padding: 3px 4px; border-radius: 3px; margin-top: 2px; font-size: 9px; border-bottom: none; }
      .linha.total strong { color: #065f46; font-size: 11px; }
      .texto-longo { font-size: 8px; color: #374151; line-height: 1.5; background: #f8fafc; padding: 5px 7px; border-radius: 3px; }

      /* Política */
      .politica p { font-size: 7.5px; color: #374151; line-height: 1.5; margin-top: 2px; }

      /* Aceite */
      .aceite { margin-top: auto; padding-top: 6px; border-top: 1px solid #e2e8f0; }
      .aceite p { font-size: 7px; color: #64748b; line-height: 1.4; margin-bottom: 8px; font-style: italic; }
      .assinatura-linha { display: flex; gap: 8px; }
      .ass { flex: 1; }
      .ass-linha { border-top: 1px solid #000; margin-bottom: 2px; margin-top: 16px; }
      .ass-label { font-size: 6.5px; color: #64748b; text-align: center; }

      /* Rodapé legal */
      .rodape-legal { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 4px 10px; font-size: 6.5px; color: #94a3b8; line-height: 1.5; }
    </style></head><body>
    <div class="pagina">
      ${via('VIA DA ASSISTÊNCIA', '#6366f1')}
      <div class="separador"><div class="sep-linha"></div><div class="sep-texto">recortar aqui</div><div class="sep-linha"></div></div>
      ${via('VIA DO CLIENTE', '#0f172a')}
    </div>
    <script>window.onload = () => { window.print(); }<\/script>
    </body></html>`

    const w = window.open('', '_blank')
    w?.document.write(html)
    w?.document.close()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }
  const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>Carregando...</div>
  if (!os) return <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>OS não encontrada.</div>

  const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
  const senha = parseSenha(os.senha_aparelho)
  const valorTotal = valorFinal ? (parseFloat(valorFinal) - (parseFloat(desconto) || 0)) : null

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>←</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.03em' }}>OS #{os.numero}</h1>
              <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.icon} {st.label}</span>
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
              {new Date(os.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={imprimir} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#fff', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
            🖨 Imprimir OS
          </button>
          <button onClick={salvar} disabled={saving} style={{ padding: '9px 20px', background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Aviso políticas */}
      <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: '#713f12', lineHeight: 1.6 }}>
        <strong>📋 Políticas confirmadas pelo cliente na assinatura da OS:</strong> prazo de retirada de 90 dias (após esse prazo, armazenamento de R$ 10,00/mês) · garantia cobre apenas o serviço realizado · mal uso e quedas anulam a garantia · dados não são de responsabilidade da assistência.
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
        {([['os', '📋 Ordem de Serviço'], ['checklist', '✅ Checklist de testes']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setAba(key)} style={{
            padding: '10px 18px', fontSize: 13, fontWeight: aba === key ? 600 : 400,
            border: 'none', background: 'none', cursor: 'pointer',
            color: aba === key ? '#6366f1' : '#64748b',
            borderBottom: aba === key ? '2px solid #6366f1' : '2px solid transparent',
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* ABA OS */}
      {aba === 'os' && (
        <>
          {/* Status + WhatsApp */}
          <div style={card}>
            <div style={cardTitle}><span>📊</span> Status da OS</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_FLOW.map((s) => {
                const cfg = STATUS_CONFIG[s]
                const current = status === s
                const past = STATUS_FLOW.indexOf(status) > STATUS_FLOW.indexOf(s)
                const mensagem = gerarMensagemWA(cfg.waMensagem, os, valorFinal)
                return (
                  <div key={s} style={{ flex: 1, minWidth: 140 }}>
                    <button onClick={() => setStatus(s)} style={{
                      width: '100%', padding: '10px 8px', borderRadius: 8, border: '1px solid',
                      cursor: 'pointer', fontSize: 12, fontWeight: current ? 600 : 400,
                      background: current ? cfg.bg : past ? '#f0fdf4' : '#f8fafc',
                      color: current ? cfg.color : past ? '#065f46' : '#94a3b8',
                      borderColor: current ? cfg.color : past ? '#86efac' : '#e2e8f0',
                      textAlign: 'center', marginBottom: 6,
                    }}>
                      <div style={{ fontSize: 16 }}>{cfg.icon}</div>
                      <div style={{ marginTop: 2 }}>{cfg.label}</div>
                    </button>
                    {os.clientes?.telefone && (
                      <button onClick={() => abrirWhatsApp(os.clientes!.telefone, mensagem)} style={{
                        width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid #86efac',
                        background: '#f0fdf4', color: '#065f46', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}>
                        <span>💬</span> WhatsApp
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Cliente */}
            <div style={card}>
              <div style={cardTitle}><span>👤</span> Cliente</div>
              {os.clientes ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600 }}>
                    {os.clientes.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{os.clientes.nome}</div>
                    {os.clientes.telefone && <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatPhone(os.clientes.telefone)}</div>}
                  </div>
                </div>
              ) : <p style={{ fontSize: 13, color: '#94a3b8' }}>Cliente não identificado</p>}
            </div>

            {/* Aparelho */}
            <div style={card}>
              <div style={cardTitle}><span>📱</span> Aparelho</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'Modelo', value: os.modelo },
                  { label: 'IMEI', value: os.imei },
                  { label: 'Cor', value: os.cor },
                  { label: 'Acessórios', value: os.acessorios?.join(', ') },
                ].map(r => r.value ? (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{r.value}</span>
                  </div>
                ) : null)}
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Senha</span>
                  {senha ? (
                    senha.tipo === 'padrao'
                      ? <PatternDisplay sequencia={senha.sequencia} />
                      : <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', fontFamily: 'monospace', background: '#f1f5f9', padding: '4px 10px', borderRadius: 6 }}>
                          {senha.tipo === 'pin' ? 'PIN: ' : ''}{senha.valor}
                        </span>
                  ) : <span style={{ fontSize: 12, color: '#ef4444', fontStyle: 'italic' }}>Não fornecida pelo cliente</span>}
                </div>
              </div>
            </div>

            {/* Defeito */}
            <div style={card}>
              <div style={cardTitle}><span>🔬</span> Defeito e diagnóstico</div>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Defeito relatado pelo cliente</label>
                <div style={{ fontSize: 13, color: '#1e293b', background: '#f8fafc', padding: '9px 12px', borderRadius: 7 }}>{os.defeito_relatado}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Defeito técnico</label>
                <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={defeitoTecnico} onChange={e => setDefeitoTecnico(e.target.value)} placeholder="Diagnóstico técnico..." />
              </div>
              <div>
                <label style={lbl}>Solução aplicada</label>
                <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={solucao} onChange={e => setSolucao(e.target.value)} placeholder="O que foi feito..." />
              </div>
            </div>

            {/* Financeiro */}
            <div style={card}>
              <div style={cardTitle}><span>💰</span> Financeiro</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={lbl}>Orçamento inicial</label>
                  <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', padding: '9px 12px', borderRadius: 7 }}>
                    {os.valor_orcamento ? `R$ ${os.valor_orcamento.toFixed(2).replace('.', ',')}` : 'Não informado'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={lbl}>Valor final (R$)</label>
                    <input style={inp} type="number" value={valorFinal} onChange={e => setValorFinal(e.target.value)} placeholder="0,00" />
                  </div>
                  <div>
                    <label style={lbl}>Desconto (R$)</label>
                    <input style={inp} type="number" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" />
                  </div>
                </div>
                {valorTotal !== null && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#065f46' }}>Total a cobrar</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#065f46' }}>R$ {valorTotal.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                <div>
                  <label style={lbl}>Forma de pagamento</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {PAGAMENTOS.map(p => (
                      <button key={p} onClick={() => setFormaPagamento(p)} style={{
                        fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid',
                        background: formaPagamento === p ? '#e0e7ff' : '#f8fafc',
                        color: formaPagamento === p ? '#3730a3' : '#64748b',
                        borderColor: formaPagamento === p ? '#818cf8' : '#e2e8f0',
                      }}>{p}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div onClick={() => setPago(!pago)} style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: pago ? '#6366f1' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 3, left: pago ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: pago ? '#065f46' : '#64748b' }}>
                    {pago ? '✅ Pagamento confirmado' : 'Aguardando pagamento'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={cardTitle}><span>📝</span> Observações internas</div>
            <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Anotações internas..." />
          </div>
        </>
      )}

      {/* ABA CHECKLIST */}
      {aba === 'checklist' && (
        <div style={card}>
          <div style={cardTitle}><span>✅</span> Checklist de testes do aparelho</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {CHECKLIST_ITEMS.map(item => {
              const val = checklist[item.key] ?? 'nao_testado'
              return (
                <div key={item.key} style={{
                  background: val === 'ok' ? '#f0fdf4' : val === 'falha' ? '#fef2f2' : '#f8fafc',
                  border: `1px solid ${val === 'ok' ? '#bbf7d0' : val === 'falha' ? '#fecaca' : '#e2e8f0'}`,
                  borderRadius: 8, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{item.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([['ok', '✅'], ['falha', '❌'], ['nao_testado', '—']] as const).map(([v, emoji]) => (
                      <button key={v} onClick={() => toggleChecklist(item.key, v)} style={{
                        width: 30, height: 30, borderRadius: 6, border: '1px solid', cursor: 'pointer', fontSize: 13,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: val === v ? (v === 'ok' ? '#dcfce7' : v === 'falha' ? '#fee2e2' : '#e2e8f0') : '#fff',
                        borderColor: val === v ? (v === 'ok' ? '#86efac' : v === 'falha' ? '#fca5a5' : '#94a3b8') : '#e2e8f0',
                      }}>{emoji}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[{ label: 'OK', val: 'ok', color: '#065f46', bg: '#ecfdf5', emoji: '✅' }, { label: 'Com falha', val: 'falha', color: '#991b1b', bg: '#fef2f2', emoji: '❌' }, { label: 'Não testado', val: 'nao_testado', color: '#64748b', bg: '#f8fafc', emoji: '—' }].map(s => {
              const count = CHECKLIST_ITEMS.filter(i => (checklist[i.key] ?? 'nao_testado') === s.val).length
              return (
                <div key={s.val} style={{ background: s.bg, borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{s.emoji}</span>
                  <span style={{ fontSize: 13, color: s.color, fontWeight: 500 }}>{s.label}: {count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={salvar} disabled={saving} style={{ padding: '11px 28px', background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}

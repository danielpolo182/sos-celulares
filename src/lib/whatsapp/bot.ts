// src/lib/whatsapp/bot.ts
import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'

const MODELO = 'claude-haiku-4-5-20251001'
const MAX_RODADAS_FERRAMENTA = 5

// Criado sob demanda: o webhook importa este módulo mesmo com o bot desligado,
// e a falta da ANTHROPIC_API_KEY não pode impedir o recebimento de mensagens.
let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) client = new Anthropic()
  return client
}

const STATUS_OS: Record<string, string> = {
  aberta: 'aberta (aparelho recebido)',
  aguardando_diagnostico: 'aguardando diagnóstico',
  em_orcamento: 'em orçamento',
  aguardando_aprovacao_cliente: 'aguardando aprovação do cliente',
  em_andamento: 'em andamento',
  em_reparo: 'em reparo',
  aguardando_peca: 'aguardando peça',
  aguardando: 'aguardando',
  pronta: 'pronta para retirada',
  entregue: 'entregue',
  cancelada: 'cancelada',
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_os_por_telefone',
    description: 'Busca ordens de serviço abertas ou recentes do cliente pelo número de telefone.',
    input_schema: {
      type: 'object',
      properties: {
        telefone: { type: 'string', description: 'Número de telefone do cliente (somente dígitos)' },
      },
      required: ['telefone'],
    },
  },
  {
    name: 'buscar_cliente_por_telefone',
    description: 'Busca dados do cliente pelo número de telefone.',
    input_schema: {
      type: 'object',
      properties: {
        telefone: { type: 'string', description: 'Número de telefone do cliente (somente dígitos)' },
      },
      required: ['telefone'],
    },
  },
  {
    name: 'get_info_loja',
    description: 'Retorna informações da loja como nome, endereço e contato.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

// O id do WhatsApp de números brasileiros pode vir sem o nono dígito,
// então a busca compara só os 8 dígitos finais.
async function buscarCliente(supabase: SupabaseClient, filialId: string, telefone: string) {
  const final8 = telefone.replace(/\D/g, '').slice(-8)
  if (final8.length < 8) return null
  const { data } = await supabase
    .from('clientes')
    .select('id, nome, email, telefone')
    .ilike('telefone', `%${final8}`)
    .is('deleted_at', null)
    .or(`filial_id.eq.${filialId},filial_id.is.null`)
    .limit(1)
  return data?.[0] ?? null
}

const reais = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

async function executeTool(
  toolName: string,
  toolInput: Record<string, string>,
  supabase: SupabaseClient,
  filialId: string
): Promise<string> {
  if (toolName === 'buscar_os_por_telefone') {
    const cliente = await buscarCliente(supabase, filialId, toolInput.telefone ?? '')
    if (!cliente) return 'Nenhum cliente encontrado com esse número.'

    const { data: ordens, error } = await supabase
      .from('ordens_servico')
      .select('numero, status, marca, modelo, defeito_relatado, valor_orcamento, valor_final, created_at')
      .eq('cliente_id', cliente.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3)

    if (error) return 'Não foi possível consultar as ordens de serviço agora.'
    if (!ordens?.length) return `Cliente ${cliente.nome} encontrado, mas sem ordens de serviço.`

    const lista = ordens
      .map(o => {
        const aparelho = [o.marca, o.modelo].filter(Boolean).join(' ') || 'aparelho'
        const valor = o.valor_final ?? o.valor_orcamento
        const data = new Date(o.created_at).toLocaleDateString('pt-BR')
        return `OS #${o.numero} (${data}) — ${aparelho} — status: ${STATUS_OS[o.status] ?? o.status}` +
          ` — defeito relatado: ${o.defeito_relatado}` +
          (valor != null ? ` — valor: ${reais(Number(valor))}` : '')
      })
      .join('\n')
    return `Ordens de serviço de ${cliente.nome}:\n${lista}`
  }

  if (toolName === 'buscar_cliente_por_telefone') {
    const cliente = await buscarCliente(supabase, filialId, toolInput.telefone ?? '')
    if (!cliente) return 'Nenhum cliente encontrado com esse número.'
    return `Nome: ${cliente.nome}\nE-mail: ${cliente.email ?? 'não informado'}\nTelefone: ${cliente.telefone}`
  }

  if (toolName === 'get_info_loja') {
    const { data } = await supabase
      .from('sistema_config')
      .select('chave, valor')
      .in('chave', ['loja_nome', 'loja_telefone', 'loja_endereco', 'loja_email', 'loja_horario'])

    const cfg: Record<string, string> = {}
    for (const c of data ?? []) if (c.valor) cfg[c.chave] = c.valor
    if (Object.keys(cfg).length === 0) return 'Informações da loja não disponíveis.'
    return [
      cfg.loja_nome,
      `Endereço: ${cfg.loja_endereco ?? 'não informado'}`,
      `Telefone: ${cfg.loja_telefone ?? 'não informado'}`,
      cfg.loja_email ? `E-mail: ${cfg.loja_email}` : null,
      cfg.loja_horario ? `Horário: ${cfg.loja_horario}` : null,
    ].filter(Boolean).join('\n')
  }

  return 'Ferramenta desconhecida.'
}

const PROMPT_PADRAO =
  'Você é o assistente de atendimento de uma assistência técnica de celulares. Seja simpático e objetivo.'

export async function processBot(
  mensagem: string,
  telefone: string,
  conversaId: string,
  supabase: SupabaseClient,
  filialId: string,
  systemPrompt?: string | null
): Promise<{ resposta: string; escalou: boolean }> {
  const { data: waConfig } = await supabase
    .from('wa_config')
    .select('bot_prompt')
    .eq('filial_id', filialId)
    .maybeSingle()

  // O prompt da loja define o tom; as regras abaixo valem sempre, porque o
  // webhook depende do marcador [HUMANO] e as ferramentas dependem do telefone.
  const sysPrompt = `${systemPrompt ?? waConfig?.bot_prompt ?? PROMPT_PADRAO}

Contexto desta conversa:
- Você responde pelo WhatsApp: mensagens curtas, em português, sem markdown.
- O telefone do cliente é ${telefone}. Use esse número nas ferramentas de busca; não peça o telefone ao cliente.
- Consulte dados reais pelas ferramentas. Não invente status, prazos nem valores.
- Se não conseguir ajudar, ou se o cliente pedir para falar com uma pessoa, responda APENAS com: [HUMANO]`

  // As 20 mensagens mais recentes, em ordem cronológica
  const { data: historico } = await supabase
    .from('wa_mensagens')
    .select('direcao, conteudo')
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: false })
    .limit(20)

  const messages: Anthropic.MessageParam[] = (historico ?? [])
    .reverse()
    .filter(m => m.conteudo?.trim())
    .map(m => ({
      role: m.direcao === 'entrada' ? ('user' as const) : ('assistant' as const),
      content: m.conteudo as string,
    }))

  // A API exige que a primeira mensagem seja do usuário
  while (messages.length > 0 && messages[0].role !== 'user') messages.shift()
  // O webhook grava a mensagem antes de chamar o bot; só acrescenta se ela não veio no histórico
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: mensagem })
  }

  const anthropic = getClient()
  let response = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 1024,
    system: sysPrompt,
    tools: TOOLS,
    messages,
  })

  let rodadas = 0
  while (response.stop_reason === 'tool_use' && rodadas < MAX_RODADAS_FERRAMENTA) {
    rodadas++
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      const result = await executeTool(
        block.name,
        block.input as Record<string, string>,
        supabase,
        filialId
      )
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
    }

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })

    response = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: sysPrompt,
      tools: TOOLS,
      messages,
    })
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  const resposta = textBlock?.text?.trim() ?? ''

  // Sem texto utilizável (ou ainda pedindo ferramenta após o limite): passa para uma pessoa
  if (!resposta || response.stop_reason === 'tool_use' || resposta.includes('[HUMANO]')) {
    return { resposta: resposta.replace('[HUMANO]', '').trim(), escalou: true }
  }

  return { resposta, escalou: false }
}

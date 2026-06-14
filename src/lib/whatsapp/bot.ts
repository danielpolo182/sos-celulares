// src/lib/whatsapp/bot.ts
import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'

const client = new Anthropic()

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
    description: 'Retorna informações da loja como endereço, horário de funcionamento e contato.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

async function executeTool(
  toolName: string,
  toolInput: Record<string, string>,
  supabase: SupabaseClient,
  filialId: string
): Promise<string> {
  if (toolName === 'buscar_os_por_telefone') {
    const raw = (toolInput.telefone ?? '').replace(/\D/g, '')
    const { data: cliente } = await supabase
      .from('clientes')
      .select('id, nome')
      .ilike('telefone', `%${raw.slice(-8)}%`)
      .eq('filial_id', filialId)
      .maybeSingle()

    if (!cliente) return 'Nenhum cliente encontrado com esse número.'

    const { data: ordens } = await supabase
      .from('ordens_servico')
      .select('numero, status, descricao, criado_em')
      .eq('cliente_id', cliente.id)
      .eq('filial_id', filialId)
      .order('criado_em', { ascending: false })
      .limit(3)

    if (!ordens?.length) return `Cliente ${cliente.nome} encontrado, mas sem ordens de serviço.`

    const lista = ordens
      .map(o => `OS #${o.numero} — ${o.status} — ${o.descricao ?? ''}`)
      .join('\n')
    return `Ordens de serviço de ${cliente.nome}:\n${lista}`
  }

  if (toolName === 'buscar_cliente_por_telefone') {
    const raw = (toolInput.telefone ?? '').replace(/\D/g, '')
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nome, email, telefone')
      .ilike('telefone', `%${raw.slice(-8)}%`)
      .eq('filial_id', filialId)
      .maybeSingle()

    if (!cliente) return 'Nenhum cliente encontrado com esse número.'
    return `Nome: ${cliente.nome}\nE-mail: ${cliente.email ?? 'não informado'}\nTelefone: ${cliente.telefone}`
  }

  if (toolName === 'get_info_loja') {
    const { data: filial } = await supabase
      .from('filiais')
      .select('nome, endereco, telefone, horario_funcionamento')
      .eq('id', filialId)
      .single()

    if (!filial) return 'Informações da loja não disponíveis.'
    return `${filial.nome}\nEndereço: ${filial.endereco ?? 'não informado'}\nTelefone: ${filial.telefone ?? 'não informado'}\nHorário: ${filial.horario_funcionamento ?? 'não informado'}`
  }

  return 'Ferramenta desconhecida.'
}

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
    .select('system_prompt')
    .eq('filial_id', filialId)
    .single()

  const sysPrompt =
    systemPrompt ??
    waConfig?.system_prompt ??
    `Você é um assistente de atendimento ao cliente de uma assistência técnica de celulares.
Responda de forma educada e objetiva em português.
Quando não conseguir ajudar ou o cliente pedir para falar com um humano, responda APENAS com: [HUMANO]
Não faça suposições — use as ferramentas disponíveis para buscar informações reais.`

  const { data: historico } = await supabase
    .from('wa_mensagens')
    .select('direcao, conteudo')
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: true })
    .limit(20)

  const messages: Anthropic.MessageParam[] = (historico ?? []).map(m => ({
    role: m.direcao === 'entrada' ? 'user' : 'assistant',
    content: m.conteudo,
  }))

  messages.push({ role: 'user', content: mensagem })

  let response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: sysPrompt,
    tools: TOOLS,
    messages,
  })

  while (response.stop_reason === 'tool_use') {
    const assistantContent = response.content
    const toolUseBlocks = assistantContent.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]

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

    messages.push({ role: 'assistant', content: assistantContent })
    messages.push({ role: 'user', content: toolResults })

    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: sysPrompt,
      tools: TOOLS,
      messages,
    })
  }

  const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined
  const resposta = textBlock?.text ?? 'Desculpe, não consegui processar sua mensagem.'

  if (resposta.includes('[HUMANO]')) {
    return { resposta: resposta.replace('[HUMANO]', '').trim(), escalou: true }
  }

  return { resposta, escalou: false }
}

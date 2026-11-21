// src/lib/whatsapp/bot.ts
// Agente de atendimento do WhatsApp.
import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { buscarPecasParaModelo, TipoPeca } from '@/lib/fornecedores'
import { WaConfig } from './send'
import { abrirConsulta, buscarConhecimento } from './consultas'
import { enviarMaterial, listarMateriais } from './materiais'
import { WA_MEDIA_BUCKET } from './media'
import { contextoDeDataParaOAgente } from '@/lib/feriados'

// Modelo rápido e de baixo custo, adequado ao volume de um atendimento por
// mensagem. WA_BOT_MODEL troca por um mais capaz sem mexer no código.
const MODELO = process.env.WA_BOT_MODEL || 'claude-haiku-5-5'
const MAX_RODADAS_FERRAMENTA = 6
// O raciocínio do modelo conta neste limite; a resposta em si é curta
const MAX_TOKENS = 4096
const MENSAGENS_DE_HISTORICO = 20

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

const TIPOS_DE_PECA: TipoPeca[] = ['tela', 'bateria', 'conector']

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_os_por_telefone',
    description: 'Busca as ordens de serviço mais recentes do cliente pelo telefone, com status e valor. Use quando ele perguntar sobre um aparelho que deixou na loja.',
    input_schema: {
      type: 'object',
      properties: {
        telefone: { type: 'string', description: 'Telefone do cliente (somente dígitos)' },
      },
      required: ['telefone'],
    },
  },
  {
    name: 'consultar_respostas_anteriores',
    description: 'Procura o que o responsável da loja já respondeu sobre um assunto parecido (preço de um serviço para um modelo, prazo, política). Chame antes de perguntar ao responsável.',
    input_schema: {
      type: 'object',
      properties: {
        assunto: { type: 'string', description: 'Serviço e modelo do aparelho, ex.: "troca de tela Samsung Galaxy A54 5G"' },
      },
      required: ['assunto'],
    },
  },
  {
    name: 'buscar_pecas_fornecedores',
    description: 'Consulta nos fornecedores da loja as peças disponíveis para um aparelho e o CUSTO de cada uma. Informação interna, para montar a pergunta ao responsável: nunca repasse esses valores nem o nome dos fornecedores ao cliente.',
    input_schema: {
      type: 'object',
      properties: {
        modelo: { type: 'string', description: 'Marca e modelo completos, com variante e 4G/5G quando houver. Ex.: "Samsung Galaxy A54 5G", "iPhone 13 Pro Max"' },
        tipo: { type: 'string', enum: TIPOS_DE_PECA, description: 'tela (display/frontal), bateria ou conector (de carga)' },
      },
      required: ['modelo', 'tipo'],
    },
  },
  {
    name: 'perguntar_ao_responsavel',
    description: 'Envia uma pergunta ao responsável da loja pelo WhatsApp dele quando você não sabe responder com segurança: preço de um reparo, prazo, disponibilidade, desconto, caso fora do comum. A resposta chega depois e é repassada ao cliente automaticamente.',
    input_schema: {
      type: 'object',
      properties: {
        assunto: { type: 'string', description: 'Título curto e reutilizável: serviço e modelo. Ex.: "troca de tela Samsung Galaxy A54 5G"' },
        pergunta: { type: 'string', description: 'Pergunta completa para o responsável: o que o cliente quer, modelo, defeito relatado e, em orçamento, as opções de peça com o custo de cada uma.' },
      },
      required: ['assunto', 'pergunta'],
    },
  },
]

// Só entra na lista de ferramentas quando a loja tem algum material cadastrado
const FERRAMENTA_MATERIAL: Anthropic.Tool = {
  name: 'enviar_material',
  description: 'Envia ao cliente um vídeo, imagem ou documento da biblioteca da loja. Use quando a conversa se encaixar na situação descrita para o material.',
  input_schema: {
    type: 'object',
    properties: {
      material_id: { type: 'string', description: 'Identificador do material, como aparece na lista de materiais disponíveis' },
    },
    required: ['material_id'],
  },
}

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

type ContextoFerramenta = { supabase: SupabaseClient; filialId: string; conversaId: string; envio: WaConfig }

async function executeTool(toolName: string, toolInput: Record<string, string>, ctx: ContextoFerramenta): Promise<string> {
  const { supabase, filialId } = ctx

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

  if (toolName === 'consultar_respostas_anteriores') {
    return buscarConhecimento(supabase, filialId, toolInput.assunto ?? '')
  }

  if (toolName === 'buscar_pecas_fornecedores') {
    const tipo = toolInput.tipo as TipoPeca
    if (!toolInput.modelo?.trim() || !TIPOS_DE_PECA.includes(tipo)) return 'Informe o modelo do aparelho e o tipo de peça (tela, bateria ou conector).'
    const { pecas, falhas, doCache } = await buscarPecasParaModelo(toolInput.modelo, tipo)
    const avisos = [
      falhas.length ? `Fornecedor sem resposta agora: ${falhas.join(', ')}.` : '',
      doCache.length ? `Valores de ${doCache.join(', ')} são da última consulta guardada.` : '',
    ].filter(Boolean).join(' ')
    if (pecas.length === 0) {
      return `Nenhuma peça de ${tipo} encontrada para "${toolInput.modelo}". ${avisos} Confirme o modelo exato com o cliente ou pergunte ao responsável.`.trim()
    }
    return `CUSTO de fornecedor (interno, não informar ao cliente) — ${tipo} para ${toolInput.modelo}:\n` +
      pecas.slice(0, 12).map(p => `- ${p.fornecedor}: ${reais(p.preco)} — ${p.nome}`).join('\n') +
      (avisos ? `\n${avisos}` : '')
  }

  if (toolName === 'enviar_material') {
    return enviarMaterial({ supabase, filialId, conversaId: ctx.conversaId, envio: ctx.envio, materialId: toolInput.material_id ?? '' })
  }

  if (toolName === 'perguntar_ao_responsavel') {
    return abrirConsulta({
      supabase, filialId, conversaId: ctx.conversaId, envio: ctx.envio,
      assunto: toolInput.assunto ?? '', pergunta: toolInput.pergunta ?? '',
    })
  }

  return 'Ferramenta desconhecida.'
}

const PROMPT_PADRAO =
  'Você é o assistente de atendimento de uma assistência técnica de celulares. Seja simpático e objetivo.'

async function dadosDaLoja(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('sistema_config')
    .select('chave, valor')
    .in('chave', ['loja_nome', 'loja_telefone', 'loja_endereco', 'loja_horario', 'garantia_dias'])
  const cfg: Record<string, string> = {}
  for (const c of data ?? []) if (c.valor) cfg[c.chave] = c.valor
  return [
    cfg.loja_nome ? `Loja: ${cfg.loja_nome}` : null,
    cfg.loja_endereco ? `Endereço: ${cfg.loja_endereco}` : null,
    cfg.loja_horario ? `Horário de atendimento: ${cfg.loja_horario}` : null,
    cfg.loja_telefone ? `Telefone: ${cfg.loja_telefone}` : null,
    `Garantia dos serviços: ${cfg.garantia_dias || '90'} dias`,
  ].filter(Boolean).join('\n')
}

type MimeDeImagem = Anthropic.Base64ImageSource['media_type']
const MIMES_DE_IMAGEM: string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGENS = 3
const MAX_BYTES_IMAGEM = 4 * 1024 * 1024
// Texto que o webhook grava quando a foto chega sem legenda
const FOTO_SEM_LEGENDA = '📷 Foto'

async function historicoDaConversa(supabase: SupabaseClient, conversaId: string): Promise<Anthropic.MessageParam[]> {
  const { data } = await supabase
    .from('wa_mensagens')
    .select('direcao, conteudo, tipo, media_path, media_mime')
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: false })
    .limit(MENSAGENS_DE_HISTORICO)

  const linhas = (data ?? []).reverse().filter(m => m.conteudo?.trim())
  // O agente vê as fotos que o cliente mandou depois da última resposta da loja;
  // as mais antigas já foram comentadas e ficam só como texto.
  let ultimaSaida = -1
  linhas.forEach((m, i) => { if (m.direcao === 'saida') ultimaSaida = i })

  const messages: Anthropic.MessageParam[] = []
  let imagens = 0
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i]
    const role = m.direcao === 'entrada' ? ('user' as const) : ('assistant' as const)
    const mime = String(m.media_mime ?? '').split(';')[0].trim()
    if (role === 'user' && i > ultimaSaida && m.tipo === 'imagem' && m.media_path && MIMES_DE_IMAGEM.includes(mime) && imagens < MAX_IMAGENS) {
      const { data: arquivo } = await supabase.storage.from(WA_MEDIA_BUCKET).download(m.media_path as string)
      const bytes = arquivo ? Buffer.from(await arquivo.arrayBuffer()) : null
      if (bytes && bytes.length > 0 && bytes.length <= MAX_BYTES_IMAGEM) {
        imagens++
        const legenda = m.conteudo === FOTO_SEM_LEGENDA ? 'O cliente enviou esta foto.' : `O cliente enviou esta foto com a legenda: ${m.conteudo}`
        messages.push({
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime as MimeDeImagem, data: bytes.toString('base64') } },
            { type: 'text', text: legenda },
          ],
        })
        continue
      }
    }
    messages.push({ role, content: m.conteudo as string })
  }

  // A API exige que a primeira mensagem seja do usuário
  while (messages.length > 0 && messages[0].role !== 'user') messages.shift()
  return messages
}

const textoDa = (response: Anthropic.Message) =>
  response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()

export async function processBot(
  mensagem: string,
  telefone: string,
  conversaId: string,
  supabase: SupabaseClient,
  filialId: string,
  envio: WaConfig
): Promise<{ resposta: string; escalou: boolean; ferramentas: string[] }> {
  const ferramentas: string[] = []
  const [{ data: waConfig }, loja, materiais] = await Promise.all([
    supabase.from('wa_config').select('bot_prompt').eq('filial_id', filialId).maybeSingle(),
    dadosDaLoja(supabase),
    listarMateriais(supabase, filialId),
  ])
  const tools = materiais.length > 0 ? [...TOOLS, FERRAMENTA_MATERIAL] : TOOLS
  const secaoMateriais = materiais.length === 0 ? '' : [
    'Materiais que você pode enviar com enviar_material (cada um no máximo uma vez por conversa):',
    ...materiais.map(m => `- ${m.id} | ${m.tipo} "${m.titulo}": ${m.quando_enviar}`),
    '', '',
  ].join('\n')

  // O prompt da loja define o tom; as regras abaixo valem sempre, porque o
  // webhook depende do marcador [HUMANO] e as ferramentas dependem do telefone.
  const sysPrompt = `${waConfig?.bot_prompt?.trim() || PROMPT_PADRAO}

${loja}

${contextoDeDataParaOAgente()}

Horário e feriados:
- Use o horário de atendimento informado acima. Em feriados a loja normalmente fecha.
- Se hoje for feriado, ou se o cliente falar em ir à loja num dia que é feriado ou véspera de feriado, avise que o horário pode ser diferente e que vale confirmar antes de sair de casa. Não garanta que a loja estará aberta nem fechada num feriado; se o cliente precisar de certeza, consulte o responsável.
- Se a loja estiver fechada agora, diga qual é o próximo horário de atendimento.

Fotos e áudios:
- Você recebe as fotos que o cliente manda e a transcrição dos áudios dele (marcada com 🎤). Use o que vê e o que ouve para entender o defeito e o modelo do aparelho.
- A foto ajuda a descrever o dano, mas não substitui a avaliação na bancada: não feche diagnóstico nem preço só pela foto.
- Se a transcrição de um áudio estiver confusa ou cortada, peça para o cliente repetir por texto.

Como você atende:
- Você responde pelo WhatsApp: mensagens curtas, em português do Brasil, tom cordial e direto, sem markdown e sem listas longas. No máximo um emoji por mensagem.
- O telefone do cliente é ${telefone}. Use esse número nas ferramentas; não peça o telefone ao cliente.
- Consulte dados reais pelas ferramentas. Nunca invente status de ordem de serviço, prazo, disponibilidade ou valor.

Orçamentos de reparo:
1. Descubra o modelo exato do aparelho (marca, modelo, variante como Pro, Plus ou FE, e 4G ou 5G quando existirem as duas versões) e o defeito. Pergunte o que faltar, uma pergunta por mensagem.
2. Chame consultar_respostas_anteriores com o serviço e o modelo. Se o responsável já respondeu sobre o mesmo serviço no mesmo modelo, use essa resposta.
3. Se não houver resposta anterior e o reparo for de tela, bateria ou conector de carga, chame buscar_pecas_fornecedores e depois perguntar_ao_responsavel, colocando na pergunta o modelo, o defeito e as opções de peça com o custo de cada uma. Para outros reparos, chame perguntar_ao_responsavel direto.
4. Depois de perguntar ao responsável, diga ao cliente que está confirmando o valor com o técnico e que retorna em instantes. Não dê palpite de preço.
- Os valores de buscar_pecas_fornecedores são custo de fornecedor, informação interna da loja. Nunca informe esses valores nem cite fornecedores ao cliente.
- Todo preço que você passar é uma estimativa, sujeita à avaliação do aparelho na loja. Diga isso junto com o valor.

${secaoMateriais}Use perguntar_ao_responsavel também para qualquer outra dúvida que você não saiba responder com segurança, como prazo, desconto ou garantia de um caso específico.

Se o cliente pedir para falar com uma pessoa, ou estiver irritado com o atendimento, responda APENAS com: [HUMANO]`

  const messages = await historicoDaConversa(supabase, conversaId)
  // O webhook grava a mensagem antes de chamar o bot; só acrescenta se ela não veio no histórico
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: mensagem })
  }

  const anthropic = getClient()
  const pedir = () => anthropic.messages.create({
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system: sysPrompt,
    tools,
    messages,
  })

  let response = await pedir()
  let rodadas = 0
  while (response.stop_reason === 'tool_use' && rodadas < MAX_RODADAS_FERRAMENTA) {
    rodadas++
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      ferramentas.push(block.name)
      let resultado: string
      try {
        resultado = await executeTool(block.name, block.input as Record<string, string>, { supabase, filialId, conversaId, envio })
      } catch (e) {
        console.error('[WA bot] ferramenta', block.name, e)
        resultado = 'A consulta falhou agora. Se não puder responder sem ela, pergunte ao responsável.'
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultado })
    }

    // O conteúdo volta inteiro, com os blocos de raciocínio, como a API exige entre chamadas de ferramenta
    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })
    response = await pedir()
  }

  const resposta = textoDa(response)

  // Sem texto utilizável, recusa do modelo ou ferramentas além do limite: passa para uma pessoa
  if (!resposta || response.stop_reason === 'tool_use' || response.stop_reason === 'refusal' || resposta.includes('[HUMANO]')) {
    return { resposta: resposta.replace('[HUMANO]', '').trim(), escalou: true, ferramentas }
  }

  return { resposta, escalou: false, ferramentas }
}

/**
 * Transforma a resposta curta do responsável na mensagem que vai para o cliente.
 * Se a IA falhar, a resposta do responsável segue como veio: o cliente não fica sem retorno.
 */
export async function redigirRespostaAoCliente(args: {
  supabase: SupabaseClient
  filialId: string
  conversaId: string
  assunto: string
  respostaDoResponsavel: string
}): Promise<string> {
  const { supabase, conversaId, assunto, respostaDoResponsavel } = args
  try {
    const [loja, historico] = await Promise.all([dadosDaLoja(supabase), historicoDaConversa(supabase, conversaId)])
    const messages: Anthropic.MessageParam[] = [
      ...historico,
      {
        role: 'user',
        content: `[Instrução interna da loja, não é mensagem do cliente]\nO responsável respondeu à consulta "${assunto}":\n"${respostaDoResponsavel}"\n\nEscreva agora a mensagem para o cliente com essa informação.`,
      },
    ]
    const response = await getClient().messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: `Você é o assistente de atendimento de uma assistência técnica de celulares e conversa com o cliente pelo WhatsApp.

${loja}

O responsável da loja acabou de responder a uma consulta sua. Escreva a mensagem que o cliente vai receber:
- Uma mensagem curta, em português do Brasil, cordial e direta, sem markdown, com no máximo um emoji.
- Passe exatamente a informação do responsável: não mude valores, prazos nem condições, e não acrescente promessas.
- Se houver preço, diga que é uma estimativa sujeita à avaliação do aparelho na loja.
- Não mencione consulta interna, sistema, fornecedores nem custo de peça.
- Responda só com o texto da mensagem.`,
      messages,
    })
    const texto = textoDa(response)
    if (texto && response.stop_reason !== 'refusal') return texto
  } catch (e) {
    console.error('[WA bot] redigir resposta do responsável', e)
  }
  return respostaDoResponsavel
}

/** Traduz as falhas mais comuns da API da Anthropic para algo que o dono da loja consegue resolver. */
export function explicarErroDoAgente(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro)
  if (!process.env.ANTHROPIC_API_KEY) return 'A variável ANTHROPIC_API_KEY não está disponível no servidor. Cadastre na Vercel (ambiente Production) e faça um novo deploy.'
  if (/credit balance|billing/i.test(texto)) return 'A conta da Anthropic está sem crédito. Adicione crédito em console.anthropic.com → Billing.'
  if (/authentication_error|invalid x-api-key|401/i.test(texto)) return 'A chave da Anthropic foi recusada. Confira o valor de ANTHROPIC_API_KEY na Vercel.'
  if (/not_found_error|model:/i.test(texto)) return `O modelo ${MODELO} não está disponível para esta chave.`
  if (/rate_limit|429/i.test(texto)) return 'A Anthropic limitou as chamadas por excesso de uso. Tente de novo em instantes.'
  if (/overloaded|529/i.test(texto)) return 'A Anthropic está sobrecarregada no momento. Tente de novo em instantes.'
  return texto.slice(0, 400)
}

/** Chamada mínima à IA, para conferir chave, crédito e modelo sem depender de uma conversa. */
export async function testarAgente(): Promise<{ ok: boolean; modelo: string; detalhe: string }> {
  try {
    const response = await getClient().messages.create({
      model: MODELO,
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Responda apenas com a palavra: funcionando' }],
    })
    return { ok: true, modelo: MODELO, detalhe: textoDa(response) || '(sem texto)' }
  } catch (e) {
    console.error('[WA bot] teste', e)
    return { ok: false, modelo: MODELO, detalhe: explicarErroDoAgente(e) }
  }
}

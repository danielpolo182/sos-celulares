// src/lib/whatsapp/consultas.ts
// Consulta ao responsável: quando o agente não sabe responder, pergunta no
// WhatsApp do responsável, repassa a resposta ao cliente e guarda o que
// aprendeu para as próximas perguntas iguais.
import { SupabaseClient } from '@supabase/supabase-js'
import { sendMessage, sendMessageIds, sendTemplateIds, variantesDeTelefone, WaConfig } from './send'
import { ConfigBot, carregarConfigBot, liberarBot, mesmoTelefone } from './botRegras'
import { janelaAberta } from './janela'
import { registrarNaConversa } from './notify'
import { redigirRespostaAoCliente } from './bot'

/** Modelo aprovado usado quando o responsável não falou com a loja nas últimas 24h. */
export const MODELO_CONSULTA = 'consulta_interna'
export const TEXTO_MODELO_CONSULTA =
  'Consulta do atendimento. Cliente: {{1}}. Pergunta: {{2}}. Responda citando esta mensagem com a orientação para o cliente.'

const HORA_MS = 3_600_000

type Consulta = {
  id: string
  conversa_id: string
  assunto: string
  pergunta: string
  status: 'aberta' | 'respondida' | 'expirada'
  ids_mensagem: string[] | null
  criado_em: string
}

const formatarTelefone = (digitos: string) => {
  const d = digitos.replace(/^55/, '')
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : digitos
}

const umaLinha = (texto: string, limite: number) => {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > limite ? `${t.slice(0, limite - 1)}…` : t
}

async function clienteDaConversa(supabase: SupabaseClient, conversaId: string) {
  const { data } = await supabase.from('wa_conversas').select('telefone, nome_contato').eq('id', conversaId).maybeSingle()
  const telefone = (data?.telefone as string | undefined) ?? ''
  const nome = (data?.nome_contato as string | null | undefined) ?? null
  return { telefone, nome, rotulo: nome ? `${nome} ${formatarTelefone(telefone)}` : formatarTelefone(telefone) }
}

async function avisarResponsavel(
  supabase: SupabaseClient, filialId: string, envio: WaConfig, dono: string, texto: string
): Promise<void> {
  const id = await sendMessage(envio, dono, texto)
  await registrarNaConversa(supabase, filialId, dono, null, texto, id)
}

/**
 * Ferramenta do agente: avisa o responsável de que um aparelho vai voltar à
 * loja para garantia. É só um aviso: não abre consulta nem espera resposta.
 */
export async function avisarGarantia(args: {
  supabase: SupabaseClient
  filialId: string
  conversaId: string
  envio: WaConfig
  resumo: string
}): Promise<string> {
  const { supabase, filialId, conversaId, envio } = args
  const resumo = args.resumo.trim().slice(0, 900)
  if (!resumo) return 'Informe o resumo do caso: aparelho, OS (se houver) e o problema relatado.'

  const config = await carregarConfigBot(supabase, filialId)
  if (!config?.dono_telefone) return 'Não há responsável configurado para receber o aviso. Continue orientando o cliente a levar o aparelho à loja.'
  const dono = config.dono_telefone.startsWith('55') && config.dono_telefone.length >= 12 ? config.dono_telefone : `55${config.dono_telefone}`

  const cliente = await clienteDaConversa(supabase, conversaId)
  const texto = `🛡️ Garantia a caminho\nCliente: ${cliente.rotulo}\n\n${resumo}\n\nJá orientei o cliente a trazer o aparelho o quanto antes. Não precisa responder.`
  try {
    // Fora da janela de 24h só sai modelo aprovado: o aviso vai no corpo do modelo de consulta
    const ids = (await janelaAberta(supabase, filialId, dono))
      ? await sendMessageIds(envio, dono, texto)
      : await sendTemplateIds(envio, dono, MODELO_CONSULTA, [umaLinha(cliente.rotulo, 80), umaLinha(`AVISO DE GARANTIA, não precisa responder. ${resumo}`, 800)])
    try { await registrarNaConversa(supabase, filialId, dono, null, texto, ids[0] ?? null) } catch { /* histórico não é crítico */ }
  } catch (e) {
    console.error('[WA garantia] aviso ao responsável', e instanceof Error ? e.message : e)
    return 'Não foi possível avisar o técnico agora. Continue orientando o cliente a levar o aparelho à loja o quanto antes.'
  }
  return 'Técnico avisado. Não avise de novo sobre este mesmo caso. Continue a conversa com o cliente.'
}

/**
 * Ferramenta do agente: manda a pergunta ao responsável. Devolve o texto que
 * orienta o agente sobre o que dizer ao cliente em seguida.
 */
export async function abrirConsulta(args: {
  supabase: SupabaseClient
  filialId: string
  conversaId: string
  envio: WaConfig
  assunto: string
  pergunta: string
}): Promise<string> {
  const { supabase, filialId, conversaId, envio } = args
  const assunto = umaLinha(args.assunto, 140)
  const pergunta = args.pergunta.trim()
  if (!assunto || !pergunta) return 'Informe o assunto e a pergunta para consultar o responsável.'

  const config = await carregarConfigBot(supabase, filialId)
  if (!config?.dono_telefone) {
    return 'Não há responsável configurado para consultas. Se não souber responder com segurança, responda apenas com [HUMANO].'
  }
  const dono = config.dono_telefone.startsWith('55') && config.dono_telefone.length >= 12 ? config.dono_telefone : `55${config.dono_telefone}`

  const { data: aberta, error: erroLeitura } = await supabase
    .from('wa_consultas')
    .select('id')
    .eq('conversa_id', conversaId)
    .eq('status', 'aberta')
    .limit(1)
    .maybeSingle()
  if (erroLeitura) return 'As consultas ao responsável não estão disponíveis. Se não souber responder, responda apenas com [HUMANO].'
  if (aberta) return 'Já existe uma consulta aberta para este cliente. Diga a ele que você ainda está aguardando a confirmação do técnico.'

  const cliente = await clienteDaConversa(supabase, conversaId)
  const texto = `🔧 Consulta do atendimento\nCliente: ${cliente.rotulo}\n\n${pergunta}\n\nResponda citando esta mensagem; eu repasso ao cliente.`

  let ids: string[]
  try {
    ids = (await janelaAberta(supabase, filialId, dono))
      ? await sendMessageIds(envio, dono, texto)
      : await sendTemplateIds(envio, dono, MODELO_CONSULTA, [umaLinha(cliente.rotulo, 80), umaLinha(pergunta, 800)])
  } catch (e) {
    console.error('[WA consulta] envio ao responsável', e instanceof Error ? e.message : e)
    return 'Não foi possível falar com o responsável agora. Responda apenas com [HUMANO].'
  }

  const { error } = await supabase.from('wa_consultas').insert({
    filial_id: filialId,
    conversa_id: conversaId,
    assunto,
    pergunta,
    ids_mensagem: ids,
    expira_em: new Date(Date.now() + config.consulta_timeout_min * 60_000).toISOString(),
  })
  if (error) console.error('[WA consulta] gravar', error.message)
  try { await registrarNaConversa(supabase, filialId, dono, null, texto, ids[0] ?? null) } catch { /* histórico não é crítico */ }

  return 'Consulta enviada ao responsável. Diga ao cliente, em uma frase, que você está confirmando com o técnico e retorna em instantes. Não informe valores nem prazos antes da resposta.'
}

// ── Memória ───────────────────────────────────────────────────────────────
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const IGNORADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'por', 'com', 'sem', 'que', 'uma', 'um', 'the', 'troca', 'trocar', 'valor', 'preco', 'quanto', 'custa', 'orcamento'])
const palavrasDe = (texto: string) =>
  [...new Set(semAcento(texto).toLowerCase().split(/[^a-z0-9]+/).filter(p => p.length >= 2 && !IGNORADAS.has(p)))]

/** Ferramenta do agente: respostas válidas do responsável sobre assunto parecido, as mais recentes primeiro. */
export async function buscarConhecimento(supabase: SupabaseClient, filialId: string, assunto: string): Promise<string> {
  const procuradas = palavrasDe(assunto)
  if (procuradas.length === 0) return 'Descreva o serviço e o modelo do aparelho para procurar.'

  const { data, error } = await supabase
    .from('wa_conhecimento')
    .select('assunto, resposta, criado_em, valido_ate')
    .eq('filial_id', filialId)
    .order('criado_em', { ascending: false })
    .limit(300)
  if (error) return 'Nenhuma resposta anterior disponível.'

  const agora = Date.now()
  const achadas = (data ?? [])
    .filter(c => !c.valido_ate || new Date(c.valido_ate as string).getTime() > agora)
    .map(c => {
      const palavras = new Set(palavrasDe(c.assunto as string))
      return { c, iguais: procuradas.filter(p => palavras.has(p)).length }
    })
    // Pelo menos metade das palavras procuradas, e nunca uma só coincidência solta
    .filter(x => x.iguais >= Math.max(2, Math.ceil(procuradas.length / 2)) || (procuradas.length === 1 && x.iguais === 1))
    .sort((a, b) => b.iguais - a.iguais)
    .slice(0, 5)

  if (achadas.length === 0) return 'Nenhuma resposta anterior do responsável sobre isso.'
  return 'Respostas anteriores do responsável (use só se forem do mesmo serviço e do mesmo modelo de aparelho):\n' +
    achadas.map(({ c }) => `- ${new Date(c.criado_em as string).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} | ${c.assunto}: ${c.resposta}`).join('\n')
}

// ── Resposta do responsável ───────────────────────────────────────────────
/**
 * Chamado para toda mensagem de texto recebida. Se ela vier do responsável e
 * houver consulta pendente, trata como resposta e devolve true (a mensagem
 * não segue para o atendimento normal).
 */
export async function tratarRespostaDoResponsavel(args: {
  supabase: SupabaseClient
  filialId: string
  envio: WaConfig
  remetente: string
  texto: string
  /** Id da mensagem citada na resposta, quando o responsável respondeu citando. */
  citada?: string | null
}): Promise<boolean> {
  const { supabase, filialId, envio, remetente } = args
  const config = await carregarConfigBot(supabase, filialId)
  if (!config?.dono_telefone || !mesmoTelefone(remetente, config.dono_telefone)) return false

  const { data, error } = await supabase
    .from('wa_consultas')
    .select('id, conversa_id, assunto, pergunta, status, ids_mensagem, criado_em')
    .eq('filial_id', filialId)
    .in('status', ['aberta', 'expirada'])
    .gte('criado_em', new Date(Date.now() - 24 * HORA_MS).toISOString())
    .order('criado_em', { ascending: false })
  const pendentes = (data ?? []) as Consulta[]
  // Sem consulta pendente, o responsável é um contato comum (ele também testa o atendimento)
  if (error || pendentes.length === 0) return false

  let texto = args.texto.trim()
  let consulta = args.citada ? pendentes.find(c => (c.ids_mensagem ?? []).includes(args.citada as string)) : undefined

  if (!consulta && pendentes.length > 1) {
    // "2 pode fazer por 380": o número escolhe a consulta da lista enviada antes
    const m = texto.match(/^(\d{1,2})[\s).:-]+([\s\S]+)$/)
    const indice = m ? Number(m[1]) - 1 : -1
    if (m && pendentes[indice]) {
      consulta = pendentes[indice]
      texto = m[2].trim()
    } else {
      const lista = await Promise.all(pendentes.map(async (c, i) =>
        `${i + 1}) ${(await clienteDaConversa(supabase, c.conversa_id)).rotulo}: ${c.assunto}`))
      await avisarResponsavel(supabase, filialId, envio, remetente,
        `Tenho ${pendentes.length} consultas aguardando:\n${lista.join('\n')}\n\nResponda citando a consulta, ou comece a mensagem pelo número dela (ex.: "1 pode fazer por 380").`)
      return true
    }
  }
  consulta ??= pendentes[0]

  try {
    await responderConsulta(supabase, filialId, envio, config, consulta, texto, remetente)
  } catch (e) {
    console.error('[WA consulta] repassar resposta', e)
    await avisarResponsavel(supabase, filialId, envio, remetente,
      `Não consegui repassar sua resposta sobre "${consulta.assunto}". Responda o cliente direto pelo WhatsApp da loja.`).catch(() => {})
  }
  return true
}

async function responderConsulta(
  supabase: SupabaseClient, filialId: string, envio: WaConfig, config: ConfigBot,
  consulta: Consulta, resposta: string, dono: string
): Promise<void> {
  const agora = new Date()
  await supabase.from('wa_consultas')
    .update({ status: 'respondida', resposta, respondido_em: agora.toISOString() })
    .eq('id', consulta.id)

  const { error: erroMemoria } = await supabase.from('wa_conhecimento').insert({
    filial_id: filialId,
    assunto: consulta.assunto,
    resposta,
    consulta_id: consulta.id,
    valido_ate: new Date(agora.getTime() + config.conhecimento_validade_dias * 24 * HORA_MS).toISOString(),
  })
  if (erroMemoria) console.error('[WA consulta] memória', erroMemoria.message)

  const cliente = await clienteDaConversa(supabase, consulta.conversa_id)
  const mensagem = await redigirRespostaAoCliente({
    supabase, filialId, conversaId: consulta.conversa_id, assunto: consulta.assunto, respostaDoResponsavel: resposta,
  })

  const id = await sendMessage(envio, cliente.telefone, mensagem)
  await supabase.from('wa_mensagens').insert({ conversa_id: consulta.conversa_id, direcao: 'saida', conteudo: mensagem, wa_message_id: id })
  // A conversa pode ter sido marcada como pendente quando o prazo venceu: o agente retoma
  await liberarBot(supabase, consulta.conversa_id)
  await supabase.from('wa_conversas').update({ status: 'bot', atualizado_em: agora.toISOString() }).eq('id', consulta.conversa_id)

  await avisarResponsavel(supabase, filialId, envio, dono, `✅ Respondi ${cliente.rotulo}:\n"${mensagem}"`)
}

// ── Prazo ─────────────────────────────────────────────────────────────────
/**
 * Consultas sem resposta dentro do prazo: o cliente recebe um aviso, a conversa
 * fica pendente no Inbox e o responsável é lembrado. Roda a cada evento do
 * webhook, porque não há agendador de minutos disponível.
 */
export async function expirarConsultas(supabase: SupabaseClient, filialId: string, envio: WaConfig): Promise<void> {
  const { data, error } = await supabase
    .from('wa_consultas')
    .select('id, conversa_id, assunto')
    .eq('filial_id', filialId)
    .eq('status', 'aberta')
    .lte('expira_em', new Date().toISOString())
    .limit(10)
  if (error || !data?.length) return

  const config = await carregarConfigBot(supabase, filialId)
  for (const c of data) {
    // Marca antes de avisar e só segue se esta execução foi quem marcou: dois eventos simultâneos não avisam em dobro
    const { data: marcada } = await supabase.from('wa_consultas')
      .update({ status: 'expirada' }).eq('id', c.id).eq('status', 'aberta').select('id')
    if (!marcada?.length) continue

    try {
      const cliente = await clienteDaConversa(supabase, c.conversa_id as string)
      const aviso = 'Ainda estou aguardando a confirmação do técnico. Assim que tiver o retorno, aviso você por aqui.'
      const id = await sendMessage(envio, cliente.telefone, aviso)
      await supabase.from('wa_mensagens').insert({ conversa_id: c.conversa_id, direcao: 'saida', conteudo: aviso, wa_message_id: id })
      await supabase.from('wa_conversas').update({ status: 'humano' }).eq('id', c.conversa_id)
      if (config?.dono_telefone) {
        const dono = config.dono_telefone.startsWith('55') && config.dono_telefone.length >= 12 ? config.dono_telefone : `55${config.dono_telefone}`
        await avisarResponsavel(supabase, filialId, envio, dono,
          `⏰ Consulta sem resposta: ${cliente.rotulo}, ${c.assunto}. Avisei o cliente que ainda estou confirmando. Você ainda pode responder citando a consulta.`)
      }
    } catch (e) {
      console.error('[WA consulta] prazo vencido', e)
    }
  }
}

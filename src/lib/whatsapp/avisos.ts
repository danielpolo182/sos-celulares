// src/lib/whatsapp/avisos.ts
// Avisos automáticos de ordem de serviço enviados por modelo aprovado do WhatsApp.
// Este arquivo não acessa o banco: é usado tanto no servidor quanto na tela de
// configurações, que mostra os textos para cadastro no provedor.

export type AvisoOS = 'entrada' | 'pronta' | 'lembrete' | 'ultimo_aviso' | 'entregue'

export const AVISOS: AvisoOS[] = ['entrada', 'pronta', 'lembrete', 'ultimo_aviso', 'entregue']

/** Guardado em wa_config.avisos. Tudo desligado até a loja ligar cada aviso. */
export type ConfigAvisos = Record<AvisoOS, boolean> & {
  /** Dias depois de a OS ficar pronta em que sai um lembrete de retirada. */
  lembrete_dias: number[]
  /** Dias depois de a OS ficar pronta em que sai o último aviso. */
  ultimo_aviso_dias: number
}

export const AVISOS_PADRAO: ConfigAvisos = {
  entrada: false,
  pronta: false,
  lembrete: false,
  ultimo_aviso: false,
  entregue: false,
  lembrete_dias: [7, 30],
  ultimo_aviso_dias: 90,
}

/** Lê o JSON do banco tolerando campos ausentes ou inválidos. */
export function lerConfigAvisos(bruto: unknown): ConfigAvisos {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const dias = Array.isArray(b.lembrete_dias)
    ? [...new Set(b.lembrete_dias.map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((x, y) => x - y)
    : AVISOS_PADRAO.lembrete_dias
  const ultimo = Number(b.ultimo_aviso_dias)
  return {
    entrada: b.entrada === true,
    pronta: b.pronta === true,
    lembrete: b.lembrete === true,
    ultimo_aviso: b.ultimo_aviso === true,
    entregue: b.entregue === true,
    lembrete_dias: dias,
    ultimo_aviso_dias: Number.isInteger(ultimo) && ultimo > 0 ? ultimo : AVISOS_PADRAO.ultimo_aviso_dias,
  }
}

/** Converte "7, 30" em [7, 30]; ignora o que não for número inteiro positivo. */
export function lerListaDeDias(texto: string): number[] {
  return [...new Set(texto.split(/[^\d]+/).map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((x, y) => x - y)
}

export type DadosAviso = {
  nome: string
  aparelho: string
  numero: number | string
  /** Já formatado: "R$ 150,00", "já pago", "sem custo"… */
  valor: string
  horario: string
  dias: number
  /** Data em que a OS ficou pronta, dd/mm/aaaa. */
  prontaDesde: string
  /** Taxa mensal de guarda prevista na OS, sem o "R$". */
  taxa: string
  /** Último dia da garantia, dd/mm/aaaa. */
  garantiaAte: string
}

type ModeloAviso = {
  /** Nome do modelo no provedor; o cadastro precisa usar exatamente este. */
  modelo: string
  titulo: string
  quando: string
  /** Texto a cadastrar; {{n}} segue a ordem de `variaveis`. */
  texto: string
  variaveis: (keyof DadosAviso)[]
}

export const MODELOS_AVISO: Record<AvisoOS, ModeloAviso> = {
  entrada: {
    modelo: 'os_entrada',
    titulo: 'Entrada do aparelho',
    quando: 'Ao abrir a ordem de serviço',
    texto: 'Olá, {{1}}! Recebemos seu {{2}} para atendimento. Sua ordem de serviço é a nº {{3}}. Avisaremos por aqui quando ele estiver pronto para retirada.',
    variaveis: ['nome', 'aparelho', 'numero'],
  },
  pronta: {
    modelo: 'os_pronta_retirada',
    titulo: 'Pronto para retirada',
    quando: 'Quando a OS passa para "Pronta"',
    texto: 'Olá, {{1}}! Seu {{2}} (OS nº {{3}}) está pronto para retirada. Valor do serviço: {{4}}. Horário de atendimento: {{5}}. Esperamos você!',
    variaveis: ['nome', 'aparelho', 'numero', 'valor', 'horario'],
  },
  lembrete: {
    modelo: 'os_lembrete_retirada',
    titulo: 'Lembrete de retirada',
    quando: 'Nos dias configurados depois de a OS ficar pronta',
    texto: 'Olá, {{1}}! Seu {{2}} (OS nº {{3}}) está pronto para retirada há {{4}} dias. Horário de atendimento: {{5}}. Se precisar combinar outro dia, é só responder esta mensagem.',
    variaveis: ['nome', 'aparelho', 'numero', 'dias', 'horario'],
  },
  ultimo_aviso: {
    modelo: 'os_ultimo_aviso_retirada',
    titulo: 'Último aviso de retirada',
    quando: 'No prazo final, com o prazo de retirada da OS já vencido',
    texto: 'Olá, {{1}}. Seu {{2}} (OS nº {{3}}) está pronto para retirada desde {{4}} e o prazo de retirada informado na ordem de serviço já venceu. Conforme a ordem de serviço, após esse prazo é cobrada taxa de guarda de R$ {{5}} por mês. Pedimos que retire o aparelho ou responda esta mensagem. Horário de atendimento: {{6}}. Este é o último aviso automático sobre esta ordem de serviço.',
    variaveis: ['nome', 'aparelho', 'numero', 'prontaDesde', 'taxa', 'horario'],
  },
  entregue: {
    modelo: 'os_entregue_garantia',
    titulo: 'Retirada e garantia',
    quando: 'Quando a OS passa para "Entregue"',
    texto: 'Olá, {{1}}! Confirmamos a retirada do seu {{2}} (OS nº {{3}}). A garantia do serviço vale até {{4}}. Qualquer dúvida, é só responder esta mensagem. Obrigado pela preferência!',
    variaveis: ['nome', 'aparelho', 'numero', 'garantiaAte'],
  },
}

// A Meta recusa parâmetro vazio, com quebra de linha, tabulação ou mais de 4 espaços seguidos
function limparParametro(valor: unknown): string {
  const texto = String(valor ?? '').replace(/\s+/g, ' ').trim()
  return texto || '-'
}

export function parametrosDoAviso(aviso: AvisoOS, dados: DadosAviso): string[] {
  return MODELOS_AVISO[aviso].variaveis.map(v => limparParametro(dados[v]))
}

/** Texto como o cliente recebe, para registrar na conversa e conferir na tela. */
export function textoDoAviso(aviso: AvisoOS, dados: DadosAviso): string {
  const params = parametrosDoAviso(aviso, dados)
  return MODELOS_AVISO[aviso].texto.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
}

/**
 * Qual aviso de retirada está vencido para uma OS pronta há `dias` dias.
 * Devolve só o mais recente; os lembretes anteriores que não saíram ficam para trás.
 */
export function avisoDeRetiradaDevido(
  dias: number,
  config: ConfigAvisos,
  jaRegistrados: Record<string, unknown>,
  prazoDaOsVencido: boolean
): { aviso: 'lembrete' | 'ultimo_aviso'; chave: string; pular: string[] } | null {
  if (jaRegistrados.ultimo_aviso) return null

  const lembretes = config.lembrete_dias.filter(d => d < config.ultimo_aviso_dias)
  if (config.ultimo_aviso && dias >= config.ultimo_aviso_dias && prazoDaOsVencido) {
    return { aviso: 'ultimo_aviso', chave: 'ultimo_aviso', pular: lembretes.map(d => `lembrete_${d}`) }
  }

  if (!config.lembrete) return null
  const vencidos = lembretes.filter(d => dias >= d)
  const ultimo = vencidos[vencidos.length - 1]
  if (ultimo === undefined || jaRegistrados[`lembrete_${ultimo}`]) return null
  return {
    aviso: 'lembrete',
    chave: `lembrete_${ultimo}`,
    pular: vencidos.slice(0, -1).map(d => `lembrete_${d}`).filter(c => !jaRegistrados[c]),
  }
}

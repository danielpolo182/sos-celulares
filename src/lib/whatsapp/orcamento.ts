// src/lib/whatsapp/orcamento.ts
// Orçamento automático: consulta as peças nos fornecedores, separa por tipo
// (LCD, OLED, Soft OLED…) e aplica as regras de preço da loja. O cliente
// recebe uma opção por tipo, só com o tipo e o preço, sem marca.
import { Fornecedor, PecaFornecedor, TipoPeca, buscarPecasParaModelo } from '@/lib/fornecedores'
import { ChaveDeRegra, ConfigPrecos, ROTULO_DA_REGRA, custoDeReferencia, precoPelaRegra } from './precoRegras'

const simples = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')

export type Aro = 'com' | 'sem' | null

export function aroDaPeca(nomeDaPeca: string): Aro {
  const nome = simples(nomeDaPeca)
  // Os fornecedores escrevem "SEM ARO", "S/ARO" e "*S/ARO*"
  if (/(^|[^a-z])(sem aro|s\/ ?aro)([^a-z]|$)/.test(nome)) return 'sem'
  if (/(^|[^a-z])(com aro|c\/ ?aro)([^a-z]|$)/.test(nome)) return 'com'
  return null
}

type Tecnologia = 'genuina' | 'nacional' | 'soft' | 'oled' | 'lcd'

/** A primeira palavra-chave que aparecer no nome define a tecnologia; sem nenhuma, é LCD. */
function tecnologiaDaTela(nomeDaPeca: string): Tecnologia {
  const nome = simples(nomeDaPeca)
  if (nome.includes('nao precisa trocar eprom')) return 'genuina'
  if (nome.includes('nacional') || nome.includes('genuina')) return 'nacional'
  if (nome.includes('soft oled')) return 'soft'
  if (nome.includes('oled') || nome.includes('amoled')) return 'oled'
  return 'lcd'
}

const ehIphone = (modelo: string) => /iphone/i.test(modelo)

/** Em que linha de preço a peça entra. null = a loja não orça essa peça sozinha. */
export function regraDaPeca(nomeDaPeca: string, servico: TipoPeca, modelo: string): ChaveDeRegra | null {
  const nome = simples(nomeDaPeca)
  const iphone = ehIphone(modelo)

  if (servico === 'bateria') {
    if (nome.includes('calibra genuina')) return 'bateria_genuina'
    // Bateria sem flex exige transferir o flex da antiga: a loja não oferece
    if (nome.includes('sem flex')) return null
    return 'bateria'
  }

  if (servico === 'conector') {
    // O componente avulso para solda é outro serviço, com preço combinado à parte
    if (nome.includes('para solda')) return null
    if (iphone) return 'conector_iphone'
    return /(^|[^a-z])placa([^a-z]|$)/.test(nome) ? 'placa_conector' : null
  }

  const tecnologia = tecnologiaDaTela(nomeDaPeca)
  if (tecnologia === 'genuina') return 'soft_oled_genuina'
  if (tecnologia === 'soft') return 'soft_oled'
  if (iphone) return tecnologia === 'nacional' ? 'nacional' : tecnologia === 'oled' ? 'oled' : 'lcd_iphone'

  // No Android o aro muda o preço; peça que não diz se tem aro não entra no cálculo
  const aro = aroDaPeca(nomeDaPeca)
  if (!aro) return null
  if (tecnologia === 'nacional') return aro === 'com' ? 'nacional' : null
  if (tecnologia === 'oled') return aro === 'com' ? 'oled' : 'oled_sem_aro'
  return aro === 'com' ? 'lcd_com_aro' : 'lcd_sem_aro'
}

export type OpcaoDeOrcamento = {
  chave: ChaveDeRegra
  /** Como o cliente lê a opção. */
  rotulo: string
  custo: number
  preco: number
  pecas: PecaFornecedor[]
}

export type Orcamento = {
  modelo: string
  servico: TipoPeca
  ativo: boolean
  opcoes: OpcaoDeOrcamento[]
  /** Opções que existem no fornecedor mas ficaram de fora, com o motivo (para a loja, não para o cliente). */
  deFora: { rotulo: string; motivo: string; custo: number }[]
  falhas: Fornecedor[]
}

const NOME_DO_SERVICO: Record<TipoPeca, string> = { tela: 'Troca de tela', bateria: 'Troca de bateria', conector: 'Troca de conector de carga' }
const TIPOS_OLED: ChaveDeRegra[] = ['oled', 'oled_sem_aro', 'soft_oled', 'soft_oled_genuina']

/** Agrupa as peças encontradas e calcula uma opção por tipo. Não faz consulta: recebe as peças prontas. */
export function calcularOpcoes(
  pecas: PecaFornecedor[], servico: TipoPeca, modelo: string, config: ConfigPrecos
): Pick<Orcamento, 'opcoes' | 'deFora'> {
  const grupos = new Map<ChaveDeRegra, PecaFornecedor[]>()
  for (const p of pecas) {
    const chave = regraDaPeca(p.nome, servico, modelo)
    if (chave) grupos.set(chave, [...(grupos.get(chave) ?? []), p])
  }

  const custoDe = (chave: ChaveDeRegra) => {
    const lista = grupos.get(chave)
    return lista ? custoDeReferencia(lista.map(p => p.preco), config.regras[chave].custo) : null
  }
  const aparelhoOled = TIPOS_OLED.some(t => grupos.has(t))
  const custoDaOled = custoDe('oled')

  const opcoes: OpcaoDeOrcamento[] = []
  const deFora: Orcamento['deFora'] = []
  for (const [chave, lista] of grupos) {
    const regra = config.regras[chave]
    const custo = custoDe(chave) as number
    const rotulo = ROTULO_DA_REGRA[chave].cliente
    let motivo = ''
    if (!regra.oferecer) motivo = 'a loja não oferece esta opção'
    // Aparelho de tela OLED com LCD de reposição: só a LCD com aro
    else if (chave === 'lcd_sem_aro' && aparelhoOled) motivo = 'aparelho de tela OLED: só a LCD com aro'
    else if (chave === 'nacional' && !aparelhoOled) motivo = 'tela nacional só é oferecida em aparelho de tela OLED'
    // "Nacional" que custa quase o mesmo que a OLED comum é só o nome da marca, não uma tela superior
    else if (chave === 'nacional' && custoDaOled !== null && custo < custoDaOled * config.nacionalMinimoSobreOled) motivo = 'custa quase o mesmo que a OLED comum'
    if (motivo) { deFora.push({ rotulo, motivo, custo }); continue }
    opcoes.push({ chave, rotulo, custo, preco: precoPelaRegra(custo, regra, config.arredondar), pecas: [...lista].sort((a, b) => a.preco - b.preco) })
  }
  opcoes.sort((a, b) => a.preco - b.preco)

  // Com uma LCD só, "com aro" não acrescenta nada para o cliente
  const lcds = opcoes.filter(o => o.chave === 'lcd_sem_aro' || o.chave === 'lcd_com_aro')
  if (lcds.length === 1) lcds[0].rotulo = 'Tela LCD'
  return { opcoes, deFora }
}

/** Consulta os fornecedores e monta o orçamento do modelo para o serviço. */
export async function montarOrcamento(modelo: string, servico: TipoPeca, config: ConfigPrecos): Promise<Orcamento> {
  const { pecas, falhas } = await buscarPecasParaModelo(modelo, servico)
  return { modelo, servico, ativo: config.ativo, falhas, ...calcularOpcoes(pecas, servico, modelo, config) }
}

const reais = (v: number) => `R$ ${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')}`

/** Texto devolvido ao agente pela ferramenta montar_orcamento. */
export function orcamentoParaOAgente(o: Orcamento): string {
  if (o.opcoes.length === 0) {
    const semResposta = o.falhas.length ? ` Fornecedor sem resposta agora: ${o.falhas.join(', ')}.` : ''
    return `Sem preço automático para ${NOME_DO_SERVICO[o.servico].toLowerCase()} de ${o.modelo}.${semResposta} Confirme o modelo exato com o cliente; se estiver certo, siga para as respostas anteriores do responsável e, se não houver, pergunte a ele.`
  }
  return `${NOME_DO_SERVICO[o.servico]} de ${o.modelo}. Preços ao cliente, já calculados pela regra da loja:\n` +
    o.opcoes.map(x => `- ${x.rotulo}: ${reais(x.preco)}`).join('\n') +
    '\nInforme todas estas opções com exatamente estes valores, da mais barata para a mais cara. Não cite marca, fornecedor nem custo. Diga que são estimativas sujeitas à avaliação do aparelho na loja. Não consulte o responsável sobre estes valores.'
}

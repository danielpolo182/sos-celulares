export interface Condicao { item: string; estado: string; gravidade?: 'baixa' | 'media' | 'alta' }

export interface RecondAparelho {
  id: string
  user_id?: string | null
  marca?: string | null
  modelo: string
  capacidade?: string | null
  cor?: string | null
  imei?: string | null
  descricao?: string | null
  condicoes_json?: Condicao[] | null
  diagnostico?: string | null
  status: string
  custo_pecas?: number | null
  valor_venda?: number | null
  observacoes?: string | null
  aparelho_id?: string | null
  created_at?: string
}

export interface RecondPasso {
  id: string
  aparelho_id: string
  ordem: number
  tipo: string
  instrucao: string
  resultado?: string | null
  concluido: boolean
  origem?: string
  created_at?: string
}

export interface RecondPeca {
  id: string
  aparelho_id: string
  peca_nome: string
  preco?: number | null
  fornecedor?: string | null
  url?: string | null
  aproveitavel?: boolean
  created_at?: string
}

export const STATUS_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  triagem:          { label: 'Triagem',          cor: '#7c3aed', bg: '#f5f3ff' },
  diagnostico:      { label: 'Em diagnóstico',   cor: '#2563eb', bg: '#eff6ff' },
  aguardando_pecas: { label: 'Aguard. peças',    cor: '#d97706', bg: '#fffbeb' },
  reparo:           { label: 'Em reparo',        cor: '#0891b2', bg: '#ecfeff' },
  pronto:           { label: 'Pronto',           cor: '#16a34a', bg: '#f0fdf4' },
  descartado:       { label: 'Descartado',       cor: '#dc2626', bg: '#fef2f2' },
}

export const GRAVIDADE_CFG: Record<string, { cor: string; bg: string }> = {
  baixa: { cor: '#16a34a', bg: '#f0fdf4' },
  media: { cor: '#d97706', bg: '#fffbeb' },
  alta:  { cor: '#dc2626', bg: '#fef2f2' },
}

export function fm(v: number | null | undefined): string {
  return `R$ ${(v ?? 0).toFixed(2).replace('.', ',')}`
}

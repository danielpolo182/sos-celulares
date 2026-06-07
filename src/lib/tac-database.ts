export type ModelSpec = {
  marca: string
  modelo: string
  display: string
  displayTipo: 'AMOLED' | 'Super AMOLED' | 'OLED' | 'IPS LCD' | 'LCD' | 'TFT'
  resolucao: string
  bateria: string
  processador: string
  ram: string
  camera: string
}

// TAC prefixes → model specs (8 first digits of IMEI)
export const TAC_DATABASE: Record<string, ModelSpec> = {
  // Samsung
  '35260611': { marca: 'Samsung', modelo: 'Galaxy A32', display: '6.4"', displayTipo: 'Super AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Helio G80', ram: '4GB', camera: '64MP' },
  '35299911': { marca: 'Samsung', modelo: 'Galaxy A32 5G', display: '6.5"', displayTipo: 'IPS LCD', resolucao: '720x1600', bateria: '5000mAh', processador: 'Dimensity 720', ram: '4GB', camera: '48MP' },
  '35355511': { marca: 'Samsung', modelo: 'Galaxy A52', display: '6.5"', displayTipo: 'Super AMOLED', resolucao: '1080x2400', bateria: '4500mAh', processador: 'Snapdragon 720G', ram: '6GB', camera: '64MP' },
  '35924411': { marca: 'Samsung', modelo: 'Galaxy A52s', display: '6.5"', displayTipo: 'Super AMOLED', resolucao: '1080x2400', bateria: '4500mAh', processador: 'Snapdragon 778G', ram: '6GB', camera: '64MP' },
  '35112211': { marca: 'Samsung', modelo: 'Galaxy A72', display: '6.7"', displayTipo: 'Super AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Snapdragon 720G', ram: '6GB', camera: '64MP' },
  '35678811': { marca: 'Samsung', modelo: 'Galaxy S21', display: '6.2"', displayTipo: 'AMOLED', resolucao: '1080x2400', bateria: '4000mAh', processador: 'Snapdragon 888', ram: '8GB', camera: '64MP' },
  '35123411': { marca: 'Samsung', modelo: 'Galaxy S22', display: '6.1"', displayTipo: 'AMOLED', resolucao: '1080x2340', bateria: '3700mAh', processador: 'Snapdragon 8 Gen 1', ram: '8GB', camera: '50MP' },
  '35456711': { marca: 'Samsung', modelo: 'Galaxy A03s', display: '6.5"', displayTipo: 'IPS LCD', resolucao: '720x1600', bateria: '5000mAh', processador: 'Helio P35', ram: '3GB', camera: '13MP' },
  '35789011': { marca: 'Samsung', modelo: 'Galaxy A13', display: '6.6"', displayTipo: 'IPS LCD', resolucao: '1080x2408', bateria: '5000mAh', processador: 'Exynos 850', ram: '4GB', camera: '50MP' },
  '35234511': { marca: 'Samsung', modelo: 'Galaxy A23', display: '6.6"', displayTipo: 'IPS LCD', resolucao: '1080x2408', bateria: '5000mAh', processador: 'Snapdragon 680', ram: '4GB', camera: '50MP' },
  '35890111': { marca: 'Samsung', modelo: 'Galaxy A53', display: '6.5"', displayTipo: 'Super AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Exynos 1280', ram: '6GB', camera: '64MP' },
  '35901211': { marca: 'Samsung', modelo: 'Galaxy A73', display: '6.7"', displayTipo: 'Super AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Snapdragon 778G', ram: '8GB', camera: '108MP' },
  // iPhone
  '35299301': { marca: 'Apple', modelo: 'iPhone 11', display: '6.1"', displayTipo: 'IPS LCD', resolucao: '828x1792', bateria: '3110mAh', processador: 'A13 Bionic', ram: '4GB', camera: '12MP' },
  '35431101': { marca: 'Apple', modelo: 'iPhone 12', display: '6.1"', displayTipo: 'OLED', resolucao: '1170x2532', bateria: '2815mAh', processador: 'A14 Bionic', ram: '4GB', camera: '12MP' },
  '35431201': { marca: 'Apple', modelo: 'iPhone 13', display: '6.1"', displayTipo: 'OLED', resolucao: '1170x2532', bateria: '3227mAh', processador: 'A15 Bionic', ram: '6GB', camera: '12MP' },
  '35674501': { marca: 'Apple', modelo: 'iPhone 14', display: '6.1"', displayTipo: 'OLED', resolucao: '1170x2532', bateria: '3279mAh', processador: 'A15 Bionic', ram: '6GB', camera: '12MP' },
  '35123501': { marca: 'Apple', modelo: 'iPhone 15', display: '6.1"', displayTipo: 'OLED', resolucao: '1179x2556', bateria: '3349mAh', processador: 'A16 Bionic', ram: '6GB', camera: '48MP' },
  '35987601': { marca: 'Apple', modelo: 'iPhone SE (2022)', display: '4.7"', displayTipo: 'IPS LCD', resolucao: '750x1334', bateria: '2018mAh', processador: 'A15 Bionic', ram: '4GB', camera: '12MP' },
  // Motorola
  '35601211': { marca: 'Motorola', modelo: 'Moto G31', display: '6.4"', displayTipo: 'AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Helio G85', ram: '4GB', camera: '50MP' },
  '35712311': { marca: 'Motorola', modelo: 'Moto G52', display: '6.6"', displayTipo: 'AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Snapdragon 680', ram: '4GB', camera: '50MP' },
  '35823411': { marca: 'Motorola', modelo: 'Moto G82', display: '6.6"', displayTipo: 'AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Snapdragon 695', ram: '6GB', camera: '50MP' },
  '35934511': { marca: 'Motorola', modelo: 'Moto G200', display: '6.8"', displayTipo: 'IPS LCD', resolucao: '1080x2460', bateria: '5000mAh', processador: 'Snapdragon 888+', ram: '8GB', camera: '108MP' },
  '35145611': { marca: 'Motorola', modelo: 'Moto E22', display: '6.5"', displayTipo: 'IPS LCD', resolucao: '720x1600', bateria: '4020mAh', processador: 'Helio G37', ram: '3GB', camera: '16MP' },
  // Xiaomi
  '86780011': { marca: 'Xiaomi', modelo: 'Redmi Note 11', display: '6.43"', displayTipo: 'AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Snapdragon 680', ram: '4GB', camera: '50MP' },
  '86890111': { marca: 'Xiaomi', modelo: 'Redmi Note 12', display: '6.67"', displayTipo: 'AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Snapdragon 685', ram: '4GB', camera: '50MP' },
  '86901211': { marca: 'Xiaomi', modelo: 'POCO X5', display: '6.67"', displayTipo: 'AMOLED', resolucao: '1080x2400', bateria: '5000mAh', processador: 'Snapdragon 695', ram: '6GB', camera: '48MP' },
  '86012311': { marca: 'Xiaomi', modelo: 'Xiaomi 12', display: '6.28"', displayTipo: 'AMOLED', resolucao: '1080x2400', bateria: '4500mAh', processador: 'Snapdragon 8 Gen 1', ram: '8GB', camera: '50MP' },
}

// Search by model name (partial match)
export const MODEL_DATABASE: ModelSpec[] = Object.values(TAC_DATABASE)

export function searchByModel(query: string): ModelSpec[] {
  if (!query || query.length < 2) return []
  const q = query.toLowerCase()
  return MODEL_DATABASE.filter(m =>
    m.modelo.toLowerCase().includes(q) ||
    m.marca.toLowerCase().includes(q)
  ).slice(0, 8)
}

export function searchByTAC(tac: string): ModelSpec | null {
  return TAC_DATABASE[tac] ?? null
}

export function validateIMEI(imei: string): boolean {
  const digits = imei.replace(/\D/g, '')
  if (digits.length !== 15) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let d = parseInt(digits[i])
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

// Repair suggestions based on symptoms
export type RepairSuggestion = {
  problema: string
  sugestao: string
  valorMin: number
  valorMax: number
  confianca: number
}

export function suggestRepair(sintomas: string[], modelo: string, marca: string): RepairSuggestion[] {
  const suggestions: RepairSuggestion[] = []
  const s = sintomas.map(x => x.toLowerCase())
  const isSamsung = marca.toLowerCase() === 'samsung'
  const isIphone = marca.toLowerCase() === 'apple'

  if (s.includes('sem imagem') || s.includes('tela preta')) {
    suggestions.push({ problema: 'Display sem imagem', sugestao: 'Troca de display', valorMin: 120, valorMax: isSamsung ? 350 : isIphone ? 450 : 250, confianca: 85 })
  }
  if (s.includes('tela trincada') || s.includes('vidro quebrado')) {
    suggestions.push({ problema: 'Vidro/display danificado', sugestao: 'Troca de display completo', valorMin: 80, valorMax: isSamsung ? 320 : isIphone ? 420 : 220, confianca: 95 })
  }
  if (s.includes('não carrega') || s.includes('carregando lento')) {
    suggestions.push({ problema: 'Problema de carregamento', sugestao: 'Troca de conector de carga', valorMin: 60, valorMax: 180, confianca: 70 })
    suggestions.push({ problema: 'Conector de carga oxidado', sugestao: 'Limpeza + troca de conector', valorMin: 40, valorMax: 120, confianca: 60 })
  }
  if (s.includes('molhado') || s.includes('caiu na água')) {
    suggestions.push({ problema: 'Dano por líquido', sugestao: 'Limpeza ultrassônica + revisão geral', valorMin: 80, valorMax: 200, confianca: 60 })
  }
  if (s.includes('não liga') || s.includes('desligando sozinho')) {
    suggestions.push({ problema: 'Falha de energia', sugestao: 'Verificação de bateria e placa', valorMin: 80, valorMax: 300, confianca: 65 })
    suggestions.push({ problema: 'Bateria viciada', sugestao: 'Troca de bateria', valorMin: 60, valorMax: 150, confianca: 75 })
  }
  if (s.includes('sem áudio') || s.includes('som baixo') || s.includes('falante')) {
    suggestions.push({ problema: 'Falha de áudio', sugestao: 'Troca de falante/alto-falante', valorMin: 40, valorMax: 120, confianca: 80 })
  }
  if (s.includes('câmera') || s.includes('foto')) {
    suggestions.push({ problema: 'Falha na câmera', sugestao: 'Troca do módulo de câmera', valorMin: 80, valorMax: 250, confianca: 75 })
  }
  if (suggestions.length === 0) {
    suggestions.push({ problema: 'Diagnóstico necessário', sugestao: 'Avaliação técnica completa', valorMin: 30, valorMax: 80, confianca: 50 })
  }
  return suggestions.sort((a, b) => b.confianca - a.confianca)
}

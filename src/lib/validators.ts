export function validarCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i)
  let r = (sum * 10) % 11
  if (r === 10 || r === 11) r = 0
  if (r !== parseInt(c[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i)
  r = (sum * 10) % 11
  if (r === 10 || r === 11) r = 0
  return r === parseInt(c[10])
}

export function validarCNPJ(cnpj: string): boolean {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const calc = (n: string, weights: number[]) =>
    weights.reduce((acc, w, i) => acc + parseInt(n[i]) * w, 0)
  const mod = (n: number) => { const r = n % 11; return r < 2 ? 0 : 11 - r }
  const d1 = mod(calc(c, [5,4,3,2,9,8,7,6,5,4,3,2]))
  const d2 = mod(calc(c, [6,5,4,3,2,9,8,7,6,5,4,3,2]))
  return d1 === parseInt(c[12]) && d2 === parseInt(c[13])
}

export function validarTelefone(tel: string): boolean {
  const t = tel.replace(/\D/g, '')
  return t.length === 10 || t.length === 11
}

export function formatarCPF(cpf: string): string {
  const c = cpf.replace(/\D/g, '').slice(0, 11)
  return c.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
}

export function formatarCNPJ(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '').slice(0, 14)
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5')
}

export function formatarTelefone(tel: string): string {
  const t = tel.replace(/\D/g, '').slice(0, 11)
  if (t.length <= 10) return t.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
  return t.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
}

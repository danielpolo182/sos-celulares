import { iconeDaBancada } from '@/lib/bancadaIcone'

export const dynamic = 'force-static'

export function GET() {
  return iconeDaBancada(512)
}

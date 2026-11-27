// Aprovações: página de tela cheia, pensada para o celular. Não usa o menu lateral do sistema,
// que tem largura fixa e não cabe na tela do telefone; o cabeçalho da página tem o link de volta.
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = { title: 'Aprovações · OctaOS' }

export const viewport: Viewport = { themeColor: '#0f172a', width: 'device-width', initialScale: 1 }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

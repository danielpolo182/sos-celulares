import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OctaOS — Sistema de Gestão para Assistências Técnicas',
  description: 'OS, estoque, PDV, CRM, garantias e muito mais. Gerencie sua assistência técnica de celulares com o OctaOS. Teste grátis por 7 dias.',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}

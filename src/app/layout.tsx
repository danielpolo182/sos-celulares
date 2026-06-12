import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OctaOS — Sistema de Gestão',
  description: 'ERP para assistência técnica de celulares',
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

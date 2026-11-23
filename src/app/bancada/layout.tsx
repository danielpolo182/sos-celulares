// Tela da bancada: ocupa o aparelho inteiro, sem o menu do sistema, e pode ser
// instalada na tela inicial do celular como um aplicativo.
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Bancada · OctaOS',
  // O manifesto geral do sistema não vale aqui; o da bancada entra no layout, logo abaixo
  manifest: null,
  appleWebApp: { capable: true, title: 'Bancada', statusBarStyle: 'black-translucent' },
  icons: { icon: '/bancada-icone-192.png', apple: '/bancada-icone-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* O manifesto fica atrás do login como o resto do sistema: com "use-credentials" o navegador manda a sessão ao buscá-lo */}
      <link rel="manifest" href="/bancada.webmanifest" crossOrigin="use-credentials" />
      {children}
    </>
  )
}

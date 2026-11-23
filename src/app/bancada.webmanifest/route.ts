// Manifesto que deixa a tela da bancada ser instalada como aplicativo no celular.
export const dynamic = 'force-static'

export function GET() {
  return new Response(JSON.stringify({
    name: 'Bancada · OctaOS',
    short_name: 'Bancada',
    description: 'Marca a ordem de serviço como em andamento ou pronta e avisa o cliente pelo WhatsApp.',
    start_url: '/bancada',
    scope: '/bancada',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    lang: 'pt-BR',
    icons: [
      { src: '/bancada-icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/bancada-icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/bancada-icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}

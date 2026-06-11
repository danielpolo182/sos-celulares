'use client'
export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProdutosPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/estoque') }, [router])
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font-sans)', color: '#94a3b8' }}>
      Redirecionando para Produtos &amp; Estoque...
    </div>
  )
}

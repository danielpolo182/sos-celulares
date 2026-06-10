'use client'
export const dynamic = 'force-dynamic'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
export default function RelatoriosIndex() {
  const router = useRouter()
  useEffect(() => { router.replace('/relatorios/os') }, [router])
  return null
}

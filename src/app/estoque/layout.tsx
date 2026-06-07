import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar />
      <main style={{
        marginLeft: '240px',
        flex: 1,
        minHeight: '100vh',
      }}>
        {children}
      </main>
    </div>
  )
}

import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'

export default function SurebetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar />
      <TopBar />
      <main style={{ marginLeft: '240px', marginTop: '52px', flex: 1, minHeight: 'calc(100vh - 52px)', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}

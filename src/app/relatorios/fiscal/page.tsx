'use client'
import { ReportLayout, periodoToDates } from '../ReportLayout'
import { useState } from 'react'
export default function RelFiscal() {
  const [periodo, setPeriodo] = useState('30d'); const [dataInicio, setDataInicio] = useState(''); const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])
  return (
    <ReportLayout title="Fiscal" subtitle="Notas fiscais e documentos fiscais" periodo={periodo} setPeriodo={setPeriodo} dataInicio={dataInicio} setDataInicio={setDataInicio} dataFim={dataFim} setDataFim={setDataFim}>
      <div style={{ textAlign:'center',padding:'60px 20px' }}>
        <div style={{ fontSize:40,marginBottom:16 }}>🧾</div>
        <p style={{ fontSize:16,fontWeight:600,color:'#0f172a',marginBottom:8 }}>Módulo Fiscal</p>
        <p style={{ fontSize:14,color:'#64748b',marginBottom:16 }}>A emissão de NF-e e relatórios fiscais estão disponíveis no plano Enterprise.</p>
        <p style={{ fontSize:13,color:'#94a3b8' }}>Para habilitar, configure o certificado digital em Configurações → Integrações → Certificado digital.</p>
      </div>
    </ReportLayout>
  )
}

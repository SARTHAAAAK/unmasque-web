import { useNavigate } from 'react-router-dom'
import { C } from '../../utils/theme.js'
import { Btn } from './UI.jsx'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', animation: 'fadeUp 0.3s ease' }}>
      <div style={{ fontSize: 80, fontWeight: 800, color: C.accent, lineHeight: 1, marginBottom: 16 }}>404</div>
      <h2 style={{ fontSize: 24, fontWeight: 600, color: C.text, marginBottom: 12 }}>Page Not Found</h2>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 32, maxWidth: 400 }}>
        The page you are looking for doesn't exist or has been moved. Please check the URL or return to safety.
      </p>
      <div style={{ display: 'flex', gap: 16 }}>
        <Btn variant="ghost" onClick={() => navigate(-1)}>← Go Back</Btn>
        <Btn onClick={() => navigate('/')}>Return to Dashboard</Btn>
      </div>
    </div>
  )
}

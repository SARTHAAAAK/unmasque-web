import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { C } from './utils/theme.js'
import { Sidebar, TopBar } from './components/layout/Layout.jsx'
import { Spinner } from './components/shared/UI.jsx'
import { refreshSession, logout } from './services/auth.js'


// Pages
import NotFoundPage from './components/shared/NotFoundPage.jsx'
import LoginPage from './components/auth/LoginPage.jsx'
import DashboardPage from './components/dashboard/DashboardPage.jsx'
import ConnectionsPage from './components/connections/ConnectionsPage.jsx'
import ExtractionWizard from './components/extraction/wizard/ExtractionWizard.jsx'

import MonitorPage from './components/extraction/monitor/MonitorPage.jsx'
import ResultsPage from './components/extraction/results/ResultsPage.jsx'
import ExtractionsPage from './components/extraction/ExtractionsPage.jsx'
import SettingsPage from './components/settings/SettingsPage.jsx'
import HelpPage from './components/help/HelpPage.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [authed, setAuthed] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const page = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1)
  const setPage = (p) => navigate('/' + p)
  const [sidebarCollapsed, setCollapsed] = useState(false)
  const [selectedExtractionId, setSelectedExtractionId] = useState(() => sessionStorage.getItem('selectedExtractionId') || null) // FIX: Initialize ID directly from sessionStorage

  useEffect(() => {
    let active = true
    async function restoreSession() {
      try {
        const data = await refreshSession()
        if (!active) return
        if (data?.user) {
          setUser(data.user)
          setAuthed(true)
        }
      } catch {
        // ignore restore failure, user remains unauthenticated
      } finally {
        if (active) setIsRestoring(false)
      }
    }

    restoreSession()
    return () => { active = false }
  }, [])

  useEffect(() => { // FIX: Keep sessionStorage perfectly in sync with React state
    if (selectedExtractionId) {
      sessionStorage.setItem('selectedExtractionId', selectedExtractionId)
    } else {
      sessionStorage.removeItem('selectedExtractionId')
    }
  }, [selectedExtractionId])

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // ignore logout errors and clear local state anyway
    }
    setAuthed(false)
    setUser(null)
    navigate('/dashboard')
    setSelectedExtractionId(null)
  }

  if (isRestoring) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={28} color={C.accent} />
      </div>
    )
  }

  if (!authed) {
    return <LoginPage onLogin={(userData) => { setAuthed(true); setUser(userData) }} />
  }

    return (
    <div style={{
      background: C.bg, minHeight: '100vh',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      color: C.text,
    }}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
                    collapsed={sidebarCollapsed}
          setCollapsed={setCollapsed}
          user={user}
          onLogout={handleLogout}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <TopBar user={user} />
          <main style={{
            flex: 1, overflowY: 'auto', padding: 24, minWidth: 0,
          }}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage setPage={setPage} />} />
              <Route path="/connections" element={<ConnectionsPage setPage={setPage} />} />
              <Route path="/new-extraction" element={<ExtractionWizard setPage={setPage} setSelectedExtractionId={setSelectedExtractionId} user={user} />} />
              <Route path="/monitor" element={<MonitorPage setPage={setPage} extractionId={selectedExtractionId} />} />
              <Route path="/results" element={<ResultsPage setPage={setPage} extractionId={selectedExtractionId} />} />
              <Route path="/extractions" element={<ExtractionsPage setPage={setPage} setSelectedExtractionId={setSelectedExtractionId} />} />
              <Route path="/settings" element={<SettingsPage user={user} />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  )
}

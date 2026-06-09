import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { C, F, FH } from '../../utils/theme.js'
import { Btn } from '../shared/UI.jsx'
import { getNotifications, dismissNotification } from '../../services/api.js'

// ─── SIDEBAR ─────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',      icon: '⬛', label: 'Dashboard' },
  { id: 'new-extraction', icon: '⚡', label: 'New Extraction' },
  { id: 'extractions',    icon: '📋', label: 'My Extractions' },
  { id: 'connections',    icon: '🔌', label: 'DB Connections' },
  null,
  { id: 'settings',       icon: '⚙️', label: 'Settings' },
  { id: 'help',           icon: '📖', label: 'Help & Docs' },
]

export function Sidebar({ collapsed, setCollapsed, user, onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  const page = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1)
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div style={{
      width: collapsed ? 60 : 220,
      background: C.surface,
      borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.2s ease', flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: '18px 14px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: `linear-gradient(135deg, ${C.accent}, #22D3EE)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0,
        }}>🔍</div>
        {!collapsed && (
          <div>
            <div style={{ fontFamily: FH, fontWeight: 800, fontSize: 14, color: C.text, lineHeight: 1.1 }}>UNMASQUE</div>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: 0.5 }}>Web Interface</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '10px 7px', overflowY: 'auto' }}>
        {NAV_ITEMS.map((item, i) => {
          if (!item) return (
            <div key={i} style={{ height: 1, background: C.border, margin: '8px 5px' }} />
          )
          const active = page === item.id
          return (
            <div
              key={item.id}
              onClick={() => navigate('/' + item.id)}
              title={collapsed ? item.label : ''}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                background: active ? C.accentDim : 'transparent',
                color: active ? C.accent : C.muted,
                marginBottom: 2, transition: 'all 0.15s',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && (
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>
                  {item.label}
                </span>
              )}
            </div>
          )
        })}
      </nav>

      {/* User / Collapse */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 7px' }}>
        {!collapsed && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', marginBottom: 4,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: C.accentDim, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 11, color: C.accent,
              fontWeight: 700, flexShrink: 0,
            }}>{initials}</div>
            <div>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>
                {user?.name ?? 'Guest User'}
              </div>
              <div style={{ fontSize: 10, color: C.muted }}>
                {user?.email ?? 'No email provided'}
              </div>
            </div>
          </div>
        )}

        {!collapsed && (
          <button
            onClick={onLogout}
            style={{
              width: '100%', textAlign: 'left', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)', color: C.text,
              padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: 14 }}>🚪</span>
            Logout
          </button>
        )}

        <div
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', cursor: 'pointer', color: C.muted,
            borderRadius: 8, fontSize: 12, transition: 'color 0.15s',
            marginTop: 8,
          }}
        >
          <span style={{ fontSize: 13 }}>{collapsed ? '▶' : '◀'}</span>
          {!collapsed && 'Collapse'}
        </div>
      </div>
    </div>
  )
}

// ─── TOP BAR ─────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard:       'Dashboard',
  'new-extraction':'New Extraction',
  extractions:     'My Extractions',
  connections:     'Database Connections',
  settings:        'Settings',
  help:            'Help & Documentation',
  monitor:         'Live Monitor',
  results:         'Extraction Results',
}

export function TopBar({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const page = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  useEffect(() => {
    let active = true
    async function loadNotifications() {
      try {
        const data = await getNotifications()
        if (active) setNotifications(data.notifications || [])
      } catch {
        // ignore notification fetch failure
      }
    }
    loadNotifications()
    return () => { active = false }
  }, [])

  async function handleDismiss(id) {
    try {
      await dismissNotification(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
    } catch (e) {
      console.error('Failed to dismiss notification', e)
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div style={{
      height: 54, background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: 12, flexShrink: 0,
      position: 'relative',
    }}>
      <div style={{ flex: 1, fontSize: 15, fontFamily: FH, fontWeight: 700, color: C.text }}>
        {PAGE_TITLES[page] || page}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Btn size="sm" onClick={() => navigate('/new-extraction')}>
          ⚡ New Extraction
        </Btn>
        <div style={{ position: 'relative' }}>
          <span
            onClick={() => setShowNotifications(v => !v)}
            style={{ fontSize: 18, cursor: 'pointer', position: 'relative' }}
            title="Notifications"
          >
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: C.red, color: '#fff', fontSize: 9,
                fontWeight: 700, borderRadius: '50%', width: 14, height: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{unreadCount}</span>
            )}
          </span>
          {showNotifications && (
            <div style={{
              position: 'absolute', top: 34, right: -6,
              width: 320, maxHeight: 320, overflowY: 'auto',
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
              zIndex: 10, padding: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Notifications</div>
                <button onClick={() => setShowNotifications(false)} style={{ border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
              {notifications.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted }}>No notifications yet.</div>
              ) : (
                notifications.map(note => (
                  <div key={note.id} style={{
                    padding: '10px 10px 10px 12px', borderRadius: 10,
                    background: note.read ? 'transparent' : C.accentDim,
                    border: `1px solid ${C.border}`, marginBottom: 8,
                    position: 'relative'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, paddingRight: 16 }}>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{note.title}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>{note.time}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, paddingRight: 16 }}>{note.body}</div>
                    <button
                      onClick={() => handleDismiss(note.id)}
                      title="Dismiss"
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'transparent', border: 'none', color: C.muted,
                        cursor: 'pointer', fontSize: 14, padding: 2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >✕</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', background: C.accentDim,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, color: C.accent, fontWeight: 700, cursor: 'pointer',
        }} title={user?.name || 'User'}>
          {initials}
        </div>
      </div>
    </div>
  )
}

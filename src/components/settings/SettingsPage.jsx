import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getSessions, revokeSession, revokeAllOtherSessions, getApiKeys, generateApiKey, revokeApiKey, setupTotp, verifyTotpSetup, verifyTotpDisable, changePassword } from '../../services/auth.js'
import { C, FH } from '../../utils/theme.js'
import { Card, Section, Tabs, Btn, Input, Select, Toggle } from '../shared/UI.jsx'

const THEME_STORAGE_KEY = 'unmasque.theme'

export default function SettingsPage({ user }) {
  const [tab, setTab] = useState(0)

  function maskEmail(email) {
    if (!email) return ''
    const [name, domain] = email.split('@')
    if (!domain) return email
    return `${name[0]}***@${domain}`
  }


  // General
  const [theme, setTheme] = useState(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : null
    return saved || 'Dark'
  })

  const [timezone, setTimezone] = useState('Asia/Kolkata (IST, UTC+5:30)')
  const [samplePct, setSamplePct] = useState('2')
  const [invTimeout, setInvTimeout] = useState('300')
  const [jobTimeout, setJobTimeout] = useState('120')
  const [limitRatio, setLimitRatio] = useState('10')

  // Notifications
  const [notifyCompleted, setNComplete] = useState(true)
  const [notifyFailed, setNFailed] = useState(true)
  const [notifyQueued, setNQueued] = useState(false)
  const [notifyAborted, setNAborted] = useState(true)
  const [notifyEmail, setNEmail] = useState(user?.email || '')
  const [inApp, setInApp] = useState(true)

  // Security
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [twoFA, setTwoFA] = useState(user?.twoFA || false)
  const [totpModal, setTotpModal] = useState(null)
  const [totpSecret, setTotpSecret] = useState('')
  const [totpQr, setTotpQr] = useState('')
  const [totpToken, setTotpToken] = useState('')
  const [totpLoading, setTotpLoading] = useState(false)

  const [apiKeys, setApiKeys] = useState([])

  const [sessions, setSessions] = useState([])

  useEffect(() => {
    let mounted = true
    getSessions().then(data => {
      if (mounted && data.sessions) {
        setSessions(data.sessions)
      }
    }).catch(err => console.error('Failed to load sessions', err))
    getApiKeys().then(data => {
      if (mounted && data.apiKeys) {
        setApiKeys(data.apiKeys)
      }
    }).catch(err => console.error('Failed to load api keys', err))
    return () => { mounted = false }
  }, [])

  const SETTINGS_KEY = `unmasque.settings.${user?.email || 'guest'}`

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY)
      if (saved) {
        const p = JSON.parse(saved)
        if (p.timezone !== undefined) setTimezone(p.timezone)
        if (p.samplePct !== undefined) setSamplePct(p.samplePct)
        if (p.invTimeout !== undefined) setInvTimeout(p.invTimeout)
        if (p.jobTimeout !== undefined) setJobTimeout(p.jobTimeout)
        if (p.limitRatio !== undefined) setLimitRatio(p.limitRatio)

        if (p.notifyCompleted !== undefined) setNComplete(p.notifyCompleted)
        if (p.notifyFailed !== undefined) setNFailed(p.notifyFailed)
        if (p.notifyQueued !== undefined) setNQueued(p.notifyQueued)
        if (p.notifyAborted !== undefined) setNAborted(p.notifyAborted)
        if (p.notifyEmail !== undefined) setNEmail(p.notifyEmail)
        if (p.inApp !== undefined) setInApp(p.inApp)
      }
    } catch (e) { }
  }, [user?.email])

  function applyThemeToDom(themePref) {
    let themeToApply = themePref
    if (themePref === 'System') {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
      themeToApply = prefersDark ? 'Dark' : 'Light'
    }

    // Apply as: data-theme="light" | "dark"
    document.documentElement.setAttribute('data-theme', themeToApply.toLowerCase())
  }


  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
      applyThemeToDom(theme)
    } catch {
      // ignore storage errors
    }

    // Live-update when in System mode
    if (theme !== 'System') return
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq?.addEventListener) return

    const handler = () => applyThemeToDom('System')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  function saveGeneral() {
    try {
      const existingStr = localStorage.getItem(SETTINGS_KEY)
      const existing = existingStr ? JSON.parse(existingStr) : {}
      const toSave = {
        ...existing,
        timezone, samplePct, invTimeout, jobTimeout, limitRatio
      }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave))
      toast.success('General settings saved!')
    } catch (e) {
      toast.error('Failed to save settings')
    }
  }

  function saveNotifications() {
    try {
      const existingStr = localStorage.getItem(SETTINGS_KEY)
      const existing = existingStr ? JSON.parse(existingStr) : {}
      const toSave = {
        ...existing,
        notifyCompleted, notifyFailed, notifyQueued, notifyAborted, notifyEmail, inApp
      }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave))
      toast.success('Notification settings saved!')
    } catch (e) {
      toast.error('Failed to save notification settings')
    }
  }

  async function handleTwoFAChange(newVal) {
    try {
      setTotpLoading(true)
      if (newVal) {
        const res = await setupTotp()
        setTotpQr(res.qrCodeUrl)
        setTotpSecret(res.secret)
        setTotpModal('setup')
      } else {
        setTotpModal('disable')
      }
      setTotpToken('')
    } catch (err) {
      toast.error('Failed to initiate 2FA')
    } finally {
      setTotpLoading(false)
    }
  }

  async function handleVerifyTotp() {
    if (!totpToken) return
    try {
      setTotpLoading(true)
      await verifyTotpSetup(totpToken, totpSecret)
      setTwoFA(true)
      setTotpModal(null)
      toast.success('2FA enabled successfully')
    } catch (err) {
      toast.error(err.message || 'Invalid token')
    } finally {
      setTotpLoading(false)
    }
  }

  async function handleDisableTotp() {
    if (!totpToken) return
    try {
      setTotpLoading(true)
      await verifyTotpDisable(totpToken)
      setTwoFA(false)
      setTotpModal(null)
      toast.success('2FA disabled successfully')
    } catch (err) {
      toast.error(err.message || 'Invalid token')
    } finally {
      setTotpLoading(false)
    }
  }

  async function handleRevoke(id) {
    if (!window.confirm('Revoke this session?')) return
    try {
      const res = await revokeSession(id)
      setSessions(res.sessions || [])
      toast.success('Session revoked')
    } catch (e) {
      toast.error('Failed to revoke session')
    }
  }

  async function handleRevokeAll() {
    if (!window.confirm('Revoke all other active sessions?')) return
    try {
      const res = await revokeAllOtherSessions()
      setSessions(res.sessions || [])
      toast.success('All other sessions revoked')
    } catch (e) {
      toast.error('Failed to revoke sessions')
    }
  }

  async function handleGenerateKey() {
    const name = window.prompt('Enter a name for the new API key:', 'My API Key')
    if (!name) return
    try {
      const res = await generateApiKey(name)
      setApiKeys(prev => [...prev, res.apiKey])
      window.alert(`Your new API key is:\n\n${res.rawKey}\n\nPlease copy it now. You will not be able to see it again!`)
      toast.success('API key generated')
    } catch (e) {
      toast.error('Failed to generate API key')
    }
  }

  async function handleRevokeKey(id) {
    if (!window.confirm('Are you sure you want to permanently revoke this API key?')) return
    try {
      const res = await revokeApiKey(id)
      setApiKeys(res.apiKeys || [])
      toast.success('API key revoked')
    } catch (e) {
      toast.error('Failed to revoke API key')
    }
  }

  async function handleChangePassword() {
    try {
      await changePassword(oldPw, newPw)
      toast.success('Password changed successfully!')
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e) {
      toast.error(e.message || 'Failed to change password')
    }
  }

  return (
    <div style={{ animation: 'fadeUp 0.3s ease', maxWidth: 700 }}>
      <Tabs
        tabs={['General', 'Notifications', 'Security', 'API Keys']}
        active={tab} onChange={setTab}
      />

      {/* ─── General ─── */}
      {tab === 0 && (
        <div>
          <Card style={{ marginBottom: 14 }}>
            <Section title="Appearance">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 10px' }}>
                <div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>Color Theme</div>
                  <div style={{ fontSize: 12, color: C.muted }}>Choose your interface theme preference</div>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {['Light', 'Dark', 'System'].map(t => (
                    <button key={t} onClick={() => setTheme(t)} style={{
                      padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontWeight: 500,
                      border: `1px solid ${theme === t ? C.accent : C.border}`,
                      background: theme === t ? C.accentDim : 'transparent',
                      color: theme === t ? C.accent : C.muted, transition: 'all 0.15s',
                    }}>{t}</button>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="Localization">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Select
                  label="Timezone"
                  value={timezone} onChange={setTimezone}
                  options={[
                    'Asia/Kolkata (IST, UTC+5:30)',
                    'UTC',
                    'America/New_York (EST, UTC−5)',
                    'America/Los_Angeles (PST, UTC−8)',
                    'Europe/London (GMT, UTC+0)',
                    'Europe/Berlin (CET, UTC+1)',
                    'Asia/Singapore (SGT, UTC+8)',
                  ]}
                />
                <Select label="Language" value="English" onChange={() => { }} options={['English']} hint="More languages coming soon" />
              </div>
            </Section>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <Section title="Extraction Defaults">
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
                These values are pre-filled in the wizard for every new extraction job.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Input
                  label="Default Sampling %"
                  value={samplePct} onChange={setSamplePct}
                  hint="Recommended: 2%"
                />
                <Input
                  label="Default Invocation Timeout (s)"
                  value={invTimeout} onChange={setInvTimeout}
                  hint="Max time per app call"
                />
                <Input
                  label="Default Total Job Timeout (min)"
                  value={jobTimeout} onChange={setJobTimeout}
                  hint="Job auto-aborts after this"
                />
                <Input
                  label="LIMIT Geometric Ratio (r)"
                  value={limitRatio} onChange={setLimitRatio}
                  hint="Progression: a, a·r, a·r², …"
                />
              </div>
            </Section>
          </Card>

          <Btn onClick={saveGeneral}>💾 Save Changes</Btn>
        </div>
      )}

      {/* ─── Notifications ─── */}
      {tab === 1 && (
        <Card>
          <Section title="Email Notifications">
            {[
              ['Job Completed', 'Receive an email when an extraction finishes successfully', notifyCompleted, setNComplete],
              ['Job Failed', 'Receive an email when an extraction fails', notifyFailed, setNFailed],
              ['Job Queued', 'Notify when a job enters the queue (resource waiting)', notifyQueued, setNQueued],
              ['Job Aborted', 'Notify when a job is manually aborted', notifyAborted, setNAborted],
            ].map(([label, sub, val, fn]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 0', borderBottom: `1px solid ${C.border}`,
              }}>
                <div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{sub}</div>
                </div>
                <Toggle on={val} onChange={fn} />
              </div>
            ))}
            <div style={{ paddingTop: 16 }}>
              <Input
                label="Notification Email Address"
                value={notifyEmail} onChange={setNEmail}
                hint="Defaults to your account email"
              />
            </div>
          </Section>

          <Section title="In-App Notifications">
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0',
            }}>
              <div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>Bell notifications</div>
                <div style={{ fontSize: 12, color: C.muted }}>Show notification count on the bell icon</div>
              </div>
              <Toggle on={inApp} onChange={setInApp} />
            </div>
          </Section>

          <Btn onClick={saveNotifications}>💾 Save Notification Settings</Btn>
        </Card>
      )}

      {/* ─── Security ─── */}
      {tab === 2 && (
        <div>
          <Card style={{ marginBottom: 14 }}>
            <Section title="Change Password">
              <Input label="Current Password" value={oldPw} onChange={setOldPw} type="password" placeholder="••••••••" />
              <Input label="New Password" value={newPw} onChange={setNewPw} type="password" placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special" />
              {newPw && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>Password strength</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[...Array(4)].map((_, i) => {
                      const score = [/[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/, /.{10,}/].filter(r => r.test(newPw)).length
                      const colors = [C.red, C.amber, C.amber, C.green]
                      return (
                        <div key={i} style={{
                          flex: 1, height: 4, borderRadius: 2,
                          background: i < score ? colors[score - 1] : C.dim,
                          transition: 'background 0.2s',
                        }} />
                      )
                    })}
                  </div>
                </div>
              )}
              <Input label="Confirm New Password" value={confirmPw} onChange={setConfirmPw} type="password" placeholder="••••••••" />
              {confirmPw && newPw !== confirmPw && (
                <div style={{ fontSize: 12, color: C.red, marginTop: -10, marginBottom: 12 }}>Passwords do not match</div>
              )}
              <Btn disabled={!oldPw || !newPw || newPw !== confirmPw} onClick={handleChangePassword}>Update Password</Btn>
            </Section>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <Section
              title="Active Sessions"
              action={<Btn size="sm" variant="danger" onClick={handleRevokeAll} disabled={sessions.filter(s => !s.current).length === 0}>Revoke All Others</Btn>}
            >
              {sessions.map((s, i) => (
                <div key={s.id || i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: `1px solid ${C.border}`,
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.dev}
                      {s.current && (
                        <span style={{ fontSize: 10, background: C.greenDim, color: C.green, padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
                          current
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>{s.loc} · {s.last}</div>
                  </div>
                  {!s.current && <Btn size="sm" variant="ghost" onClick={() => handleRevoke(s.id)}>Revoke</Btn>}
                </div>
              ))}
            </Section>
          </Card>


        </div>
      )}

      {/* ─── API Keys ─── */}
      {tab === 3 && (
        <Card>
          <Section
            title="API Keys"
            action={<Btn size="sm" onClick={handleGenerateKey}>+ Generate New Key</Btn>}
          >
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 18, lineHeight: 1.6 }}>
              Use API keys for programmatic access to UNMASQUE Web. Keys are shown <strong style={{ color: C.amber }}>only once</strong> at creation — store them securely.
            </p>
            {apiKeys.map(k => (
              <div key={k.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', background: C.surface, borderRadius: 8,
                border: `1px solid ${C.border}`, marginBottom: 8,
              }}>
                <div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 3 }}>{k.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: 'JetBrains Mono, monospace' }}>
                    {k.prefix} · Created {k.created} · Last used {k.lastUsed}
                  </div>
                </div>
                <Btn size="sm" variant="danger" onClick={() => handleRevokeKey(k.id)}>Revoke</Btn>
              </div>
            ))}
            {apiKeys.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: 13 }}>
                No API keys yet. Generate one to get started.
              </div>
            )}
          </Section>

          <div style={{
            background: `${C.amber}12`, border: `1px solid ${C.amber}40`,
            borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.amber,
          }}>
            ⚠ Treat API keys like passwords. Never share them or commit them to source control.
          </div>
        </Card>
      )}
    </div>
  )
}

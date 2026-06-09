import { useEffect, useState } from 'react'
import { C, F, FH } from '../../utils/theme.js'
import { Spinner } from '../shared/UI.jsx'
import { login, signup, sendResetEmail, verifyResetCode, resetPassword, verifyLoginTotp } from '../../services/auth.js'

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function LoginPage({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail]       = useState('')
  const [pw, setPw]             = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [name, setName]         = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')
  const [remember, setRemember] = useState(true)
  const [forgotMode, setForgotMode] = useState('none')
  const [resetEmail, setResetEmail] = useState('')
  const [enteredCode, setEnteredCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [resetPw, setResetPw] = useState('')
  const [resetConfirmPw, setResetConfirmPw] = useState('')
  const [requires2FA, setRequires2FA] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [totpToken, setTotpToken] = useState('')
  const forgotActive = forgotMode !== 'none'

  useEffect(() => {
    if (forgotMode === 'reset' && !resetToken) {
      setForgotMode('verify')
      setInfo('Please verify the code sent to your email before resetting your password.')
      setError('')
    }
  }, [forgotMode, resetToken])

  function resetForm() {
    setError('')
    setInfo('')
    setName('')
    setEmail('')
    setPw('')
    setConfirmPw('')
    setShowPw(false)
    setRemember(true)
    setForgotMode('none')
    setResetEmail('')
    setEnteredCode('')
    setResetToken('')
    setResetPw('')
    setResetConfirmPw('')
    setRequires2FA(false)
    setTempToken('')
    setTotpToken('')
  }

  async function handleLogin() {
    if (!email || !pw) { setError('Please fill in all fields.'); return }
    if (!isValidEmail(email)) { setError('Please enter a valid email address.'); return }

    setLoading(true)
    setError('')
    setInfo('')

    try {
      const data = await login({
        email: email.trim().toLowerCase(),
        password: pw,
        remember,
      })
      if (data.requires2FA) {
        setRequires2FA(true)
        setTempToken(data.tempToken)
        setInfo('We have sent a 6-digit code to your email. Please enter it below.')
      } else {
        onLogin(data.user)
      }
    } catch (err) {
      setError(err.message || 'Unable to connect to the authentication server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyLoginTotp() {
    if (!totpToken || totpToken.length !== 6) { setError('Please enter a valid 6-digit code.'); return }
    setLoading(true)
    setError('')
    try {
      const data = await verifyLoginTotp(tempToken, totpToken)
      onLogin(data.user)
    } catch (err) {
      setError(err.message || 'Invalid code.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignup() {
    if (!name || !email || !pw || !confirmPw) { setError('Please fill in all fields.'); return }
    if (!isValidEmail(email)) { setError('Please enter a valid email address.'); return }
    if (pw !== confirmPw) { setError('Passwords do not match.'); return }

    setLoading(true)
    setError('')
    setInfo('')

    try {
      const data = await signup({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: pw,
      })
      onLogin(data.user)
    } catch (err) {
      setError(err.message || 'Unable to connect to the authentication server.')
    } finally {
      setLoading(false)
    }
  }

  function handleForgotPassword() {
    setError('')
    setInfo('Enter your registered email to receive a verification code.')
    setForgotMode('request')
    setPw('')
    setConfirmPw('')
    setName('')
    setEnteredCode('')
    setResetToken('')
    setResetPw('')
    setResetConfirmPw('')
  }

  async function handleSendResetLink() {
    if (!email) { setError('Please enter your registered email.'); return }
    if (!isValidEmail(email)) { setError('Please enter a valid email address.'); return }

    setLoading(true)
    setError('')
    setInfo('')

    try {
      const data = await sendResetEmail({ email: email.trim().toLowerCase() })
      setResetEmail(email.trim().toLowerCase())
      setForgotMode('verify')
      setError('')
      setInfo(data.message || 'A verification code has been sent to your email address.')
    } catch (err) {
      setError('Unable to connect to the authentication server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCode() {
    if (!enteredCode) {
      setError('Please enter the verification code sent to your email.')
      return
    }

    setLoading(true)
    setError('')
    setInfo('')

    try {
      const data = await verifyResetCode({
        email: resetEmail,
        code: enteredCode.trim(),
      })
      setResetToken(data.resetToken || '')
      setError('')
      setInfo('Verification successful. Please enter your new password.')
      setForgotMode('reset')
    } catch (err) {
      setError('Unable to connect to the authentication server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!resetToken) {
      setError('Please verify your code before resetting your password.')
      return
    }
    if (!resetPw || !resetConfirmPw) {
      setError('Please fill in the password fields.')
      return
    }
    if (resetPw !== resetConfirmPw) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')
    setInfo('')

    try {
      const data = await resetPassword({
        email: resetEmail,
        resetToken,
        password: resetPw,
      })
      setInfo(data.message || 'Password has been reset. Please sign in.')
      setForgotMode('none')
      setEmail(resetEmail)
      setPw('')
      setConfirmPw('')
      setEnteredCode('')
      setResetToken('')
      setResetPw('')
      setResetConfirmPw('')
    } catch (err) {
      setError('Unable to connect to the authentication server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: C.bg, minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: F, position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @media (max-width: 374px) {
          .login-container { padding: 0 12px !important; }
          .login-card { padding: 20px 16px !important; }
          .login-title { font-size: 22px !important; }
        }
      `}</style>
      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(${C.border}55 1px, transparent 1px), linear-gradient(90deg, ${C.border}55 1px, transparent 1px)`,
        backgroundSize: '40px 40px', opacity: 0.4,
        pointerEvents: 'none',
      }} />

      {/* Glow blobs */}
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: `radial-gradient(circle, ${C.accent}18 0%, transparent 70%)`,
        top: '20%', left: '30%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 300, height: 300, borderRadius: '50%',
        background: `radial-gradient(circle, ${C.cyan}12 0%, transparent 70%)`,
        bottom: '20%', right: '25%', pointerEvents: 'none',
      }} />

      <div className="login-container" style={{ position: 'relative', animation: 'fadeUp 0.4s ease', width: '100%', maxWidth: 420, padding: '0 20px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16,
            background: \`linear-gradient(135deg, \${C.accent}, \${C.cyan})\`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, margin: '0 auto 18px', boxShadow: \`0 0 30px \${C.accent}40\`,
          }}>🔍</div>
          <h1 className="login-title" style={{ fontFamily: FH, fontSize: 26, fontWeight: 800, color: C.text }}>UNMASQUE Web</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
            Hidden SQL Query Extraction · IISc Bangalore
          </p>
        </div>

        {/* Form card */}
        <div className="login-card" style={{
          background: C.card, border: \`1px solid \${C.border}\`,
          borderRadius: 16, padding: 30,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <h2 style={{ fontFamily: FH, fontSize: 20, fontWeight: 700, color: C.text }}>
              {forgotActive ? (forgotMode === 'request' ? 'Forgot Password' : (forgotMode === 'verify' ? 'Verify Code' : 'Set New Password')) : (isSignup ? 'Create Free Account' : 'Sign In')}
            </h2>
          </div>

          {error && (
            <div style={{
              background: C.redDim, border: `1px solid ${C.red}44`,
              borderRadius: 8, padding: '9px 14px', fontSize: 12, color: C.red, marginBottom: 16,
            }}>{error}</div>
          )}
          {info && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.12)', border: `1px solid rgba(16, 185, 129, 0.24)`,
              borderRadius: 8, padding: '9px 14px', fontSize: 12, color: '#10B981', marginBottom: 16,
            }}>{info}</div>
          )}

          {forgotActive ? (
            <>
              {forgotMode === 'request' ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                      Registered Email
                    </label>
                    <input
                      value={email} onChange={e => setEmail(e.target.value)}
                      type="email" placeholder="you@example.com"
                      onKeyDown={e => e.key === 'Enter' && handleSendResetLink()}
                      style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 8, color: C.text, padding: '10px 14px',
                        width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                      }}
                    />
                  </div>
                </>
              ) : forgotMode === 'verify' ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                      Email
                    </label>
                    <input
                      value={resetEmail} disabled
                      type="email" placeholder="you@example.com"
                      style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 8, color: C.text, padding: '10px 14px',
                        width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                      Verification Code
                    </label>
                    <input
                      value={enteredCode} onChange={e => setEnteredCode(e.target.value)}
                      type="text" placeholder="Enter code sent to your email"
                      onKeyDown={e => e.key === 'Enter' && handleVerifyCode()}
                      style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 8, color: C.text, padding: '10px 14px',
                        width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                      Email
                    </label>
                    <input
                      value={resetEmail} disabled
                      type="email" placeholder="you@example.com"
                      style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 8, color: C.text, padding: '10px 14px',
                        width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                      New Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        value={resetPw} onChange={e => setResetPw(e.target.value)}
                        type={showPw ? 'text' : 'password'} placeholder="••••••••"
                        onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
                        style={{
                          background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 8, color: C.text, padding: '10px 40px 10px 14px',
                          width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                        }}
                      />
                      <button
                        onClick={() => setShowPw(!showPw)}
                        style={{
                          position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 14, color: C.muted,
                        }}
                      >{showPw ? '🙈' : '👁'}</button>
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                      Confirm New Password
                    </label>
                    <input
                      value={resetConfirmPw} onChange={e => setResetConfirmPw(e.target.value)}
                      type="password" placeholder="••••••••"
                      onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
                      style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 8, color: C.text, padding: '10px 14px',
                        width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                      }}
                    />
                  </div>
                </>
              )}
                  <button
                    onClick={forgotMode === 'request' ? handleSendResetLink : (forgotMode === 'verify' ? handleVerifyCode : handleResetPassword)}
                    disabled={loading}
                    style={{
                      width: '100%', padding: '12px', background: C.accent, color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer', fontFamily: F,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: loading ? 0.8 : 1, transition: 'all 0.15s',
                    }}
                  >
                    {loading ? <><Spinner size={15} color="#fff" /> Sending…</> : (forgotMode === 'request' ? 'Send Verification Code' : (forgotMode === 'verify' ? 'Verify Code' : 'Reset Password'))}
                  </button>

                  <p style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 18 }}>
                    <span style={{ color: C.accent, cursor: 'pointer' }} onClick={() => {
                      setForgotMode('none')
                      setInfo('')
                      setError('')
                      setEnteredCode('')
                      setResetEmail('')
                      setResetToken('')
                    }}>
                      Back to sign in
                    </span>
                  </p>
                </>
              ) : requires2FA ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                      Email Verification Code
                    </label>
                    <input
                      value={totpToken} onChange={e => setTotpToken(e.target.value)}
                      type="text" placeholder="000000" maxLength={6}
                      onKeyDown={e => e.key === 'Enter' && handleVerifyLoginTotp()}
                      style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 8, color: C.text, padding: '10px 14px',
                        width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                        letterSpacing: 2, textAlign: 'center', fontFamily: F,
                      }}
                    />
                  </div>
                  <button
                    onClick={handleVerifyLoginTotp} disabled={loading || totpToken.length !== 6}
                    style={{
                      width: '100%', padding: '12px', background: C.accent, color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                      cursor: loading || totpToken.length !== 6 ? 'not-allowed' : 'pointer', fontFamily: F,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: loading || totpToken.length !== 6 ? 0.8 : 1, transition: 'all 0.15s',
                    }}
                  >
                    {loading ? <><Spinner size={15} color="#fff" /> Verifying…</> : 'Verify & Sign In'}
                  </button>
                  <p style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 18 }}>
                    <span style={{ color: C.accent, cursor: 'pointer' }} onClick={() => resetForm()}>
                      Cancel
                    </span>
                  </p>
                </>
              ) : (
                <>
                  {isSignup && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                        Full Name
                      </label>
                      <input
                        value={name} onChange={e => setName(e.target.value)}
                        type="text" placeholder="Your Name"
                        onKeyDown={e => e.key === 'Enter' && handleSignup()}
                        style={{
                          background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 8, color: C.text, padding: '10px 14px',
                          width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                        }}
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                      Email Address
                    </label>
                    <input
                      value={email} onChange={e => setEmail(e.target.value)}
                      type="email" placeholder="you@example.com"
                      onKeyDown={e => e.key === 'Enter' && (isSignup ? handleSignup() : handleLogin())}
                      style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 8, color: C.text, padding: '10px 14px',
                        width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                      Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        value={pw} onChange={e => setPw(e.target.value)}
                        type={showPw ? 'text' : 'password'} placeholder="••••••••"
                        onKeyDown={e => e.key === 'Enter' && (isSignup ? handleSignup() : handleLogin())}
                        style={{
                          background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 8, color: C.text, padding: '10px 40px 10px 14px',
                          width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                        }}
                      />
                      <button
                        onClick={() => setShowPw(!showPw)}
                        style={{
                          position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 14, color: C.muted,
                        }}
                      >{showPw ? '🙈' : '👁'}</button>
                    </div>
                  </div>

                  {isSignup && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
                        Confirm Password
                      </label>
                      <input
                        value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                        type="password" placeholder="••••••••"
                        onKeyDown={e => e.key === 'Enter' && handleSignup()}
                        style={{
                          background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 8, color: C.text, padding: '10px 14px',
                          width: '100%', fontSize: 13, transition: 'border-color 0.15s',
                        }}
                      />
                    </div>
                  )}

                  {!isSignup && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: C.muted }}>
                        <input
                          type="checkbox" checked={remember}
                          onChange={e => setRemember(e.target.checked)}
                        />
                        Remember me (7 days)
                      </label>
                      <span style={{ fontSize: 12, color: C.accent, cursor: 'pointer' }} onClick={handleForgotPassword}>Forgot password?</span>
                    </div>
                  )}

                  <button
                    onClick={isSignup ? handleSignup : handleLogin} disabled={loading}
                    style={{
                      width: '100%', padding: '12px', background: C.accent, color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer', fontFamily: F,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: loading ? 0.8 : 1, transition: 'all 0.15s',
                    }}
                  >
                    {loading ? <><Spinner size={15} color="#fff" /> {isSignup ? 'Creating account…' : 'Signing in…'}</> : (isSignup ? '✨ Create Free Account' : 'Sign In')}
                  </button>

                  <p style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 18 }}>
                    {isSignup ? 'Already have an account?' : 'No account?'}{' '}
                    <span style={{ color: C.accent, cursor: 'pointer' }} onClick={() => {
                      setIsSignup(prev => !prev)
                      resetForm()
                    }}>
                      {isSignup ? 'Sign in' : 'Create one free'}
                    </span>
                  </p>
                </>
              )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: C.muted, marginTop: 18 }}>
          Database Systems Lab · Indian Institute of Science · Bangalore
        </p>
      </div>
    </div>
  )
}

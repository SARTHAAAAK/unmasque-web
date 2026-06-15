import { C, F, FM, FH } from '@/utils/theme.js'
import React, { useEffect, useRef } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-sql'
import 'prismjs/themes/prism-tomorrow.css'

// ─── BADGE ────────────────────────────────────────────────────
export function Badge({ status }) {
  const cfg = {
    completed: { bg: C.greenDim,  fg: C.green,  dot: C.green,  label: 'Completed' },
    running:   { bg: '#0A2040',   fg: C.cyan,   dot: C.cyan,   label: 'Running',  pulse: true },
    failed:    { bg: C.redDim,    fg: C.red,    dot: C.red,    label: 'Failed' },
    queued:    { bg: C.dim,       fg: C.muted,  dot: C.muted,  label: 'Queued' },
    aborted:   { bg: '#1A1A2E',   fg: C.purple, dot: C.purple, label: 'Aborted' },
    ok:        { bg: C.greenDim,  fg: C.green,  dot: C.green,  label: 'Connected' },
    error:     { bg: C.redDim,    fg: C.red,    dot: C.red,    label: 'Error' },
  }[status] || { bg: C.dim, fg: C.muted, dot: C.muted, label: status }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.bg, color: cfg.fg,
      padding: '3px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0,
        ...(cfg.pulse ? { animation: 'pulse 1.4s ease-in-out infinite' } : {}),
      }} />
      {cfg.label}
    </span>
  )
}

// ─── BUTTON ───────────────────────────────────────────────────
export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled = false, style = {} }) {
  const base = {
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 8, fontFamily: F, fontWeight: 600,
    transition: 'all 0.15s', opacity: disabled ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }
  const variants = {
    primary:  { background: C.accent,   color: '#fff' },
    secondary:{ background: C.dim,      color: C.text },
    ghost:    { background: 'transparent', color: C.muted, border: `1px solid ${C.border}` },
    danger:   { background: C.redDim,   color: C.red,   border: `1px solid ${C.red}40` },
    success:  { background: C.greenDim, color: C.green, border: `1px solid ${C.green}40` },
    cyan:     { background: '#0A2040',  color: C.cyan,  border: `1px solid ${C.cyan}40` },
  }
  const sizes = {
    sm: { padding: '6px 12px', fontSize: 12 },
    md: { padding: '9px 18px', fontSize: 13 },
    lg: { padding: '12px 26px', fontSize: 14 },
  }
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...base, ...variants[variant], ...sizes[size], ...style }}>
      {children}
    </button>
  )
}

// ─── STAT CARD ────────────────────────────────────────────────
export function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, fontFamily: FH, fontWeight: 700, color: color || C.text }}>
            {value}
          </div>
          {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
        </div>
        {icon && (
          <div style={{ fontSize: 22, color: color || C.muted, opacity: 0.7 }}>{icon}</div>
        )}
      </div>
    </div>
  )
}

// ─── CARD ─────────────────────────────────────────────────────
export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '18px 20px', ...style,
    }}>
      {children}
    </div>
  )
}

// ─── SECTION HEADER ───────────────────────────────────────────
export function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontFamily: FH, fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── TABS ─────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
      {tabs.map((t, i) => (
        <button key={i} onClick={() => onChange(i)} style={{
          padding: '10px 18px', fontSize: 13,
          fontWeight: active === i ? 600 : 400, cursor: 'pointer',
          border: 'none', background: 'transparent',
          color: active === i ? C.accent : C.muted,
          borderBottom: active === i ? `2px solid ${C.accent}` : '2px solid transparent',
          transition: 'all 0.15s', fontFamily: F,
        }}>{t}</button>
      ))}
    </div>
  )
}

// ─── FORM INPUT ───────────────────────────────────────────────
export function Input({ label, value, onChange, type = 'text', placeholder = '', hint, style = {} }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      {label && (
        <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
          {label}
        </label>
      )}
      <input
        value={value} onChange={e => onChange(e.target.value)}
        type={type} placeholder={placeholder}
        style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, color: C.text, padding: '9px 13px',
          width: '100%', fontSize: 13, fontFamily: F,
        }}
      />
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

// ─── SELECT ───────────────────────────────────────────────────
export function Select({ label, value, onChange, options, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
          {label}
        </label>
      )}
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, color: C.text, padding: '9px 13px',
          width: '100%', fontSize: 13,
        }}
      >
        {options.map(opt => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>
            {opt.label ?? opt}
          </option>
        ))}
      </select>
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

// ─── TOGGLE ───────────────────────────────────────────────────
export function Toggle({ on, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!on)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: on ? C.accent : C.dim,
          position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: on ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
        }} />
      </div>
      {label && <span style={{ fontSize: 13, color: C.text }}>{label}</span>}
    </label>
  )
}

// ─── CLAUSE PILL ──────────────────────────────────────────────
export function ClausePill({ c }) {
  const colors = {
    FROM: C.cyan, JOIN: C.accent, FILTER: C.purple,
    GROUP: C.amber, AGG: C.green, ORDER: C.red,
    LIMIT: C.muted, HAVING: '#F472B6',
  }
  const col = colors[c] || C.muted
  return (
    <span style={{
      background: `${col}22`, color: col,
      padding: '2px 7px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    }}>{c}</span>
  )
}

// ─── SQL SYNTAX HIGHLIGHTER ───────────────────────────────────
export function SqlView({ code }) {
  const codeRef = useRef(null)

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current)
    }
  }, [code])

  return (
    <pre style={{ margin: 0, fontFamily: FM, fontSize: 13, lineHeight: 1.75, overflowX: 'auto', background: 'transparent' }}>
      <code ref={codeRef} className="language-sql" style={{ fontFamily: FM }}>
        {code}
      </code>
    </pre>
  )
}

// ─── PROGRESS BAR ─────────────────────────────────────────────
export function ProgressBar({ value, color, style = {} }) {
  return (
    <div style={{
      background: C.dim, borderRadius: 4, height: 6,
      overflow: 'hidden', ...style,
    }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, value))}%`,
        height: '100%',
        background: color || `linear-gradient(90deg, ${C.accent}, ${C.cyan})`,
        borderRadius: 4,
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

// ─── EMPTY STATE ──────────────────────────────────────────────
export function EmptyState({ icon = '🔍', title, desc, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 20px', color: C.muted }}>
      <div style={{ fontSize: 36, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {desc && <div style={{ fontSize: 13, marginBottom: 18 }}>{desc}</div>}
      {action}
    </div>
  )
}

// ─── SPINNER ──────────────────────────────────────────────────
export function Spinner({ size = 16, color }) {
  return (
    <span style={{
      width: size, height: size, display: 'inline-block',
      border: `2px solid ${color || C.accent}44`,
      borderTopColor: color || C.accent,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

// ─── TOOLTIP WRAPPER ──────────────────────────────────────────
export function Tooltip({ text, children }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
      title={text}
    >
      {children}
    </div>
  )
}

import { useState } from 'react'
import { C } from '../../utils/theme.js'
import { Card, Section, Badge, Btn, Input, Select, Spinner } from '../shared/UI.jsx'
import { getConnections, deleteConnection, testConnection, updateConnection } from '../../services/api.js'
import { useEffect } from 'react'

export default function ConnectionsPage() {
  const [showForm, setShowForm]     = useState(false)
  const [conns, setConns]           = useState([])
  const [testing, setTesting]       = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [form, setForm]             = useState({
    name: '', type: 'PostgreSQL', host: '', port: '5432',
    db: '', schema: 'public', user: '', pw: '', ssl: 'disable',
  })
  const [testingRowId, setTestingRowId] = useState(null)
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    getConnections().then(backendConns => {
      setConns(backendConns || [])
    }).catch(err => console.error('Failed to load connections', err))
  }, [])

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  function handleTypeChange(type) {
    set('type', type)
    set('port', type === 'PostgreSQL' ? '5432' : '1433')
    set('schema', type === 'PostgreSQL' ? 'public' : 'dbo')
  }

  async function testConn() {
    setTesting(true); setTestResult(null);
    const payload = {
      id: editingId,
      name: form.name, type: form.type, host: form.host, port: parseInt(form.port) || 0,
      dbname: form.db, schema: form.schema, user: form.user, pw: form.pw, ssl: form.ssl
    };
    try {
      const res = await testConnection(payload);
      setTestResult({ ok: res.success, msg: res.message });
    } catch (err) {
      setTestResult({ ok: false, msg: err.message || 'Connection test failed.' });
    } finally {
      setTesting(false);
    }
  }

  async function saveConn() {
    if (!form.name || !form.host || !form.db) return

    if (editingId) {
      const updatedConn = {
        name: form.name, type: form.type, host: form.host, port: parseInt(form.port) || 0,
        dbname: form.db, schema: form.schema, user: form.user, pw: form.pw, ssl: form.ssl,
        status: '', tested: 'never'
      }
      try {
        await updateConnection(editingId, updatedConn)
        setConns(prev => prev.map(c => 
          c.id === editingId ? { ...c, ...updatedConn } : c
        ))
      } catch (e) {
        console.error(e)
        alert('Failed to update connection: ' + (e.message || 'Unknown error'))
        return
      }
      setEditingId(null)
    } else {
      const newConn = {
        id: `c${Date.now()}`, name: form.name, type: form.type,
        host: form.host, port: parseInt(form.port) || 0, dbname: form.db,
        schema: form.schema, user: form.user, pw: form.pw, ssl: form.ssl,
        status: '', tested: 'never',
      }
      try {
        await updateConnection(newConn.id, newConn)
        setConns(prev => [...prev, newConn])
      } catch (e) {
        console.error(e)
        alert('Failed to add connection: ' + (e.message || 'Unknown error'))
        return
      }
    }

    setShowForm(false)
    setForm({ name: '', type: 'PostgreSQL', host: '', port: '5432', db: '', schema: 'public', user: '', pw: '', ssl: 'disable' })
    setTestResult(null)
  }

  async function handleRowTest(c) {
    setTestingRowId(c.id)
    try {
      const res = await testConnection(c)
      setConns(prev => prev.map(conn => 
        conn.id === c.id ? { ...conn, status: res.status, tested: 'just now' } : conn
      ))
      if (!res.success) {
        alert(`Connection failed: ${res.message}`)
      } else {
        alert(`Connection successful: ${res.message}`)
      }
    } catch (err) {
      setConns(prev => prev.map(conn => 
        conn.id === c.id ? { ...conn, status: 'error', tested: 'just now' } : conn
      ))
      alert(`Connection error: ${err.message}`)
    } finally {
      setTestingRowId(null)
    }
  }

  function handleRowEdit(c) {
    setEditingId(c.id)
    setForm({
      name: c.name || '', type: c.type || 'PostgreSQL', host: c.host || '',
      port: c.port?.toString() || '', db: c.dbname || '', schema: c.schema || 'public',
      user: c.user || '', pw: c.pw || '', ssl: c.ssl || 'disable'
    })
    setShowForm(true)
    setTestResult(null)
  }

  async function deleteConn(id) {
    if (window.confirm('Delete this connection profile?')) {
      try {
        await deleteConnection(id)
        const deleted = JSON.parse(localStorage.getItem('deleted_conns') || '[]')
        localStorage.setItem('deleted_conns', JSON.stringify([...deleted, id]))
        setConns(prev => prev.filter(c => c.id !== id))
      } catch (err) {
        console.error('Failed to delete connection', err)
      }
    }
  }

  return (
    <div style={{ animation: 'fadeUp 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: C.muted }}>
          Manage saved database connection profiles. Passwords are stored AES-256 encrypted.
        </p>
        <Btn onClick={() => { setShowForm(!showForm); setTestResult(null); if (showForm) { setEditingId(null); setForm({ name: '', type: 'PostgreSQL', host: '', port: '5432', db: '', schema: 'public', user: '', pw: '', ssl: 'disable' }) } }}>
          {showForm ? '✕ Cancel' : '+ Add Connection'}
        </Btn>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <Card style={{ marginBottom: 20, borderColor: `${C.accent}66` }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 20 }}>New Connection Profile</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
            <Input label="Connection Name *" value={form.name} onChange={v => set('name', v)} placeholder="e.g. TPC-H Production" />
            <Select
              label="Database Type"
              value={form.type}
              onChange={handleTypeChange}
              options={['PostgreSQL', 'SQL Server']}
            />
            <Input label="Host / IP Address *" value={form.host} onChange={v => set('host', v)} placeholder="db.company.com or 192.168.1.10" />
            <Input label="Port" value={form.port} onChange={v => set('port', v)} placeholder="5432" />
            <Input label="Database Name *" value={form.db} onChange={v => set('db', v)} placeholder="mydb" />
            <Input label="Schema Name" value={form.schema} onChange={v => set('schema', v)} placeholder="public" hint="Default: public (PostgreSQL) / dbo (SQL Server)" />
            <Input label="Username" value={form.user} onChange={v => set('user', v)} placeholder="postgres" />
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  value={form.pw} onChange={e => set('pw', e.target.value)}
                  type="password" placeholder="••••••••"
                  style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 8, color: C.text, padding: '9px 13px',
                    width: '100%', fontSize: 13,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Stored AES-256 encrypted — never in plaintext</div>
            </div>
            <Select
              label="SSL Mode"
              value={form.ssl}
              onChange={v => set('ssl', v)}
              options={['disable', 'require', 'verify-ca', 'verify-full']}
            />
          </div>

          {testResult && (
            <div style={{
              background: testResult.ok ? C.greenDim : C.redDim,
              border: `1px solid ${testResult.ok ? C.green : C.red}44`,
              borderRadius: 8, padding: '10px 14px', marginBottom: 14,
              fontSize: 12, color: testResult.ok ? C.green : C.red,
            }}>
              {testResult.ok ? '✅' : '❌'} {testResult.msg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={testConn} disabled={testing}>
              {testing ? <><Spinner size={13} /> Testing…</> : '🔌 Test Connection'}
            </Btn>
            <Btn onClick={saveConn} disabled={!form.name || !form.host || !form.db}>
              💾 Save Connection
            </Btn>
          </div>
        </Card>
      )}

      {/* Connections table */}
      <Card>
        {conns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🔌</div>
            <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 6 }}>No connections yet</div>
            <div style={{ fontSize: 13, marginBottom: 18 }}>Add a database connection profile to get started.</div>
            <Btn onClick={() => setShowForm(true)}>+ Add Connection</Btn>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Connection Name', 'Type', 'Host', 'Port', 'Database', 'Schema', 'Status', 'Last Tested', 'Actions'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '8px 12px', color: C.muted,
                    fontWeight: 600, fontSize: 11, letterSpacing: 0.5,
                    borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conns.map(c => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${C.borderLo}` }}>
                  <td style={{ padding: '11px 12px', color: C.text, fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '11px 12px', color: C.cyan, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{c.type}</td>
                  <td style={{ padding: '11px 12px', color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{c.host}</td>
                  <td style={{ padding: '11px 12px', color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{c.port}</td>
                  <td style={{ padding: '11px 12px', color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{c.dbname}</td>
                  <td style={{ padding: '11px 12px', color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{c.schema}</td>
                  <td style={{ padding: '11px 12px' }}><Badge status={c.status} /></td>
                  <td style={{ padding: '11px 12px', color: C.muted, fontSize: 11 }}>{c.tested}</td>
                  <td style={{ padding: '11px 12px' }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <Btn size="sm" variant="ghost" onClick={() => handleRowTest(c)} disabled={testingRowId === c.id}>
                        {testingRowId === c.id ? <><Spinner size={11} /> Test</> : 'Test'}
                      </Btn>
                      <Btn size="sm" variant="ghost" onClick={() => handleRowEdit(c)}>Edit</Btn>
                      <Btn size="sm" variant="danger" onClick={() => deleteConn(c.id)}>✕</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

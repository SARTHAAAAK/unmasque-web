import { useState } from 'react'
import { C, FH } from '@/utils/theme.js'
import { Card, Btn, Input, Select, Toggle, Section } from '@/components/shared/UI.jsx'
const SCHEMA_TABLES = [
  { name: 'customer', rows: '150,000', cols: 8, pk: 'c_custkey', fk: '—' },
  { name: 'orders', rows: '1,500,000', cols: 9, pk: 'o_orderkey', fk: 'o_custkey' },
  { name: 'lineitem', rows: '6,001,215', cols: 16, pk: 'l_orderkey, l_linenumber', fk: 'l_orderkey, l_partkey, l_suppkey' },
  { name: 'part', rows: '200,000', cols: 9, pk: 'p_partkey', fk: '—' },
  { name: 'supplier', rows: '10,000', cols: 7, pk: 's_suppkey', fk: '—' },
  { name: 'partsupp', rows: '800,000', cols: 5, pk: 'ps_partkey, ps_suppkey', fk: 'ps_partkey, ps_suppkey' },
  { name: 'nation', rows: '25', cols: 4, pk: 'n_nationkey', fk: 'n_regionkey' },
  { name: 'region', rows: '5', cols: 3, pk: 'r_regionkey', fk: '—' },
]
import { startExtraction, getConnections, updateConnection, testConnection } from '@/services/api.js'
import { Database, Lock, Plus, ChevronDown, Check } from 'lucide-react'
import { useEffect } from 'react'


const APP_TYPES = [
  { key: 'A', label: 'SQL Procedure',    icon: '🗃️' },
  { key: 'B', label: 'Shell Command',    icon: '🖥️' },
  { key: 'C', label: 'Python Script',    icon: '🐍' },
  { key: 'D', label: 'HTTP Endpoint',    icon: '🌐' },
]

const STEP_LABELS = ['Basic Config', 'App Config', 'Schema', 'Extraction', 'Verification', 'Review']

const DEFAULT_FORM = {
  // Step 1
  jobName: `Extraction_${Date.now()}`, desc: '', conn: '', schema: 'public',
  // Step 2
  appType: 'D', url: 'http://localhost:3000', endpoint: '/api/reports/q3',
  httpMethod: 'GET', timeout: 300,
  procName: '', procParams: '',
  execPath: '', execArgs: '', execCwd: '', execOutFormat: 'Auto-detect',
  pyScriptPath: '', pyVersion: '3.11', pyVenv: '', pyArgs: '',
  jsonPath: '$.data.rows', httpAuth: 'None',
  // Step 3
  selectedTables: SCHEMA_TABLES.map(t => t.name),
  // Step 4
  strategy: 'Sampling + Halving (Recommended)',
  samplePct: 2,
  fromMethod: 'Execution-with-Error (Fast)',
  maxInv: 1000, perInvTimeout: 300, totalTimeout: 120,
  clauses: { FROM:true, JOIN:true, FILTER:true, PROJECT:true, GROUPBY:true, AGG:true, ORDERBY:true, LIMIT:true, HAVING:false },
  distinct: true, caseStmt: false, cleanup: true,
  // Step 5
  checker: true, numDbs: 5,
  verifyOrdering: true, xdata: true, semanticCheck: false,
  notifyEmail: true, notifyInApp: true,
  // Step 6
  agreed: false,
}

function StepperDot({ i, label, current, total }) {
  const done    = i < current
  const active  = i === current
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
      {i < total - 1 && (
        <div style={{
          position: 'absolute', left: '50%', top: 14, width: '100%', height: 1,
          background: done ? C.accent : C.border, zIndex: 0, transition: 'background 0.3s',
        }} />
      )}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', zIndex: 1, position: 'relative',
        border: `2px solid ${done || active ? C.accent : C.border}`,
        background: done ? C.accent : active ? C.accentDim : C.bg,
        color: done ? '#fff' : active ? C.accent : C.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, transition: 'all 0.3s',
      }}>
        {done ? '✓' : i + 1}
      </div>
      <span style={{
        fontSize: 10, color: active ? C.accent : done ? C.green : C.muted,
        marginTop: 5, textAlign: 'center', whiteSpace: 'nowrap',
      }}>{label}</span>
    </div>
  )
}

// ─── STEP 1 ───────────────────────────────────────────────────
function Step1({ form, setField, conns, setConns }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [showAddConnection, setShowAddConnection] = useState(false)

  const [connForm, setConnForm] = useState({
    name: '', type: 'PostgreSQL', host: '', port: '5432',
    db: '', schema: 'public', user: '', pw: '', ssl: 'disable',
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  function setC(k, v) { setConnForm(p => ({ ...p, [k]: v })) }
  
  function handleTypeChange(type) {
    setC('type', type)
    if (type === 'PostgreSQL') { setC('port', '5432'); setC('schema', 'public') }
    else if (type === 'MySQL') { setC('port', '3306'); setC('schema', '') }
    else if (type === 'SQL Server') { setC('port', '1433'); setC('schema', 'dbo') }
    else if (type === 'Oracle') { setC('port', '1521'); setC('schema', '') }
  }

  async function testConn() {
    setTesting(true); setTestResult(null)
    try {
      const res = await testConnection(connForm)
      setTestResult({ ok: res.success, msg: res.message || (res.success ? 'Connection successful!' : 'Connection failed.') })
    } catch (err) {
      setTestResult({ ok: false, msg: err.message || 'Connection failed.' })
    } finally {
      setTesting(false)
    }
  }

  async function saveConn() {
    if (!connForm.name || !connForm.host || !connForm.db) return
    const newConn = {
      id: `c${Date.now()}`, name: connForm.name, type: connForm.type,
      host: connForm.host, port: parseInt(connForm.port), dbname: connForm.db,
      schema: connForm.schema, user: connForm.user, pw: connForm.pw, ssl: connForm.ssl,
      status: 'ok', tested: 'just now', verified: true
    }
    
    try {
      await updateConnection(newConn.id, newConn)
      setConns(prev => [...prev, newConn])
      setField('conn', newConn.id)
      setShowAddConnection(false)
      setConnForm({ name: '', type: 'PostgreSQL', host: '', port: '5432', db: '', schema: 'public', user: '', pw: '', ssl: 'disable' })
      setTestResult(null)
    } catch (e) {
      console.error(e)
    }
  }

  const selectedConn = conns.find(c => c.id === form.conn)
  const verifiedCount = conns.filter(c => c.verified === true || c.status === 'ok').length

  return (
    <div>
      <h3 style={{ fontFamily: FH, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Basic Job Configuration</h3>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 22 }}>Give this extraction job a name and select the target database.</p>
      <Input label="Job Name *" value={form.jobName} onChange={v => setField('jobName', v)} placeholder="Extraction_20250510" />
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Job Description (optional)</label>
        <textarea
          value={form.desc} onChange={e => setField('desc', e.target.value)}
          placeholder="Notes about what query you expect to find…"
          style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.text, padding: '9px 13px',
            width: '100%', fontSize: 13, resize: 'vertical', minHeight: 72, fontFamily: 'DM Sans, sans-serif',
          }}
        />
      </div>

      <div style={{ marginBottom: 4, position: 'relative' }}>
        <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Database Connection *</label>
        
        {/* Dropdown Toggle */}
        <div 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          style={{
            background: C.surface, border: `1px solid ${isDropdownOpen ? C.accent : C.border}`, 
            borderRadius: 8, padding: '10px 14px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: 'border-color 0.2s', boxShadow: isDropdownOpen ? `0 0 0 3px ${C.accent}22` : 'none'
          }}
        >
          {selectedConn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: `${C.accent}15`, padding: 8, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Database size={18} color={C.accent} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{selectedConn.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{selectedConn.type} · {selectedConn.host}</div>
              </div>
            </div>
          ) : (
            <div style={{ color: C.muted, fontSize: 13, padding: '8px 0' }}>Select a connection...</div>
          )}
          <ChevronDown size={16} color={C.muted} style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
            marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 280, overflowY: 'auto'
          }}>
            {conns.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>You haven't created any database connections yet.</p>
                <Btn size="sm" onClick={() => setPage('connections')}>Create New Connection</Btn>
              </div>
            )}
            {conns.map(c => {
              const isVerified = c.verified === true || c.status === 'ok' || c.status === 'connected'
              const isSelected = form.conn === c.id
              return (
                <div 
                  key={c.id} 
                  onClick={() => { setField('conn', c.id); setIsDropdownOpen(false) }}
                  style={{
                    padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: `1px solid ${C.borderLo}`, background: isSelected ? `${C.accent}08` : 'transparent',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => !isSelected && (e.currentTarget.style.background = C.bg)}
                  onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Database size={16} color={C.muted} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? C.accent : C.text }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{c.type} · {c.host}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ 
                      fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
                      color: isVerified ? C.green : C.muted, background: isVerified ? `${C.green}15` : `${C.muted}15`,
                      padding: '2px 6px', borderRadius: 4
                    }}>
                      ● {isVerified ? 'Live' : 'Untested'}
                    </span>
                    {isSelected && <Check size={16} color={C.accent} />}
                  </div>
                </div>
              )
            })}
            
            {/* Add New Connection Row */}
            <div 
              onClick={() => { setShowAddConnection(true); setIsDropdownOpen(false) }}
              style={{
                padding: '14px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                color: C.accent, fontSize: 13, fontWeight: 600, borderTop: `1px dashed ${C.border}`
              }}
              onMouseEnter={e => e.currentTarget.style.background = `${C.accent}08`}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Plus size={16} /> Add new connection
            </div>
          </div>
        )}
      </div>
      
      <div style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 6, marginBottom: (!selectedConn || selectedConn.verified === true || selectedConn.status === 'ok' || selectedConn.status === 'connected') ? 18 : 6, marginTop: 6, paddingLeft: 2 }}>
        <Lock size={12} /> Credentials are AES-256 encrypted · {verifiedCount} of {conns.length} connections verified
      </div>
      
      {selectedConn && !(selectedConn.verified === true || selectedConn.status === 'ok' || selectedConn.status === 'connected') && (
        <div style={{ fontSize: 12, color: C.red, background: `${C.red}15`, border: `1px solid ${C.red}40`, borderRadius: 6, padding: '8px 12px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          ⚠️ Please test and verify this connection in the Connections tab before proceeding.
        </div>
      )}

      <Input label="Target Schema" value={form.schema} onChange={v => setField('schema', v)}
        hint="Default: public (PostgreSQL) / dbo (SQL Server)" />

      {/* Add Connection Modal */}
      {showAddConnection && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{ animation: 'fadeUp 0.2s ease-out' }}>
            <Card style={{ width: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: `1px solid ${C.borderLo}`, paddingBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus size={18} color={C.accent} /> New Connection Profile
                </h3>
                <Btn variant="ghost" size="sm" onClick={() => setShowAddConnection(false)}>✕</Btn>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                <Input label="Connection Name *" value={connForm.name} onChange={v => setC('name', v)} placeholder="e.g. TPC-H Production" />
                <Select
                  label="Database Type"
                  value={connForm.type}
                  onChange={handleTypeChange}
                  options={['PostgreSQL', 'MySQL', 'SQL Server', 'Oracle']}
                />
                <Input label="Host / IP Address *" value={connForm.host} onChange={v => setC('host', v)} placeholder="db.company.com or 192.168.1.10" />
                <Input label="Port" value={connForm.port} onChange={v => setC('port', v)} placeholder="5432" />
                <Input label="Database Name *" value={connForm.db} onChange={v => setC('db', v)} placeholder="mydb" />
                <Input label="Schema Name" value={connForm.schema} onChange={v => setC('schema', v)} placeholder="public" hint="Default: public (PostgreSQL) / dbo (SQL Server)" />
                <Input label="Username" value={connForm.user} onChange={v => setC('user', v)} placeholder="postgres" />
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      value={connForm.pw} onChange={e => setC('pw', e.target.value)}
                      type="password" placeholder="••••••••"
                      style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 8, color: C.text, padding: '9px 13px',
                        width: '100%', fontSize: 13,
                      }}
                    />
                  </div>
                </div>
                
                {/* SSL Option Radios */}
                <div style={{ gridColumn: '1 / -1', marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 8 }}>SSL Mode</label>
                  <div style={{ display: 'flex', gap: 20 }}>
                    {['Prefer', 'Require', 'Disable'].map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.text, cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="ssl_mode"
                          checked={connForm.ssl === opt.toLowerCase()} 
                          onChange={() => setC('ssl', opt.toLowerCase())} 
                          style={{ accentColor: C.accent, width: 14, height: 14 }}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {testResult && (
                <div style={{
                  background: testResult.ok ? `${C.green}15` : `${C.red}15`,
                  border: `1px solid ${testResult.ok ? C.green : C.red}40`,
                  borderRadius: 8, padding: '12px 16px', marginBottom: 18,
                  fontSize: 12, color: testResult.ok ? C.green : C.red, display: 'flex', alignItems: 'center', gap: 8
                }}>
                  {testResult.ok ? '✅' : '❌'} {testResult.msg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16, borderTop: `1px solid ${C.borderLo}`, paddingTop: 16 }}>
                <Btn variant="ghost" onClick={testConn} disabled={testing}>
                  {testing ? 'Testing…' : '🔌 Test connection'}
                </Btn>
                <Btn onClick={saveConn} disabled={!connForm.name || !connForm.host || !connForm.db}>
                  Save & select
                </Btn>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── STEP 2 ───────────────────────────────────────────────────
function Step2({ form, setField }) {
  return (
    <div>
      <h3 style={{ fontFamily: FH, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Application Configuration</h3>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Configure the black-box application that UNMASQUE will probe.</p>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 8 }}>Application Type *</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {APP_TYPES.map(({ key, label, icon }) => (
            <div key={key} onClick={() => setField('appType', key)} style={{
              padding: '11px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${form.appType === key ? C.accent : C.border}`,
              background: form.appType === key ? C.accentDim : C.surface,
              color: form.appType === key ? C.accent : C.muted,
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontWeight: form.appType === key ? 600 : 400 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {form.appType === 'A' && (
        <>
          <Input label="Stored Procedure / Function Name" value={form.procName} onChange={v => setField('procName', v)} placeholder="get_quarterly_report" />
          <Input label="Input Parameters" value={form.procParams} onChange={v => setField('procParams', v)} placeholder="start_date=2024-01-01, region=EAST" hint="Comma-separated key=value pairs" />
        </>
      )}
      {form.appType === 'B' && (
        <>
          <Input label="Executable Path on Server" value={form.execPath} onChange={v => setField('execPath', v)} placeholder="/home/user/app/run_query.sh" />
          <Input label="Command Line Arguments" value={form.execArgs} onChange={v => setField('execArgs', v)} placeholder="--db postgres --mode query1" />
          <Input label="Working Directory (optional)" value={form.execCwd} onChange={v => setField('execCwd', v)} placeholder="/home/user/app" />
          <Select label="Output Format" value={form.execOutFormat} onChange={v => setField('execOutFormat', v)} options={['Auto-detect','CSV','TSV','JSON','Raw Table']} />
        </>
      )}
      {form.appType === 'C' && (
        <>
          <Input label="Script Path on Server" value={form.pyScriptPath} onChange={v => setField('pyScriptPath', v)} placeholder="/home/user/scripts/query.py" />
          <Select label="Python Version" value={form.pyVersion} onChange={v => setField('pyVersion', v)} options={['3.8','3.9','3.10','3.11','3.12']} />
          <Input label="Virtual Environment Path (optional)" value={form.pyVenv} onChange={v => setField('pyVenv', v)} placeholder="/home/user/.venv" />
          <Input label="Script Arguments" value={form.pyArgs} onChange={v => setField('pyArgs', v)} placeholder="--mode production" />
        </>
      )}
      {form.appType === 'D' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 16px' }}>
            <Input label="Base URL" value={form.url} onChange={v => setField('url', v)} placeholder="http://localhost:3000" />
            <Select label="HTTP Method" value={form.httpMethod} onChange={v => setField('httpMethod', v)} options={['GET','POST','PUT']} />
          </div>
          <Input label="Endpoint Path" value={form.endpoint} onChange={v => setField('endpoint', v)} placeholder="/api/reports/q3" />
          <Input label="Response Path (JSONPath)" value={form.jsonPath} onChange={v => setField('jsonPath', v)} placeholder="$.data.items" hint="Path to the result array in the JSON response" />
          <Select label="App Authentication" value={form.httpAuth} onChange={v => setField('httpAuth', v)} options={['None','Bearer Token','Basic Auth','API Key']} />
        </>
      )}
      <Input label="Timeout per Execution (seconds)" value={String(form.timeout)} onChange={v => setField('timeout', parseInt(v) || 300)} hint="Max time to wait for one application call" />

      <div style={{
        background: `${C.amber}15`, border: `1px solid ${C.amber}40`,
        borderRadius: 8, padding: '11px 14px', fontSize: 12, color: C.amber, marginTop: 8,
      }}>
        ⚠ UNMASQUE will invoke this application hundreds of times on modified versions of your database.
        A test silo schema will be created. Your original data will not be permanently modified.
      </div>
    </div>
  )
}

// ─── STEP 3 ───────────────────────────────────────────────────
function Step3({ form, setField }) {
  function toggle(name) {
    const current = form.selectedTables
    setField('selectedTables', current.includes(name)
      ? current.filter(t => t !== name)
      : [...current, name]
    )
  }
  return (
    <div>
      <h3 style={{ fontFamily: FH, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Database Schema Configuration</h3>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>Select tables UNMASQUE should consider. Deselect tables unrelated to the query to speed up extraction.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Btn size="sm" onClick={() => setField('selectedTables', SCHEMA_TABLES.map(t => t.name))}>Select All</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setField('selectedTables', [])}>Deselect All</Btn>
        <Btn size="sm" variant="ghost">Auto-fetch Schema</Btn>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['', 'Table Name', 'Rows', 'Columns', 'Primary Key', 'FK Relations'].map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '7px 10px', color: C.muted,
                fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCHEMA_TABLES.map(t => (
            <tr key={t.name} style={{ borderBottom: `1px solid ${C.borderLo}` }}>
              <td style={{ padding: '9px 10px' }}>
                <input type="checkbox" checked={form.selectedTables.includes(t.name)}
                  onChange={() => toggle(t.name)} />
              </td>
              <td style={{ padding: '9px 10px', color: C.text, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, fontSize: 12 }}>{t.name}</td>
              <td style={{ padding: '9px 10px', color: C.muted }}>{t.rows}</td>
              <td style={{ padding: '9px 10px', color: C.muted }}>{t.cols}</td>
              <td style={{ padding: '9px 10px', color: C.cyan, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{t.pk}</td>
              <td style={{ padding: '9px 10px', color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{t.fk}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 12, color: C.muted }}>
        {form.selectedTables.length} / {SCHEMA_TABLES.length} tables selected
      </div>
    </div>
  )
}

// ─── STEP 4 ───────────────────────────────────────────────────
function Step4({ form, setField }) {
  return (
    <div>
      <h3 style={{ fontFamily: FH, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Extraction Configuration</h3>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Fine-tune UNMASQUE's internal extraction behavior and clause coverage.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <Select label="Minimization Strategy" value={form.strategy} onChange={v => setField('strategy', v)}
          options={['Sampling + Halving (Recommended)','Direct Halving','Skip Minimization']}
          hint="Sampling+Halving is optimal for databases > 10 MB" />
        <Select label="FROM Detection Method" value={form.fromMethod} onChange={v => setField('fromMethod', v)}
          options={['Execution-with-Error (Fast)','Execution-with-Zero-Result (Portable)']}
          hint="Error method is faster; Zero-result works on all ANSI databases" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
          Sampling Percentage — <strong style={{ color: C.accent }}>{form.samplePct}%</strong>
        </label>
        <input type="range" min={1} max={20} value={form.samplePct}
          onChange={e => setField('samplePct', +e.target.value)} style={{ width: '100%' }} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>2% is proven optimal. Lower = faster but may need more halving iterations.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
        <Input label="Max Invocations" value={String(form.maxInv)} onChange={v => setField('maxInv', parseInt(v)||1000)} hint="Safety limit: 100–10,000" />
        <Input label="Per-Invocation Timeout (s)" value={String(form.perInvTimeout)} onChange={v => setField('perInvTimeout', parseInt(v)||300)} />
        <Input label="Total Job Timeout (min)" value={String(form.totalTimeout)} onChange={v => setField('totalTimeout', parseInt(v)||120)} />
      </div>

      <Section title="Clauses to Extract" style={{ marginTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Object.keys(form.clauses).map(k => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: form.clauses[k] ? C.text : C.muted }}>
              <input type="checkbox" checked={form.clauses[k]}
                onChange={e => setField('clauses', { ...form.clauses, [k]: e.target.checked })} />
              {k}
            </label>
          ))}
        </div>
      </Section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <Toggle on={form.distinct}  onChange={v => setField('distinct', v)}  label="DISTINCT aggregation detection" />
        <Toggle on={form.caseStmt} onChange={v => setField('caseStmt', v)} label="CASE WHEN…THEN…ELSE detection (experimental)" />
        <Toggle on={form.cleanup}  onChange={v => setField('cleanup', v)}  label="Clean up silo schema after extraction" />
      </div>
    </div>
  )
}

// ─── STEP 5 ───────────────────────────────────────────────────
function Step5({ form, setField }) {
  return (
    <div>
      <h3 style={{ fontFamily: FH, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Verification Configuration</h3>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Configure how UNMASQUE verifies correctness of the extracted query.</p>

      <Toggle on={form.checker} onChange={v => setField('checker', v)} label="Enable automated checker after extraction" />

      {form.checker && (
        <div style={{ marginTop: 20, padding: '18px 18px', background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>
              Random Databases for Verification — <strong style={{ color: C.accent }}>{form.numDbs}</strong>
            </label>
            <input type="range" min={1} max={20} value={form.numDbs}
              onChange={e => setField('numDbs', +e.target.value)} style={{ width: '100%' }} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              UNMASQUE generates N random databases and checks query equivalence via set difference
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Toggle on={form.verifyOrdering} onChange={v => setField('verifyOrdering', v)} label="Verify physical ordering (ORDER BY correctness)" />
            <Toggle on={form.xdata}          onChange={v => setField('xdata', v)}          label="XData-style mutation testing" />
            <Toggle on={form.semanticCheck}  onChange={v => setField('semanticCheck', v)}  label="Semantic equivalence check on original database (slow)" />
          </div>
        </div>
      )}

      <Section title="Notifications" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Toggle on={form.notifyInApp}  onChange={v => setField('notifyInApp', v)}  label="In-app notification when extraction completes" />
          <Toggle on={form.notifyEmail}  onChange={v => setField('notifyEmail', v)}  label="Email notification when extraction completes" />
        </div>
      </Section>

      <div style={{
        background: `${C.accent}10`, border: `1px solid ${C.accent}30`,
        borderRadius: 8, padding: '11px 14px', fontSize: 12, color: C.muted, marginTop: 8,
      }}>
        ℹ️ If verification fails, the query is marked "Unverified" rather than "Failed". You can still view and use it with manual review.
      </div>
    </div>
  )
}

// ─── STEP 6 ───────────────────────────────────────────────────
function Step6({ form, setField, setStep, conns, user }) {
  const conn = conns.find(c => c.id === form.conn)
  const sections = [
    { title: 'Job Details', step: 0, rows: [
      ['Name', form.jobName], ['Description', form.desc || '—'], ['Created by', user?.email || 'Unknown'],
    ]},
    { title: 'Database', step: 0, rows: [
      ['Connection', conn?.name || '—'], ['DB Type', conn?.type || '—'],
      ['Host', conn?.host || '—'], ['Schema', form.schema],
    ]},
    { title: 'Application', step: 1, rows: [
      ['Type', APP_TYPES.find(a => a.key === form.appType)?.label || '—'],
      ...(form.appType === 'A' ? [
        ['Procedure', form.procName || '—'],
        ['Parameters', form.procParams || '—']
      ] : form.appType === 'B' ? [
        ['Executable', form.execPath || '—'],
        ['Arguments', form.execArgs || '—'],
        ['Output Format', form.execOutFormat || '—']
      ] : form.appType === 'C' ? [
        ['Script Path', form.pyScriptPath || '—'],
        ['Version', form.pyVersion || '—'],
        ['Arguments', form.pyArgs || '—']
      ] : [
        ['URL', `${form.url}${form.endpoint}`],
        ['Method', form.httpMethod],
        ['JSONPath', form.jsonPath || '—']
      ]),
      ['Timeout', `${form.timeout}s`],
    ]},
    { title: 'Schema', step: 2, rows: [
      ['Selected Tables', `${form.selectedTables.length} tables`],
      ['Tables', form.selectedTables.join(', ')],
    ]},
    { title: 'Extraction', step: 3, rows: [
      ['Strategy', form.strategy], ['Sampling %', `${form.samplePct}%`],
      ['FROM Method', form.fromMethod],
      ['Clauses', Object.keys(form.clauses).filter(k => form.clauses[k]).join(', ')],
      ['Max Invocations', form.maxInv],
    ]},
    { title: 'Verification', step: 4, rows: [
      ['Checker', form.checker ? 'Enabled' : 'Disabled'],
      ['Random DBs', form.checker ? form.numDbs : 'N/A'],
      ['XData Mutations', form.xdata ? 'Enabled' : 'Disabled'],
    ]},
  ]

  return (
    <div>
      <h3 style={{ fontFamily: FH, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Review & Confirm</h3>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Confirm all settings before launching extraction.</p>

      {sections.map(sec => (
        <div key={sec.title} style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{sec.title}</div>
            <button onClick={() => setStep(sec.step)}
              style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Edit →</button>
          </div>
          {sec.rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
              <span style={{ color: C.muted }}>{k}</span>
              <span style={{ color: C.text, maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      ))}

      <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}40`, borderRadius: 8, padding: '11px 14px', fontSize: 12, color: C.amber, marginBottom: 18 }}>
        ⚠ UNMASQUE will create a test silo schema in your database (silo: <code>unmasque_silo_[job_id]</code>) and invoke the application many times on modified data. Original table data will not be permanently changed.
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: C.text, marginBottom: 8 }}>
        <input type="checkbox" checked={form.agreed} onChange={e => setField('agreed', e.target.checked)} style={{ marginTop: 2 }} />
        I understand that UNMASQUE will create a test silo and invoke my application many times on modified database states.
      </label>
    </div>
  )
}

// ─── WIZARD ROOT ──────────────────────────────────────────────
export default function ExtractionWizard({ setPage, setSelectedExtractionId, user }) {
  const [step, setStep]   = useState(0)
  const [form, setForm]   = useState(DEFAULT_FORM)
  const [conns, setConns] = useState([])
  const [launching, setLaunching] = useState(false)

  useEffect(() => {
    let active = true
    getConnections().then(data => {
      if (active) {
        setConns(data || [])
        if (data && data.length > 0) {
          setForm(p => ({ ...p, conn: p.conn || data[0].id }))
        }
      }
    }).catch(err => console.error(err))
    return () => { active = false }
  }, [])

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })) }

  const steps = [
    <Step1 form={form} setField={setField} conns={conns} setConns={setConns} />,
    <Step2 form={form} setField={setField} />,
    <Step3 form={form} setField={setField} />,
    <Step4 form={form} setField={setField} />,
    <Step5 form={form} setField={setField} />,
    <Step6 form={form} setField={setField} setStep={setStep} conns={conns} user={user} />,
  ]

  function canNext() {
    if (step === 0) {
      if (!form.jobName.trim().length || !form.conn) return false
      const conn = conns.find(c => c.id === form.conn)
      if (!conn || (conn.status !== 'ok' && conn.verified !== true)) return false
      return true
    }
    if (step === 5) return form.agreed
    return true
  }

  return (
    <div style={{ animation: 'fadeUp 0.3s ease', maxWidth: 780 }}>
      {/* Stepper */}
      <div style={{ display: 'flex', marginBottom: 34, paddingBottom: 4 }}>
        {STEP_LABELS.map((label, i) => (
          <StepperDot key={i} i={i} label={label} current={step} total={STEP_LABELS.length} />
        ))}
      </div>

      <Card>
        {steps[step]}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
          <Btn variant="ghost" onClick={() => step > 0 ? setStep(s => s - 1) : setPage('dashboard')}>
            ← Back
          </Btn>
          {step < STEP_LABELS.length - 1
            ? <Btn onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Next →</Btn>
            : (
              <Btn
                disabled={!form.agreed || launching}
                onClick={async () => {
                  try {
                    setLaunching(true)
                    const response = await startExtraction({
                      // keep a compact payload; backend will store it
                      ...form,
                    })
                    if (response?.job?.id) setSelectedExtractionId?.(response.job.id)
                    setPage('monitor')
                  } catch (e) {
                    alert(e?.message || 'Launch failed.')
                  } finally {
                    setLaunching(false)
                  }
                }}
              >
                {launching ? 'Launching…' : '🚀 Launch Extraction'}
              </Btn>
            )

          }
        </div>
      </Card>
    </div>
  )
}

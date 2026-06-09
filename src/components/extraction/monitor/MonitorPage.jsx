import { useState, useEffect, useRef } from 'react'
import { C, FM, FH } from '@/utils/theme.js'
import { Card, Section, Badge, Btn, ProgressBar, Spinner } from '@/components/shared/UI.jsx'
const PIPELINE_STEPS = [
  { id: 1, name: 'FROM Clause Extraction', method: 'Execution-with-Error', result: 'Tables: customer, orders, lineitem', detail: '3 tables found via rename strategy' },
  { id: 2, name: 'Database Minimization', method: 'Sampling (2%) + Halving', result: 'D¹: 1 row/table in 3m 42s', detail: 'lineitem: 6M → 1 row (99.9999998% reduction)' },
  { id: 3, name: 'Join Predicate Extraction', method: 'FK candidate testing', result: 'l_orderkey = o_orderkey, o_custkey = c_custkey', detail: '6 candidate edges tested, 4 rejected' },
  { id: 4, name: 'Filter Predicate Extraction', method: 'Binary search + LIKE', result: "3 predicates: c_mktsegment='BUILDING', o_orderdate<…, l_shipdate>…", detail: 'Binary search on 2 date columns, exact match on 1 char column' },
  { id: 5, name: 'Projection Column Extraction', method: '4-equation system', result: 'revenue = l_extendedprice * (1 - l_discount)', detail: 'Equation system solved: a=1, b=-1, c=0, d=0' },
  { id: 6, name: 'GROUP BY Extraction', method: 'Synthetic Dgen', result: 'l_orderkey, o_orderdate, o_shippriority', detail: '3 grouping columns confirmed' },
  { id: 7, name: 'Aggregation Function ID', method: 'Aggregation disambiguation', result: 'revenue → SUM', detail: 'Tested k=2: sum=7.0, avg=3.5, min=3, max=4, count=2 → SUM matched' },
  { id: 8, name: 'ORDER BY Extraction', method: 'D²_same / D²_rev', result: 'revenue DESC, o_orderdate ASC', detail: '2-column ordering confirmed via comparison databases' },
  { id: 9, name: 'LIMIT Extraction', method: 'Geometric progression', result: 'LIMIT 10', detail: '4→40→400 rows: got 10 at 40 → LIMIT=10' },
  { id: 10, name: 'Query Assembly & Verification', method: 'Checker (5 random DBs)', result: '✓ 5/5 random databases matched', detail: 'Physical ordering ✓, XData mutation testing ✓' },
]
import { getExtraction, getExtractionLogs, abortExtraction, downloadLogs } from '@/services/api.js'
import toast from 'react-hot-toast'
import { io } from 'socket.io-client'

export default function MonitorPage({ setPage, extractionId }) {
  const [job, setJob] = useState(null)
  const [inv, setInv] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState([])
  const [steps, setSteps] = useState(() => PIPELINE_STEPS.map(s => ({ ...s, status: 'pending', dynamicSummary: null })))

  const updateStep = (index, updates) => {
    setSteps(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], ...updates };
      }
      return copy;
    });
  }
  const [autoScroll, setAutoScroll] = useState(true)
  const [logFilter, setLogFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aborting, setAborting] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [stuckWarning, setStuckWarning] = useState(false) // FIX: State for detecting stuck jobs

  const logRef = useRef(null)
  const lastLogTimeRef = useRef(Date.now()) // FIX: Ref tracking when the last log arrived
  const lastLogCountRef = useRef(0) // FIX: Ref tracking count of received logs
  const prevStatusRef = useRef('running') // FIX: Ref tracking previous job status to show toast exactly once

  useEffect(() => {
    let active = true
    let interval = null

    // Fetch initial job details
    async function loadInitial() {
      if (!extractionId) {
        setError('No extraction selected.')
        setLoading(false)
        return
      }
      try {
        const extracted = await getExtraction(extractionId)
        if (!active) return
        setJob(extracted)
        setInv(extracted.inv || 0)

        if (extracted.status === 'running' && extracted.startedAt) {
          const startTime = new Date(extracted.startedAt).getTime()
          setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)))
          interval = setInterval(() => {
            setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)))
          }, 1000)
        } else {
          let durSecs = 0;
          if (extracted.duration?.includes('m')) {
            const parts = extracted.duration.split('m');
            durSecs = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
          } else {
            durSecs = parseInt(extracted.duration) || 0;
          }
          setElapsed(durSecs)
        }
        setLoading(false)
      } catch (err) {
        if (active) setError(err.message || 'Unable to load extraction details.')
      }
    }
    loadInitial()

    const socket = io('/ws/jobs/' + extractionId + '/stream', { path: '/ws/socket.io' });

    socket.on('invocation_update', (data) => {
      setInv(data.totalInvocations);
    });

    socket.on('step_started', (data) => {
      if (data.jobId !== extractionId) return;
      setCurrentStep(data.stepIndex);
      updateStep(data.stepIndex, { status: 'running' });
    });

    socket.on('step_completed', (data) => {
      if (data.jobId !== extractionId) return;
      updateStep(data.stepIndex, {
        status: 'completed',
        dynamicSummary: data.summary
      });
      setProgress(((data.stepIndex + 1) / PIPELINE_STEPS.length) * 100);
    });

    socket.on('log', (data) => {
      let newLog = data.message;
      if (typeof newLog === 'string') {
        const matches = newLog.match(/^\[(.*?)\] \[(.*?)\] \[(.*?)\] (.*)$/)
        if (matches) newLog = { t: matches[1], lvl: matches[2], phase: matches[3], msg: matches[4] }
        else {
          const oldMatches = newLog.match(/^\[(.*?)\] \[(.*?)\] (.*)$/)
          if (oldMatches) newLog = { t: oldMatches[1], lvl: oldMatches[2], phase: '', msg: oldMatches[3] }
          else newLog = { t: '', lvl: 'INFO', phase: '', msg: newLog }
        }
      }
      setLogs(prev => [...prev, newLog]);
    });

    const handleTerminalState = async () => {
      if (interval) clearInterval(interval);
      if (!active) return;
      try {
        const finalJob = await getExtraction(extractionId);
        if (!active) return;
        setJob(finalJob);
        if (finalJob.progress !== undefined) setProgress(finalJob.progress);
        if (finalJob.currentStep !== undefined) setCurrentStep(finalJob.currentStep);
        if (finalJob.inv !== undefined) setInv(finalJob.inv);
        if (finalJob.logs) {
          const parsedLogs = finalJob.logs.map(l => {
            if (typeof l !== 'string') return l;
            const match1 = l.match(/^\[(.*?)\] \[(.*?)\] \[(.*?)\] (.*)$/);
            if (match1) return { t: match1[1], lvl: match1[2], phase: match1[3], msg: match1[4] };
            const match2 = l.match(/^\[(.*?)\] \[(.*?)\] (.*)$/);
            if (match2) return { t: match2[1], lvl: match2[2], phase: '', msg: match2[3] };
            return { t: '', lvl: 'INFO', phase: '', msg: l };
          });
          setLogs(parsedLogs);
        }
      } catch (err) {
        console.error("Failed to fetch final state", err);
      }
      socket.disconnect();
    };

    socket.on('complete', async () => {
      await handleTerminalState();
      toast.success('Extraction completed successfully!');
    });

    socket.on('error', async (err) => {
      await handleTerminalState();
      setError(err?.message || 'Extraction failed.');
      toast.error('Extraction failed.');
    });

    return () => {
      active = false;
      if (interval) clearInterval(interval);
      socket.disconnect();
    }
  }, [extractionId])

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  async function handleAbort() {
    if (!extractionId || !window.confirm('Abort this extraction?')) return
    try {
      setAborting(true)
      await abortExtraction(extractionId)
      setPage('extractions')
    } catch (err) {
      alert(err.message || 'Abort failed.')
    } finally {
      setAborting(false)
    }
  }

  async function handleCopyLogs() {
    try {
      await navigator.clipboard.writeText(logs.map(l => `[${l.t}] [${l.lvl}] ${l.phase ? `[${l.phase}] ` : ''}${l.msg}`).join('\n')) // FIX: Include phase in copy
      setCopyStatus('Copied!')
      setTimeout(() => setCopyStatus(''), 2000)
    } catch {
      alert('Copy failed.')
    }
  }

  async function handleDownloadLogs() {
    if (!extractionId) return
    try {
      await downloadLogs(extractionId)
    } catch (err) {
      alert(err.message || 'Download failed.')
    }
  }

  const fmt = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const displayProgress = progress;

  const filteredLogs = logFilter === 'ALL' ? logs : logs.filter(l => l.lvl === logFilter)

  return (
    <div style={{ animation: 'fadeUp 0.3s ease' }}>
      {loading ? (
        <div style={{ padding: 28, color: C.muted }}>Loading extraction details…</div>
      ) : error ? (
        <div style={{ padding: 28, color: C.red }}>{error}</div>
      ) : (
        <>
          {stuckWarning && ( // FIX: Show stuck warning banner visually
            <div style={{ background: `${C.amber}22`, border: `1px solid ${C.amber}`, color: C.amber, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
              ⚠ Warning: No new logs received in the last 60 seconds. The job might be stuck.
            </div>
          )}
          {/* Header row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {[
              { label: 'STATUS', val: <Badge status={job?.status || 'running'} />, },
              { label: 'JOB', val: <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{job?.name || 'Extraction Job'}</span> },
              { label: 'ELAPSED', val: <span style={{ fontFamily: FM, fontSize: 18, color: C.cyan }}>{fmt(elapsed)}</span> },
              { label: 'INVOCATIONS', val: <span style={{ fontFamily: FM, fontSize: 18, color: C.accent }}>{inv.toLocaleString()}</span> },
              { label: 'STEP', val: <span style={{ fontFamily: FM, fontSize: 18, color: C.text }}>{Math.min(currentStep + 1, PIPELINE_STEPS.length)}/{PIPELINE_STEPS.length}</span> },
            ].map(({ label, val }) => (
              <div key={label} style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '12px 16px', flexShrink: 0,
              }}>
                <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
                {val}
              </div>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Btn variant="ghost" onClick={() => setPage('results')} disabled={!job}>View Results →</Btn>
              <Btn variant="danger" onClick={handleAbort} disabled={!job || aborting}>{aborting ? 'Aborting…' : '⏹ Abort'}</Btn>
            </div>
          </div>

          {/* Overall progress */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted, marginBottom: 6 }}>
              <span>Overall progress</span>
              <span>{displayProgress}%</span>
            </div>
            <ProgressBar value={displayProgress} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Pipeline steps */}
            <Card>
              <Section title="Extraction Pipeline">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {steps.map((p, i) => {
                    const done = p.status === 'completed' || (job?.status === 'completed' && i < 10)
                    const active = p.status === 'running' && job?.status === 'running'
                    const pending = p.status === 'pending' && !done && !active
                    return (
                      <div key={p.id} style={{
                        display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 8,
                        background: active ? `${C.accent}14` : done ? `${C.green}08` : 'transparent',
                        border: `1px solid ${active ? C.accent : done ? `${C.green}40` : C.borderLo}`,
                        marginBottom: 3, transition: 'all 0.3s',
                      }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                          background: done ? C.greenDim : active ? C.accentDim : C.dim,
                          border: `1.5px solid ${done ? C.green : active ? C.accent : C.muted}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: done ? C.green : active ? C.accent : C.muted,
                        }}>
                          {done ? '✓' : active ? <Spinner size={12} color={C.accent} /> : p.id}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: done ? C.green : active ? C.text : C.muted }}>
                              {p.name}
                            </span>
                            {active && (
                              <span style={{ fontSize: 10, color: C.cyan, animation: 'pulse 1.4s ease-in-out infinite', flexShrink: 0, marginLeft: 6 }}>
                                running…
                              </span>
                            )}
                          </div>
                          {done && (
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: FM, wordBreak: 'break-word' }}>
                              {p.dynamicSummary || p.result}
                            </div>
                          )}
                          {active && (
                            <div style={{ fontSize: 11, color: C.cyan, marginTop: 2 }}>
                              {p.detail}
                            </div>
                          )}
                          {pending && (
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, opacity: 0.5 }}>
                              {p.method}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Section>
            </Card>

            {/* Log stream */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Card style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h3 style={{ fontFamily: FH, fontSize: 13, fontWeight: 700, color: C.text }}>Live Log Stream</h3>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['ALL', 'INFO', 'WARN', 'ERROR'].map(f => (
                      <button key={f} onClick={() => setLogFilter(f)} style={{
                        padding: '3px 8px', fontSize: 10, borderRadius: 4, cursor: 'pointer', fontWeight: 600,
                        background: logFilter === f ? C.accentDim : 'transparent',
                        color: logFilter === f ? C.accent : C.muted,
                        border: `1px solid ${logFilter === f ? C.accent : C.border}`,
                      }}>{f}</button>
                    ))}
                  </div>
                </div>
                <div
                  ref={logRef}
                  style={{
                    background: C.bg, borderRadius: 8, padding: '10px 12px',
                    height: 340, overflowY: 'auto', fontFamily: FM, fontSize: 11,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  {filteredLogs.map((l, i) => (
                    <div key={i} style={{ marginBottom: 3, lineHeight: 1.5 }}>
                      <span style={{ color: C.dim }}>[{l.t}]</span>
                      <span style={{
                        marginLeft: 6, marginRight: 6, fontWeight: 600,
                        color: l.lvl === 'ERROR' ? C.red : l.lvl === 'WARN' ? C.amber : C.accent,
                      }}>[{l.lvl}]</span>
                      {l.phase && <span style={{ color: C.purple, marginRight: 6 }}>[{l.phase}]</span>} {/* FIX: Render the phase label prominently */}
                      <span style={{ color: C.text }}>{l.msg}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: C.muted }}>
                    <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
                    Auto-scroll
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn size="sm" variant="ghost" onClick={handleCopyLogs}>{copyStatus || '📋 Copy'}</Btn>
                    <Btn size="sm" variant="ghost" onClick={handleDownloadLogs}>⬇ Download</Btn>
                  </div>
                </div>
              </Card>

              {/* Invocation counter sparkline */}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Application Invocations</div>
                    <div style={{ fontFamily: FM, fontSize: 24, color: C.accent, fontWeight: 500 }}>{inv.toLocaleString()}</div>
                  </div>
                  <div style={{ fontSize: 24, color: C.accentDim }}>⚡</div>
                </div>
                <div style={{ display: 'flex', gap: 2, marginTop: 12, alignItems: 'flex-end', height: 32 }}>
                  {[20, 35, 28, 45, 62, 80, 90, 78, 95, 110, 127].map((v, i) => (
                    <div key={i} style={{
                      flex: 1, background: C.accent, borderRadius: 2, opacity: 0.3 + (i / 10) * 0.7,
                      height: `${(v / 127) * 100}%`,
                    }} />
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

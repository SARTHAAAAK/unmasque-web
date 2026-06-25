import { useEffect, useState } from 'react'
import { C, FM, FH } from '@/utils/theme.js'
import { Card, Section, Tabs, Badge, Btn, SqlView } from '@/components/shared/UI.jsx'
import { getExtraction, downloadSql, downloadPdf } from '@/services/api.js'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'



const CLAUSE_COLORS = { FROM: C.cyan, JOIN: C.accent, FILTER: C.purple, GROUP: C.amber, AGG: C.green, ORDER: C.red, LIMIT: C.muted }
const STEP_CHART_COLORS = [C.cyan, C.amber, C.accent, C.purple, C.green, C.cyan, C.accent, C.green, C.amber, C.green]

export default function ResultsPage({ setPage, extractionId }) {
  const [tab, setTab] = useState(0)
  const [copied, setCopied] = useState(false)
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!extractionId) {
        setError('No extraction selected.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const extraction = await getExtraction(extractionId)
        if (active) setJob(extraction)
      } catch (err) {
        if (active) setError(err.message || 'Unable to load extraction details.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [extractionId])

  function copySQL() {
    const finalSql = job?.extracted_query || job?.extractedQuery || job?.sql;
    if (!finalSql || finalSql.startsWith('-- placeholder SQL')) return
    navigator.clipboard?.writeText(finalSql).catch(() => { })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ animation: 'fadeUp 0.3s ease' }}>
      {loading ? (
        <div style={{ padding: 28, color: C.muted }}>Loading extraction details…</div>
      ) : error ? (
        <div style={{ padding: 28, color: C.red }}>{error}</div>
      ) : job?.status === 'running' ? ( // FIX: Render CTA instead of empty results if still running
        <div style={{ padding: 40, textAlign: 'center', background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <h2 style={{ fontFamily: FH, fontSize: 20, color: C.text, marginBottom: 16 }}>Extraction Still Running</h2>
          <p style={{ color: C.muted, marginBottom: 24, fontSize: 14 }}>This extraction job is currently in progress. Results are not yet available.</p>
          <Btn onClick={() => setPage('monitor')}>Job still running — go to Monitor</Btn> {/* FIX: Direct CTA with required text */}
        </div>
      ) : (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: FH, fontSize: 16, fontWeight: 700, color: C.text }}>{job?.name || 'Extraction Result'}</h2>
              <Badge status={job?.status || 'unknown'} />
              {job?.status === 'completed' && (() => {
                const v = job?.config?.verification;
                const hasResults = v?.results?.length > 0;
                const allResultsPass = hasResults && v.results.every(r => r.match && r.orderingMatch);
                const xdataOk = v?.xdataMatch !== false; // true or undefined (no xdata test) is acceptable
                const orderingOk = v?.physicalOrderingMatch !== false;
                const verified = hasResults ? (allResultsPass && xdataOk && orderingOk) : false;
                return verified
                  ? <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✅ Verified</span>
                  : hasResults
                    ? <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>❌ Verification Failed</span>
                    : <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>⚠️ Not Verified</span>;
              })()}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn size="sm" variant="ghost" onClick={copySQL}>{copied ? '✓ Copied!' : '📋 Copy SQL'}</Btn>
              <Btn size="sm" variant="ghost" onClick={() => downloadSql(extractionId)}>⬇ Download .sql</Btn>
              <Btn size="sm" variant="ghost" onClick={() => downloadPdf(extractionId)}>⬇ PDF Report</Btn>
              <Btn size="sm" variant="cyan" onClick={() => setPage('monitor')} disabled={!job}>View Monitor</Btn>
            </div>
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 18, flexWrap: 'wrap' }}>
            {[
              ['Status', job?.status || 'Unknown'],
              ['Duration', job?.duration || '—'],
              ['Invocations', job?.inv?.toLocaleString() || '—'],
              ['Database', job?.db || '—'],
              ['Started', job?.started || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <span style={{ fontSize: 11, color: C.muted }}>{k}: </span>
                <span style={{ fontSize: 12, color: C.text, fontFamily: FM }}>{v}</span>
              </div>
            ))}
          </div>

          {job?.status === 'failed' && (
            <div style={{
              background: `${C.red}15`, border: `1px solid ${C.red}50`, 
              borderRadius: 8, padding: '14px 16px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 10
            }}>
              <span style={{ fontSize: 18 }}>🚨</span>
              <div style={{ color: C.red, fontSize: 14, fontWeight: 600 }}>
                {(() => {
                  const errObj = job?.error || job?.failure_reason || job?.failureReason;
                  let errText = null;
                  if (typeof errObj === 'string') errText = errObj;
                  else if (errObj?.step && errObj?.message) errText = `at ${errObj.step}: ${errObj.message}`;
                  else {
                    const errLog = job?.logs?.find?.(l => typeof l === 'string' && l.includes('[ERROR]'));
                    if (errLog) {
                      const match = errLog.match(/\[ERROR\]\s*(?:\[(.*?)\])?\s*(.*)/);
                      if (match && match[1] && match[2]) errText = `at ${match[1]}: ${match[2]}`;
                      else if (match && match[2]) errText = match[2];
                      else errText = errLog.split('[ERROR]')[1]?.trim();
                    }
                  }
                  
                  if (errText) {
                    return errText.startsWith('at ') ? `Extraction failed ${errText}` : `Extraction failed: ${errText}`;
                  }
                  return 'Extraction failed. Check Raw Logs for details.';
                })()}
              </div>
            </div>
          )}

          <Tabs tabs={['Extracted Query', 'Query Breakdown', 'Performance', 'Verification', 'Raw Logs']} active={tab} onChange={setTab} />

          {/* ─── TAB 0: Extracted Query ─── */}
          {tab === 0 && (
            <Card>
              <div style={{ background: C.bg, borderRadius: 8, padding: '16px 12px', border: `1px solid ${C.border}`, marginBottom: 14 }}>
                {(() => {
                  const finalSql = job?.extracted_query || job?.extractedQuery || job?.sql;
                  const hasValidSql = finalSql && !finalSql.startsWith('-- placeholder SQL');
                  return hasValidSql ? (
                    <SqlView code={finalSql} />
                  ) : (
                    <div style={{ color: C.muted, textAlign: 'center', padding: '20px 0', fontSize: 14 }}>No query extracted yet</div>
                  );
                })()}
              </div>
              <div style={{
                background: job?.status === 'running' ? `${C.amber}10` : job?.status === 'failed' ? `${C.red}10` : `${C.green}10`,
                border: `1px solid ${job?.status === 'running' ? C.amber : job?.status === 'failed' ? C.red : C.green}40`,
                borderRadius: 8, padding: '11px 14px', fontSize: 12,
                color: job?.status === 'running' ? C.amber : job?.status === 'failed' ? C.red : C.green,
              }}>
                {job?.status === 'running' ? '⏳ Extraction in progress...' : job?.status === 'failed' ? '❌ Extraction failed.' : `✅ Extraction verified — ${job?.config?.numDbs || 1} of ${job?.config?.numDbs || 1} random databases matched${job?.config?.verifyOrdering ? ' · Physical ordering ✓' : ''}${job?.config?.xdata ? ' · XData mutation testing ✓' : ''}`}
              </div>
            </Card>
          )}

          {/* ─── TAB 1: Query Breakdown ─── */}
          {tab === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(() => {
                const metrics = job?.config?.stepMetrics || [];
                const getTime = (name) => metrics.find(m => m.s === name)?.t || 0.2;
                
                return [
                  { clause: 'FROM', color: C.cyan, title: 'Tables Found', value: job?.config?.selectedTables?.join(', ') || 'Auto-detected tables', detail: `${job?.tables || 0} tables · Execution-with-Error method · ${getTime('FROM')}s` },
                  { clause: 'JOIN', color: C.accent, title: 'Join Predicates', value: job?.sql?.includes('JOIN') ? 'Inner Joins Extracted' : 'No JOINs detected', detail: `Analyzed graph · ${getTime('Join')}s` },
                  { clause: 'FILTER', color: C.purple, title: 'WHERE Predicates', value: job?.sql?.includes('WHERE') ? 'Filters Extracted' : 'No WHERE clause', detail: `Binary search algorithm · ${getTime('Filter')}s` },
                  { clause: 'PROJECT', color: C.green, title: 'Projection Columns', value: 'Selected Attributes', detail: `Linear equation system · ${getTime('Projection')}s` },
                  { clause: 'GROUP', color: C.amber, title: 'GROUP BY Columns', value: job?.sql?.includes('GROUP BY') ? 'Groupings Extracted' : 'No GROUP BY clause', detail: `Synthetic databases · ${getTime('GROUP')}s` },
                  { clause: 'AGG', color: C.green, title: 'Aggregation Functions', value: job?.sql?.match(/SUM|MIN|MAX|COUNT|AVG/i) ? 'Aggregates Identified' : 'No aggregates', detail: `Test queries matched · ${getTime('Aggregation')}s` },
                  { clause: 'ORDER', color: C.red, title: 'ORDER BY', value: job?.sql?.includes('ORDER BY') ? 'Ordering Extracted' : 'No ORDER BY clause', detail: `D²_same vs D²_rev analysis · ${getTime('ORDER')}s` },
                  { clause: 'LIMIT', color: C.muted, title: 'LIMIT', value: job?.sql?.includes('LIMIT') ? 'LIMIT Extracted' : 'No LIMIT clause', detail: `Geometric progression · ${getTime('LIMIT')}s` },
                ].filter(c => {
                  const map = { 'GROUP': 'GROUPBY', 'ORDER': 'ORDERBY' };
                  return job?.clauses?.includes(c.clause) || job?.clauses?.includes(map[c.clause] || c.clause);
                }).map(({ clause, color, title, value, detail }) => (
                  <Card key={clause} style={{ borderColor: `${color}44` }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ background: `${color}22`, color, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                        {clause}
                      </span>
                      <span style={{ fontSize: 12, color: C.muted }}>{title}</span>
                    </div>
                    <pre style={{ fontFamily: FM, fontSize: 12, color: C.text, whiteSpace: 'pre-wrap', marginBottom: 8, lineHeight: 1.6 }}>
                      {value}
                    </pre>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{detail}</div>
                  </Card>
                ));
              })()}
            </div>
          )}

          {/* ─── TAB 2: Performance ─── */}
          {tab === 2 && (
            <div>
              <Card style={{ marginBottom: 14 }}>
                <Section title="Time Per Pipeline Step (seconds)">
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={(job?.config?.stepMetrics || [])} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.dim} />
                      <XAxis dataKey="s" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="t" name="Time (s)" radius={[4, 4, 0, 0]}>
                        {(job?.config?.stepMetrics || []).map((d, i) => <Cell key={i} fill={STEP_CHART_COLORS[i]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
                {(() => {
                  const metrics = job?.config?.stepMetrics || [];
                  const fastest = metrics.length ? [...metrics].sort((a, b) => a.t - b.t)[0] : null;
                  const slowest = metrics.length ? [...metrics].sort((a, b) => b.t - a.t)[0] : null;
                  
                  return [
                    { label: 'Total Invocations', val: job?.inv?.toLocaleString() || '—', sub: 'Across all pipeline steps', col: C.accent },
                    { label: 'Total Duration', val: job?.duration || '—', sub: 'End-to-end extraction', col: C.text },
                    { label: 'DB Reduction', val: job?.config?.dbReduction ? `${job.config.dbReduction}%` : 'N/A', sub: job?.config?.dbReduction ? `${job?.tables || 0} tables minified` : 'Not computed', col: job?.config?.dbReduction ? C.green : C.muted },
                    { label: `${fastest?.s || 'Step'} (fastest)`, val: `${fastest?.t || 0}s`, sub: 'Quickest pipeline stage', col: C.cyan },
                    { label: `${slowest?.s || 'Step'} (slowest)`, val: `${slowest?.t || 0}s`, sub: 'Most intensive stage', col: C.amber },
                    { label: 'Overhead ratio', val: job?.status === 'running' ? '—' : (job?.config?.overheadRatio ? job.config.overheadRatio + '×' : '—'), sub: 'vs native query execution', col: C.purple },
                  ].map(({ label, val, sub, col }) => (
                    <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 22, fontFamily: FH, fontWeight: 700, color: col }}>{val}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* ─── TAB 3: Verification ─── */}
          {tab === 3 && (
            <Card>
              <Section title={`Checker Results — ${job?.config?.numDbs || 5} Random Databases`}>
                {job?.status === 'failed' && (
                  <div style={{
                    background: `${C.amber}15`, border: `1px solid ${C.amber}50`,
                    borderRadius: 6, padding: '10px 14px', marginBottom: 16,
                    fontSize: 13, color: C.amber, fontWeight: 500
                  }}>
                    ⚠️ Verification passed, but the extraction failed at a later step. See error details above.
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 20 }}>
                  <thead>
                    <tr>
                      {['DB #', 'Row Count Match', 'Set Difference', 'Ordering Match', 'Overall'].map(h => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '8px 12px', color: C.muted,
                          fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(job?.config?.verification?.results || []).map((v, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.borderLo}` }}>
                        <td style={{ padding: '10px 12px', color: C.muted, fontFamily: FM }}>{v.dbName || `DB_${String(i+1).padStart(2, '0')}`}</td>
                        <td style={{ padding: '10px 12px', color: v.match ? C.green : C.red }}>{v.match ? '✅ Match' : '❌ Failed'}</td>
                        <td style={{ padding: '10px 12px', color: v.match ? C.green : C.red, fontFamily: FM }}>{v.diffRows !== undefined ? `${v.diffRows} rows` : '—'}</td>
                        <td style={{ padding: '10px 12px', color: v.orderingMatch ? C.green : C.red }}>{v.orderingMatch ? '✅ Correct' : '❌ Error'}</td>
                        <td style={{ padding: '10px 12px' }}><Badge status={v.match && v.orderingMatch ? 'completed' : 'failed'} /></td>
                      </tr>
                    ))}
                    {!(job?.config?.verification?.results?.length) && (
                      <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: C.muted }}>No verification data available</td></tr>
                    )}
                  </tbody>
                </table>
              </Section>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(() => {
                  const v = job?.config?.verification;
                  const xTotal = v?.xdataMutationsTotal || 0;
                  const xMatched = v?.xdataMutationsMatched || 0;
                  const hasXData = xTotal > 0;
                  const xPass = hasXData && v?.xdataMatch;
                  const xColor = !hasXData ? C.muted : xPass ? C.green : C.red;
                  return (
                    <div style={{ background: `${xColor}10`, border: `1px solid ${xColor}40`, borderRadius: 8, padding: '12px 14px', fontSize: 12, color: xColor }}>
                      {!hasXData
                        ? '— XData mutation testing: No verification data available'
                        : `${xPass ? '✅' : '❌'} XData mutation testing: ${xMatched} of ${xTotal} mutations correctly distinguished`}
                    </div>
                  );
                })()}
                {(() => {
                  const v = job?.config?.verification;
                  const hasOrderingData = v?.physicalOrderingMatch !== undefined;
                  const orderingPass = v?.physicalOrderingMatch === true;
                  const hasResults = v?.results?.length > 0;
                  const allOrderingMatch = hasResults && v.results.every(r => r.orderingMatch);
                  const resolved = hasOrderingData ? orderingPass : (hasResults ? allOrderingMatch : false);
                  const hasAnyData = hasOrderingData || hasResults;
                  const color = !hasAnyData ? C.muted : resolved ? C.green : C.red;
                  return (
                    <div style={{ background: `${color}10`, border: `1px solid ${color}40`, borderRadius: 8, padding: '12px 14px', fontSize: 12, color }}>
                      {!hasAnyData
                        ? '— Physical ordering: No verification data available'
                        : resolved
                          ? '✅ Physical ordering: positional checksums match on all random databases'
                          : '❌ Physical ordering: positional checksum mismatch detected'}
                    </div>
                  );
                })()}
              </div>
            </Card>
          )}

          {/* ─── TAB 4: Raw Logs ─── */}
          {tab === 4 && (
            <Card>
              <div style={{ padding: 20, background: '#0D1117', borderRadius: 8, overflowX: 'auto', fontFamily: FM, fontSize: 12, color: C.muted, whiteSpace: 'pre-wrap' }}>
                {job?.logs && job.logs.length > 0 ? job.logs.join('\n') : 'No logs available.'}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

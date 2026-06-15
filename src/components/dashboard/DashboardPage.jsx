import { C, FH, FM } from '../../utils/theme.js'
import { StatCard, Card, Section, Badge, Btn, ClausePill, ProgressBar } from '../shared/UI.jsx'
import { useEffect, useState, useMemo } from 'react'

import { getExtractions, getConnections } from '../../services/api.js'
import { io } from 'socket.io-client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

export default function DashboardPage({ setPage }) {
  const [items, setItems] = useState([])
  const [conns, setConns] = useState([])
  const [totalExtractions, setTotalExtractions] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function fetchList() {
      try {
        const [list, connList] = await Promise.all([
          getExtractions(),
          getConnections()
        ])
        if (active) {
          setItems(list?.data ? list.data : (Array.isArray(list) ? list : []))
          setTotalExtractions(list?.total || (Array.isArray(list) ? list.length : 0))
          setConns(connList || [])
        }
      } catch {
        if (active) {
          setItems([])
          setConns([])
        }
      }
    }

    async function load() {
      setLoading(true)
      await fetchList()
      if (active) setLoading(false)
    }

    load()
    
    const socket = io({ path: '/ws/socket.io' })
    socket.on('dashboard_update', () => {
      fetchList()
    })

    return () => { 
      active = false 
      socket.disconnect()
    }
  }, [])

  const runningJobs = useMemo(() => items.filter(j => j.status === 'running'), [items])
  const runningJob = runningJobs[0]

  const total = totalExtractions
  const successful = useMemo(() => items.filter(j => j.status === 'completed').length, [items])
  const successRate = total > 0 ? Math.round((successful / total) * 100) : 0
  const totalConns = conns.length

  const chartData = useMemo(() => {
    return items.slice(0, 15).reverse().map(j => {
      let t = 0
      if (j.duration && j.duration !== '—') {
        const parts = j.duration.split(' ')
        for (const p of parts) {
          if (p.includes('m')) t += parseInt(p) || 0
          if (p.includes('s')) t += (parseInt(p) || 0) / 60
        }
      }
      return { n: j.name.substring(0, 8), t: Number(t.toFixed(2)) }
    })
  }, [items])

  return (

    <div style={{ animation: 'fadeUp 0.3s ease' }}>
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatCard label="Total Extractions" value={total.toString()}  sub="All time"        color={C.text}   icon="📊" />
        <StatCard label="Successful"        value={successful.toString()}  sub={`${successRate}% success rate`} color={C.green}  icon="✅" />
        <StatCard label="Running Now"       value={runningJobs.length.toString()}   sub={`${runningJobs.length} job${runningJobs.length === 1 ? '' : 's'} active`}     color={C.cyan}   icon="⚡" />
        <StatCard label="DB Connections"    value={totalConns.toString()}   sub="Saved profiles"   color={C.accent} icon="🔌" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 20 }}>
        {/* Recent extractions table */}
        <Card>
          <Section
            title="Recent Extractions"
            action={<Btn size="sm" variant="ghost" onClick={() => setPage('extractions')}>View All →</Btn>}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Job Name','Database','Status','Started','Duration',''].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '7px 10px', color: C.muted,
                      fontWeight: 600, fontSize: 11, letterSpacing: 0.5,
                      borderBottom: `1px solid ${C.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(items || []).slice(0, 5).map(j => (


                  <tr key={j.id}
                    onClick={() => setPage(j.status === 'running' ? 'monitor' : 'results')}
                    style={{ borderBottom: `1px solid ${C.borderLo}`, cursor: 'pointer' }}
                  >
                    <td style={{ padding: '10px 10px', color: C.text, fontWeight: 500 }}>{j.name}</td>
                    <td style={{ padding: '10px 10px', color: C.muted, fontSize: 12 }}>{j.db}</td>
                    <td style={{ padding: '10px 10px' }}><Badge status={j.status} /></td>
                    <td style={{ padding: '10px 10px', color: C.muted, fontFamily: FM, fontSize: 11 }}>
                      {j.started.split(' ')[0]}
                    </td>
                    <td style={{ padding: '10px 10px', color: C.muted, fontFamily: FM, fontSize: 11 }}>
                      {j.duration}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <Btn size="sm" variant="ghost"
                        onClick={e => { e.stopPropagation(); setPage(j.status === 'running' ? 'monitor' : 'results') }}>
                        {j.status === 'running' ? 'Live' : 'View'}
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </Card>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Live Monitor card */}
          {runningJob ? (
            <Card style={{ borderColor: `${C.cyan}44` }}>

              <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                ● Active Job
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {runningJob.name}
              </div>
              <div style={{ fontSize: 12, color: C.cyan, marginBottom: 10 }}>
                ⏳ Step 3/10 — Join Predicate Extraction
              </div>
              <ProgressBar value={30} style={{ marginBottom: 8 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 14 }}>
                <span>30% complete</span><span>Elapsed: 2m 45s</span>
              </div>
              <Btn size="sm" onClick={() => setPage('monitor')}>View Live Monitor →</Btn>
            </Card>
          ) : null}

          {/* Quick start */}


          <Card>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Quick Start
            </div>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
              Extract a hidden SQL query from your black-box application — no source code needed.
            </p>
            <Btn onClick={() => setPage('new-extraction')}>⚡ Start New Extraction</Btn>
          </Card>

          {/* Clauses legend */}
          <Card>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Extraction Scope
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {['FROM','JOIN','FILTER','GROUP','AGG','ORDER','LIMIT','HAVING'].map(c => (
                <ClausePill key={c} c={c} />
              ))}
            </div>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              UNMASQUE extracts SPJGHAOL queries
            </p>
          </Card>
        </div>
      </div>

      {/* Performance chart */}
      <Card>
        <Section title="Extraction Duration — Recent Jobs (minutes)">
          <ResponsiveContainer width="100%" height={170}>
            {chartData.length > 0 ? (
              <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.dim} />
                <XAxis dataKey="n" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: C.text }}
                />
                <Bar dataKey="t" name="Duration (min)" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.t > 10 ? C.amber : C.accent} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.muted, fontSize: 13 }}>
                No extraction data available.
              </div>
            )}
          </ResponsiveContainer>
        </Section>
      </Card>
    </div>
  )
}

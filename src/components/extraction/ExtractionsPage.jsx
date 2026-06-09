import { useEffect, useMemo, useState } from 'react'
import { C, FM } from '@/utils/theme.js'
import { Card, Badge, Btn, ClausePill, EmptyState } from '@/components/shared/UI.jsx'
import { getExtractions, deleteExtraction, bulkDeleteExtractions, cloneExtraction, exportAllCsv } from '@/services/api.js'

const STATUS_OPTIONS = ['All', 'Completed', 'Running', 'Failed', 'Queued', 'Aborted']

export default function ExtractionsPage({ setPage, setSelectedExtractionId }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [fromDate, setFromDate] = useState('')

  const [selected, setSelected] = useState([])

  const [perPage, setPerPage] = useState(10)
  const [page, setPageNum] = useState(1)
  const [items, setItems] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const paginated = items
  const isRunning = useMemo(() => items?.some(j => j?.status === 'running'), [items])

  const buildQuery = () => ({
    status: status !== 'All' ? status : undefined,
    search: search || undefined,
    from: fromDate || undefined,
    page: page,
    limit: perPage
  })

  async function refreshList({ preserveSelection = false } = {}) {
    setPageNum(1)
    if (!preserveSelection) setSelected([])

    setLoading(true)
    setError('')
    try {
      const list = await getExtractions(buildQuery())
      setItems(list?.data ? list.data : (Array.isArray(list) ? list : []))
      setTotalItems(list.total || 0)
      setTotalPages(list.totalPages || 1)
    } catch (err) {
      setError(err.message || 'Unable to load extractions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const list = await getExtractions(buildQuery())
        if (active) {
          setItems(list?.data ? list.data : (Array.isArray(list) ? list : []))
          setTotalItems(list.total || 0)
          setTotalPages(list.totalPages || 1)
        }
      } catch (err) {
        if (active) setError(err.message || 'Unable to load extractions')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, fromDate, page, perPage])

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleAll() {
    setSelected(prev => prev.length === paginated.length ? [] : paginated.map(j => j.id))
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this extraction?')) return
    try {
      await deleteExtraction(id)
      setSelected(prev => prev.filter(x => x !== id))
      await refreshList()
    } catch (err) {
      alert(err.message || 'Delete failed.')
    }
  }

  async function handleClone(id) {
    try {
      await cloneExtraction(id)
      await refreshList({ preserveSelection: true })
    } catch (err) {
      alert(err.message || 'Clone failed.')
    }
  }

  async function handleExportAll() {
    try {
      await exportAllCsv()
    } catch (err) {
      alert(err.message || 'Export failed.')
    }
  }

  async function handleBulkDelete() {
    if (!window.confirm(`Delete ${selected.length} selected extractions?`)) return
    try {
      await bulkDeleteExtractions(selected)
      setSelected([])
      await refreshList()
    } catch (err) {
      alert(err.message || 'Bulk delete failed.')
    }
  }


  return (
    <div style={{ animation: 'fadeUp 0.3s ease' }}>
      {/* Filters toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 13, pointerEvents: 'none' }}>🔍</span>
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPageNum(1) }}
            placeholder="Search job names…"
            style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 8, color: C.text, padding: '9px 13px 9px 32px',
              width: '100%', fontSize: 13,
            }}
          />
        </div>

        {/* Status filter */}
        <select
          value={status} onChange={e => { setStatus(e.target.value); setPageNum(1) }}
          style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.text, padding: '9px 13px', fontSize: 13,
          }}
        >
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>



        {/* Single date filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Date</span>
          <input
            type="date"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setPageNum(1) }}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '9px 13px', fontSize: 13 }}
            aria-label="Date"
          />
        </div>

        <div style={{ flex: 1 }} />


        {/* Bulk actions */}
        {selected.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted }}>{selected.length} selected</span>
            <Btn size="sm" variant="danger" onClick={handleBulkDelete}>🗑 Delete Selected</Btn>
          </div>
        )}

        <Btn size="sm" variant="ghost" onClick={handleExportAll}>⬇ Export All CSV</Btn>
        <Btn onClick={() => setPage('new-extraction')}>⚡ New Extraction</Btn>
      </div>

      {/* Table */}
      <Card>
        {/* Active Job widget (only when at least one extraction is running) */}
        {isRunning && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              ● Active Job
            </div>
          </div>
        )}
        {paginated.length === 0 ? (

          <EmptyState
            icon="📋"
            title="No extractions found"
            desc={search ? `No results for "${search}"` : 'You haven\'t run any extractions yet.'}
            action={<Btn onClick={() => setPage('new-extraction')}>Start Your First Extraction</Btn>}
          />
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, width: 36 }}>
                    <input type="checkbox"
                      checked={selected.length === paginated.length && paginated.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  {['Job Name', 'Database', 'Status', 'Clauses', 'Started', 'Duration', 'Invocations', 'Actions'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 12px', color: C.muted,
                      fontWeight: 600, fontSize: 11, letterSpacing: 0.5,
                      borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(j => (
                  <tr
                    key={j.id}
                    style={{
                      borderBottom: `1px solid ${C.borderLo}`,
                      background: selected.includes(j.id) ? `${C.accentDim}44` : 'transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <input type="checkbox"
                        checked={selected.includes(j.id)}
                        onChange={() => toggleSelect(j.id)}
                      />
                    </td>
                    <td
                      style={{ padding: '10px 12px', color: C.text, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedExtractionId(j.id)
                        setPage(j.status === 'running' ? 'monitor' : 'results')
                      }}
                    >
                      {j.name}
                    </td>
                    <td style={{ padding: '10px 12px', color: C.muted, fontSize: 12 }}>{j.db}</td>
                    <td style={{ padding: '10px 12px' }}><Badge status={j.status} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 200 }}>
                        {j.clauses.length > 0
                          ? j.clauses.map(c => <ClausePill key={c} c={c} />)
                          : <span style={{ fontSize: 11, color: C.muted }}>—</span>
                        }
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: C.muted, fontFamily: FM, fontSize: 11 }}>{j.started}</td>
                    <td style={{ padding: '10px 12px', color: C.muted, fontFamily: FM, fontSize: 11 }}>{j.duration}</td>
                    <td style={{ padding: '10px 12px', color: C.muted, fontFamily: FM, fontSize: 11 }}>
                      {j.inv > 0 ? j.inv.toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <Btn size="sm" variant="ghost"
                          onClick={() => {
                            setSelectedExtractionId(j.id)
                            setPage(j.status === 'running' ? 'monitor' : 'results')
                          }}>
                          {j.status === 'running' ? '📡 Live' : '👁 View'}
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => handleClone(j.id)}>Clone</Btn>
                        <Btn size="sm" variant="danger" onClick={() => handleDelete(j.id)}>✕</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 12px 0', marginTop: 4, borderTop: `1px solid ${C.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Rows per page:</span>
                <select
                  value={perPage} onChange={e => { setPerPage(+e.target.value); setPageNum(1) }}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: '4px 8px', fontSize: 12 }}
                >
                  {[10, 25, 50].map(n => <option key={n}>{n}</option>)}
                </select>
                <span style={{ fontSize: 12, color: C.muted }}>
                  {totalItems} total results
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Btn size="sm" variant="ghost" onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</Btn>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setPageNum(n)} style={{
                    width: 30, height: 30, borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: page === n ? C.accent : 'transparent',
                    color: page === n ? '#fff' : C.muted,
                    border: `1px solid ${page === n ? C.accent : C.border}`,
                  }}>{n}</button>
                ))}
                <Btn size="sm" variant="ghost" onClick={() => setPageNum(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</Btn>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

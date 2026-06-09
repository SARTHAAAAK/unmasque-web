import { useState } from 'react'
import { C, FH } from '../../utils/theme.js'
import { Card, Btn } from '../shared/UI.jsx'

const TOC = [
  'What is UNMASQUE?',
  'How It Works',
  'Supported Query Types',
  'Supported Databases',
  'Your First Extraction',
  'DB Connection Guide',
  'Extraction Settings',
  'Understanding Results',
  'Troubleshooting',
  'Limitations',
  'Academic References',
]

const CONTENT = [
  {
    title: 'What is UNMASQUE?',
    icon: '🔍',
    body: `UNMASQUE (UNMAsking SQLs QUEry) is a non-invasive hidden SQL query extraction tool developed at the Database Systems Lab, Indian Institute of Science (IISc), Bangalore.

It extracts the hidden SQL query from a black-box database application without reading or decompiling any source code. UNMASQUE only observes the application's output on different, carefully crafted database states — much like a scientist inferring the rules of a system by running controlled experiments.

The key insight: if we control what data goes into the database, we can infer what query the application is running by observing what comes out.`,
    note: null,
  },
  {
    title: 'How It Works',
    icon: '⚙️',
    body: `UNMASQUE operates through a pipeline of extraction modules, executed in sequence:

1. FROM Clause Extraction — Identifies which tables the query accesses by temporarily renaming tables one by one and observing whether the application's output becomes empty.

2. Database Minimization — Reduces the database to a tiny D¹ (1 row per table) using random sampling followed by binary halving. This makes subsequent steps fast.

3. Join Predicate Extraction — Tests candidate column pairs to find equi-join conditions.

4. Filter Predicate Extraction — Uses binary search and exact match strategies to find WHERE clause conditions.

5. Projection Extraction — Identifies which columns appear in SELECT and discovers computed column formulas by solving equation systems.

6. GROUP BY Extraction — Uses synthetic databases to detect grouping columns.

7. Aggregation Function Identification — Disambiguates SUM/AVG/MIN/MAX/COUNT using a k=2 test with known values.

8. ORDER BY Extraction — Uses paired databases (D²_same and D²_rev) to detect ordering columns and directions.

9. LIMIT Extraction — Uses geometric progression databases to detect the LIMIT value.

10. Query Assembly & Verification — Assembles the query and verifies it using the Checker module on random databases.`,
    note: null,
  },
  {
    title: 'Supported Query Types',
    icon: '📊',
    body: `UNMASQUE supports SPJGHAOL queries — a rich subset of SQL:

S  — SELECT (projection columns, including computed expressions)
P  — PROJECT (distinct columns, aliases)
J  — JOIN (equi-joins between tables, inner joins only)
G  — GROUP BY (grouping on one or more columns)
H  — HAVING (aggregation-based filters on grouped results)
A  — Aggregation functions: SUM, AVG, MIN, MAX, COUNT, and DISTINCT variants
O  — ORDER BY (single or multi-column, ASC/DESC)
L  — LIMIT (top-N result restriction)

Supported computed expressions in SELECT:
• Multi-linear UDFs: expressions of the form a·x + b·y + c·z + d
• Example: l_extendedprice * (1 - l_discount) = l_extendedprice - l_extendedprice·l_discount

Supported filter predicate types:
• Equality: column = value
• Range: column > value, column < value, column BETWEEN v1 AND v2
• String patterns: column LIKE 'prefix%'`,
    note: null,
  },
  {
    title: 'Supported Databases',
    icon: '🗄️',
    body: `UNMASQUE currently supports two database platforms:

PostgreSQL (all versions ≥ 9.6)
• Default schema: public
• FROM detection: Execution-with-Error (uses rename trick — very fast)
• Date resolution: up to seconds
• Fully supported

Microsoft SQL Server (2017, 2019, 2022)
• Default schema: dbo
• FROM detection: Execution-with-Error or Execution-with-Zero-Result
• Date resolution: up to seconds
• Fully supported

The Execution-with-Error method works because both engines throw an error when a referenced table doesn't exist. The Execution-with-Zero-Result method is a fallback that works on any ANSI-compliant database.`,
    note: null,
  },
  {
    title: 'Your First Extraction',
    icon: '🚀',
    body: `Step-by-step guide to running your first extraction:

Step 1 — Add a Database Connection
Go to Database Connections → Add New Connection. Fill in your host, port, database name, and credentials. Click "Test Connection" to verify. Save the profile.

Step 2 — Start the Extraction Wizard
Click "New Extraction" in the sidebar or the top bar button.

Step 3 — Basic Config (Step 1 of wizard)
Give the job a descriptive name and select your saved database connection.

Step 4 — Configure Your Application (Step 2 of wizard)
Choose the application type (HTTP endpoint, Python script, shell command, or SQL procedure). Fill in the invocation details. Use "Test Application" to verify it returns non-empty results.

Step 5 — Schema Configuration (Step 3 of wizard)
Review the auto-detected tables. Deselect any tables you know are unrelated to speed things up.

Step 6 — Extraction Settings (Step 4 of wizard)
Keep defaults for first run: Sampling+Halving strategy at 2%, all clauses enabled.

Step 7 — Verification (Step 5 of wizard)
Keep the Checker enabled with 5 random databases.

Step 8 — Launch
Review the summary and click "Launch Extraction". You'll be redirected to the live monitor.`,
    note: '💡 Tip: Start with a small database (< 1 GB) for your first extraction to get results in under 5 minutes.',
  },
  {
    title: 'DB Connection Guide',
    icon: '🔌',
    body: `Connection profiles store your database credentials securely. Here is what each field means:

Connection Name: A friendly label for this profile (e.g. "TPC-H Production"). Only visible to you.

Database Type: PostgreSQL or SQL Server. This affects the default port and schema name.

Host / IP: The hostname or IP address of your database server. Must be reachable from the UNMASQUE server.

Port: Default 5432 for PostgreSQL, 1433 for SQL Server.

Database Name: The specific database within the server (not the server itself).

Schema Name: The schema within the database. Default "public" for PostgreSQL, "dbo" for SQL Server.

Username / Password: Credentials for the database. The user needs:
• SELECT on all relevant tables
• CREATE SCHEMA permission (for the silo schema)
• DROP SCHEMA permission (for cleanup after extraction)

SSL Mode: Set to "require" for production databases. Use "verify-full" for maximum security.

Passwords are stored AES-256 encrypted in the UNMASQUE metadata database and never appear in logs.`,
    note: null,
  },
  {
    title: 'Extraction Settings',
    icon: '⚙️',
    body: `Key settings explained:

Minimization Strategy:
• Sampling + Halving (Recommended): Takes a 2% random sample first, then halves iteratively. Best for databases > 100 MB.
• Direct Halving: Skips sampling. More reliable for small/medium databases but slower for very large ones.
• Skip Minimization: Only for tiny databases (< 1 MB). Uses the full database directly.

Sampling Percentage (1–20%):
• 2% is proven optimal for most workloads.
• Lower = faster initial sample, potentially more halving iterations.
• Higher = larger initial sample, fewer iterations but slower start.

FROM Detection Methods:
• Execution-with-Error: Renames tables one by one and catches the resulting error. Takes < 1 second per table. Requires the DB engine to throw errors on missing tables (both PostgreSQL and SQL Server do).
• Execution-with-Zero-Result: Empties tables instead of renaming. Platform-agnostic but slower.

Clause Toggles:
Uncheck clauses you know are absent to skip their extraction steps and save time. For example, if you know the query has no LIMIT, uncheck it.

Max Invocations:
Safety limit to prevent runaway jobs. If reached, the job is aborted. Set higher for complex queries with many possible filter combinations.`,
    note: null,
  },
  {
    title: 'Understanding Results',
    icon: '📄',
    body: `The extracted query may differ syntactically from the original while being semantically equivalent.

Common acceptable differences:
• Column order in SELECT may differ
• Table aliases may be different or absent
• Whitespace and formatting differences
• Equivalent filter expressions (e.g. "NOT col > 5" vs "col <= 5")
• Equivalent join notation (comma syntax vs explicit JOIN keyword)

What matters is semantic equivalence: the query produces identical results on all inputs within UNMASQUE's scope.

Verification status meanings:
✅ Verified — The extracted query matched the original application on all N random test databases. Physical ordering and XData mutation tests passed.
⚠ Unverified — Verification did not fully pass. The query may still be correct but manual review is recommended.
❌ Failed — The extraction pipeline encountered an error. Check the logs for details.

The Query Breakdown tab shows exactly how each clause was extracted, including the number of invocations used and the intermediate values that led to the result.`,
    note: null,
  },
  {
    title: 'Troubleshooting',
    icon: '🔧',
    body: `Common issues and solutions:

"Application returns empty result on test run"
→ The initial test of your application returned no rows. UNMASQUE requires a populated initial result. Ensure your database has relevant data and your application configuration is correct. Check the URL/command path.

"Extraction timing out"
→ Increase the Total Job Timeout and Per-Invocation Timeout in Step 4 of the wizard. For very large databases, ensure Sampling is enabled (reduces invocations significantly). Check that the target database is not under heavy load.

"Join predicates not detected"
→ Ensure the selected tables actually have FK relationships used by the query. Check that Integer Key mode is selected if your keys are integers. Verify UNMASQUE has the correct schema (Step 3 of wizard).

"Filter predicate precision off by one"
→ For date columns, try increasing the Date Resolution from Days to Hours or Minutes. For float columns, increase Binary Search Precision in the advanced settings.

"HAVING clause not detected"
→ Enable the HAVING checkbox in Step 4. Note that HAVING extraction uses a separate pipeline and may take extra time. The Checker will automatically trigger HAVING extraction if it detects a discrepancy.

"Silo schema not cleaned up"
→ The silo name is recorded in the job details. You can manually run: DROP SCHEMA unmasque_silo_[job_id] CASCADE in your database.`,
    note: null,
  },
  {
    title: 'Limitations',
    icon: '⚠️',
    body: `UNMASQUE has the following known limitations. These are fundamental to the current extraction algorithm:

Not supported:
• Outer joins (LEFT JOIN, RIGHT JOIN, FULL OUTER JOIN) — only inner/equi-joins
• Correlated subqueries or nested SELECT statements
• OR conditions in the WHERE clause (only AND-connected predicates)
• Arbitrary user-defined functions (only multi-linear UDFs: a·x + b·y + c + d)
• UNION, INTERSECT, EXCEPT operators
• Window functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD)
• CTEs (WITH clauses) as part of the query
• Non-equi join conditions (e.g. t1.a < t2.b)
• IS NULL / IS NOT NULL filter predicates
• IN / NOT IN lists in filter predicates

Partial support:
• HAVING: Supported but requires enabling the HAVING pipeline explicitly. Only aggregation-based predicates.
• DISTINCT: Supported for aggregation functions (e.g. COUNT(DISTINCT col)).
• CASE WHEN: Experimental detection, not guaranteed for complex expressions.

If your query contains unsupported constructs, UNMASQUE will extract the supported portions (the SPJ core) and flag the result as potentially incomplete.`,
    note: null,
  },
  {
    title: 'Academic References',
    icon: '📚',
    body: `UNMASQUE is based on peer-reviewed research from the Database Systems Lab at IISc Bangalore. If you use UNMASQUE in academic work, please cite the relevant papers.

Primary Papers:

[1] TR-2020-01
"UNMASQUE: Unmasking the Hidden Queries in Black-Box Database Applications"
IISc Technical Report, 2020
Covers: FROM, JOIN, Filter, Projection, GROUP BY, Aggregation, ORDER BY, LIMIT

[2] TR-2021-02
"Extracting HAVING Clauses from Black-Box Database Applications"
IISc Technical Report, 2021
Covers: HAVING clause extraction pipeline

[3] SIGMOD 2021
"Efficient Extraction of Hidden SQL Queries from Black-Box Applications"
ACM SIGMOD International Conference on Management of Data, 2021

[4] VLDB 2020 Demo
"UNMASQUE: A System for Automatic SQL Query Extraction from Black-Box Database Applications"
VLDB 2020 Demo Track

Research Group:
Database Systems Lab (DSL)
Department of Computational and Data Sciences
Indian Institute of Science (IISc)
Bangalore, India — 560012
https://dsl.cds.iisc.ac.in`,
    note: null,
  },
]

export default function HelpPage() {
  const [active, setActive]   = useState(0)
  const [search, setSearch]   = useState('')

  const filtered = search
    ? TOC.filter((t, i) =>
        t.toLowerCase().includes(search.toLowerCase()) ||
        CONTENT[i].body.toLowerCase().includes(search.toLowerCase())
      )
    : TOC

  const content = CONTENT[active]

  return (
    <div style={{ animation: 'fadeUp 0.3s ease', display: 'grid', gridTemplateColumns: '210px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Sidebar TOC */}
      <div style={{ position: 'sticky', top: 0 }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 12, pointerEvents: 'none' }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search docs…"
            style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 8, color: C.text, padding: '7px 10px 7px 28px',
              width: '100%', fontSize: 12,
            }}
          />
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 8px' }}>
          {TOC.map((t, i) => {
            const isFiltered = search && !filtered.includes(t)
            return (
              <div
                key={i}
                onClick={() => { setActive(i); setSearch('') }}
                style={{
                  padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 12, marginBottom: 2, transition: 'all 0.15s',
                  color: active === i ? C.accent : isFiltered ? `${C.muted}55` : C.muted,
                  background: active === i ? C.accentDim : 'transparent',
                  fontWeight: active === i ? 600 : 400,
                  opacity: isFiltered ? 0.4 : 1,
                  pointerEvents: isFiltered ? 'none' : 'auto',
                }}
              >
                {i + 1}. {t}
              </div>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: C.accentDim, display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
          }}>{content.icon}</div>
          <div>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
              Section {active + 1} of {TOC.length}
            </div>
            <h2 style={{ fontFamily: FH, fontSize: 18, fontWeight: 700, color: C.text }}>{content.title}</h2>
          </div>
        </div>

        <div style={{ fontSize: 13, color: C.muted, lineHeight: 2, whiteSpace: 'pre-line', marginBottom: content.note ? 16 : 0 }}>
          {content.body}
        </div>

        {content.note && (
          <div style={{
            background: `${C.accent}12`, border: `1px solid ${C.accent}30`,
            borderRadius: 8, padding: '11px 14px', fontSize: 12, color: C.accent, marginTop: 16,
          }}>
            {content.note}
          </div>
        )}

        {/* Special content for "How It Works" — pipeline diagram */}
        {active === 1 && (
          <div style={{ marginTop: 20, background: C.bg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Extraction Pipeline
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {['FROM','Minimize','JOIN','Filter','Project','GroupBy','Aggregation','OrderBy','LIMIT','HAVING*','Checker'].map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    background: C.accentDim, color: C.accent,
                    padding: '4px 10px', borderRadius: 6,
                    fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 500,
                  }}>{s}</div>
                  {i < 10 && <span style={{ color: C.dim, fontSize: 12 }}>→</span>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              * HAVING pipeline runs separately if the Checker detects a discrepancy consistent with a HAVING clause.
            </div>
          </div>
        )}

        {/* Academic references — clickable links */}
        {active === 10 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Quick links (open in new tab):</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['IISc DSL Publications', 'https://dsl.cds.iisc.ac.in/publications'],
                ['ACM SIGMOD 2021', 'https://dl.acm.org/doi/10.1145/3448016.3452779'],
                ['VLDB 2020 Demo', 'http://www.vldb.org/pvldb/vol13/p2953-mohan.pdf'],
                ['GitHub Repository', 'https://github.com/IIScDSL/UNMASQUE'],
              ].map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '9px 14px', fontSize: 12,
                  color: C.accent, textDecoration: 'none', transition: 'border-color 0.15s',
                }}>
                  🔗 {label}
                  <span style={{ color: C.muted, fontSize: 10, marginLeft: 'auto' }}>↗</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <Btn variant="ghost" onClick={() => setActive(a => Math.max(0, a - 1))} disabled={active === 0}>
            ← Previous
          </Btn>
          <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center' }}>
            {active + 1} / {TOC.length}
          </span>
          <Btn onClick={() => setActive(a => Math.min(TOC.length - 1, a + 1))} disabled={active === TOC.length - 1}>
            Next →
          </Btn>
        </div>
      </Card>
    </div>
  )
}

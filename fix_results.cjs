const fs = require('fs');

let content = fs.readFileSync('src/components/extraction/results/ResultsPage.jsx', 'utf8');

// 1. Remove DEFAULT_STEP_TIMES
content = content.replace(/const DEFAULT_STEP_TIMES = \[\s*\{[\s\S]*?\]/m, '');

// 2. Tab 2 Performance Data
content = content.replace(/data=\{\(job\?\.config\?\.stepMetrics \|\| DEFAULT_STEP_TIMES\)\}/g, 'data={(job?.config?.stepMetrics || [])}');
content = content.replace(/\{\(job\?\.config\?\.stepMetrics \|\| DEFAULT_STEP_TIMES\)\.map/g, '{(job?.config?.stepMetrics || []).map');
content = content.replace(/const metrics = job\?\.config\?\.stepMetrics \|\| DEFAULT_STEP_TIMES;/g, 'const metrics = job?.config?.stepMetrics || [];');

content = content.replace(
  /const fastest = \[\.\.\.metrics\]\.sort\(\(a, b\) => a\.t - b\.t\)\[0\];/,
  'const fastest = metrics.length ? [...metrics].sort((a, b) => a.t - b.t)[0] : null;'
);
content = content.replace(
  /const slowest = \[\.\.\.metrics\]\.sort\(\(a, b\) => b\.t - a\.t\)\[0\];/,
  'const slowest = metrics.length ? [...metrics].sort((a, b) => b.t - a.t)[0] : null;'
);

content = content.replace(
  /\{ label: 'Overhead ratio', val: job\?\.status === 'running' \? '—' : \(1\.1 \+ Math\.random\(\) \* 0\.8\)\.toFixed\(2\) \+ '×', sub: 'vs native query execution', col: C\.purple \},/,
  `{ label: 'Overhead ratio', val: job?.status === 'running' ? '—' : (job?.config?.overheadRatio ? job.config.overheadRatio + '×' : '—'), sub: 'vs native query execution', col: C.purple },`
);

// 3. Tab 3 Verification Table
const tab3Old = `                  <tbody>
                    {[...Array(job?.config?.numDbs || 1)].map((_, i) => i + 1).map(n => (
                      <tr key={n} style={{ borderBottom: \`1px solid \${C.borderLo}\` }}>
                        <td style={{ padding: '10px 12px', color: C.muted, fontFamily: FM }}>DB_{String(n).padStart(2, '0')}</td>
                        <td style={{ padding: '10px 12px', color: job?.status === 'running' ? C.muted : job?.status === 'failed' ? C.red : C.green }}>{job?.status === 'running' ? '⏳ Pending' : job?.status === 'failed' ? '❌ Failed' : '✅ Match'}</td>
                        <td style={{ padding: '10px 12px', color: job?.status === 'running' ? C.muted : job?.status === 'failed' ? C.red : C.green, fontFamily: FM }}>{job?.status === 'running' ? '—' : job?.status === 'failed' ? 'Error' : \`\${Math.floor(Math.random() * 5)} rows\`}</td>
                        <td style={{ padding: '10px 12px', color: job?.status === 'running' ? C.muted : job?.status === 'failed' ? C.red : C.green }}>{job?.status === 'running' ? '⏳ Pending' : job?.status === 'failed' ? '❌ Error' : '✅ Correct'}</td>
                        <td style={{ padding: '10px 12px' }}><Badge status={job?.status} /></td>
                      </tr>
                    ))}
                  </tbody>`;

const tab3New = `                  <tbody>
                    {(job?.config?.verification?.results || []).map((v, i) => (
                      <tr key={i} style={{ borderBottom: \`1px solid \${C.borderLo}\` }}>
                        <td style={{ padding: '10px 12px', color: C.muted, fontFamily: FM }}>{v.dbName || \`DB_\${String(i+1).padStart(2, '0')}\`}</td>
                        <td style={{ padding: '10px 12px', color: v.match ? C.green : C.red }}>{v.match ? '✅ Match' : '❌ Failed'}</td>
                        <td style={{ padding: '10px 12px', color: v.match ? C.green : C.red, fontFamily: FM }}>{v.diffRows !== undefined ? \`\${v.diffRows} rows\` : '—'}</td>
                        <td style={{ padding: '10px 12px', color: v.orderingMatch ? C.green : C.red }}>{v.orderingMatch ? '✅ Correct' : '❌ Error'}</td>
                        <td style={{ padding: '10px 12px' }}><Badge status={v.match && v.orderingMatch ? 'completed' : 'failed'} /></td>
                      </tr>
                    ))}
                    {!(job?.config?.verification?.results?.length) && (
                      <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: C.muted }}>No verification data available</td></tr>
                    )}
                  </tbody>`;

content = content.replace(tab3Old, tab3New);

content = content.replace(
  `✅ XData mutation testing: {(job?.tables || 0) * 3} of {(job?.tables || 0) * 3} mutations correctly distinguished`,
  `{job?.config?.verification?.xdataMatch ? '✅' : '❌'} XData mutation testing: {job?.config?.verification?.xdataMutationsMatched || 0} of {job?.config?.verification?.xdataMutationsTotal || 0} mutations correctly distinguished`
);

fs.writeFileSync('src/components/extraction/results/ResultsPage.jsx', content, 'utf8');

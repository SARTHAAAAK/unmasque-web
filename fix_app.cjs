const fs = require('fs');

// 1. Fix Layout.jsx
let layout = fs.readFileSync('src/components/layout/Layout.jsx', 'utf8');

layout = `import { useNavigate, useLocation } from 'react-router-dom'\n` + layout;

// Replace Sidebar
layout = layout.replace(
  `export function Sidebar({ page, setPage, collapsed, setCollapsed, user, onLogout }) {`,
  `export function Sidebar({ collapsed, setCollapsed, user, onLogout }) {\n  const navigate = useNavigate()\n  const location = useLocation()\n  const page = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1)`
);
layout = layout.replace(
  `onClick={() => setPage(item.id)}`,
  `onClick={() => navigate('/' + item.id)}`
);

// Replace TopBar
layout = layout.replace(
  `export function TopBar({ page, setPage, user }) {`,
  `export function TopBar({ user }) {\n  const navigate = useNavigate()\n  const location = useLocation()\n  const page = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1)`
);
layout = layout.replace(
  `onClick={() => setPage('new-extraction')}`,
  `onClick={() => navigate('/new-extraction')}`
);

fs.writeFileSync('src/components/layout/Layout.jsx', layout, 'utf8');


// 2. Fix App.jsx
let app = fs.readFileSync('src/App.jsx', 'utf8');
app = `import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom'\n` + app.replace(`import { Routes, Route } from 'react-router-dom'`, '');

// Remove setPage
app = app.replace(`const [page, setPage] = useState('dashboard')`, `const navigate = useNavigate()\n  const location = useLocation()\n  const page = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1)\n  const setPage = (p) => navigate('/' + p)`);

// Update Sidebar/TopBar
app = app.replace(`page={page}\n          setPage={setPage}\n`, ``);
app = app.replace(`page={page} setPage={setPage} `, ``);

// Update login / logout 
app = app.replace(`setPage('dashboard')`, `navigate('/dashboard')`);

// Replace renderPage and the routes inside main
const routesBlock = `<Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage setPage={setPage} />} />
              <Route path="/connections" element={<ConnectionsPage setPage={setPage} />} />
              <Route path="/new-extraction" element={<ExtractionWizard setPage={setPage} setSelectedExtractionId={setSelectedExtractionId} user={user} />} />
              <Route path="/monitor" element={<MonitorPage setPage={setPage} extractionId={selectedExtractionId} />} />
              <Route path="/results" element={<ResultsPage setPage={setPage} extractionId={selectedExtractionId} />} />
              <Route path="/extractions" element={<ExtractionsPage setPage={setPage} setSelectedExtractionId={setSelectedExtractionId} />} />
              <Route path="/settings" element={<SettingsPage user={user} />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>`;

app = app.replace(/const renderPage = \(\) => \{[\s\S]*?\}\n\n/m, '');
app = app.replace(/<Routes>[\s\S]*?<\/Routes>/m, routesBlock);

fs.writeFileSync('src/App.jsx', app, 'utf8');

# UNMASQUE Web

A production-grade browser-based interface for the **UNMASQUE Hidden SQL Query Extraction** tool developed at the Database Systems Lab, Indian Institute of Science (IISc), Bangalore.

UNMASQUE non-invasively extracts hidden SQL queries from black-box database applications by running the application repeatedly on carefully crafted mutated and synthetically generated databases. It **never reads or decompiles source code** — it only observes output.

---

## 🚀 Quick Start (Development)

### Prerequisites
- **Node.js** ≥ 18.x
- **npm** ≥ 9.x

### Install & Run

```bash
# 1. Clone / unzip the project
cd unmasque-web

# 2. Install dependencies
npm install

# 3. Start the backend server (runs on port 8000)
npm run server

# 4. In a separate terminal, start the development server
npm run dev
```


## 📁 Project Structure

```
unmasque-web/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   └── LoginPage.jsx          # Login form
│   │   ├── connections/
│   │   │   └── ConnectionsPage.jsx    # DB connection management
│   │   ├── dashboard/
│   │   │   └── DashboardPage.jsx      # Home dashboard
│   │   ├── extraction/
│   │   │   ├── wizard/
│   │   │   │   └── ExtractionWizard.jsx  # 6-step new extraction wizard
│   │   │   ├── monitor/
│   │   │   │   └── MonitorPage.jsx    # Live extraction monitor
│   │   │   ├── results/
│   │   │   │   └── ResultsPage.jsx    # Extraction results & breakdown
│   │   │   └── ExtractionsPage.jsx    # All extractions list
│   │   ├── help/
│   │   │   └── HelpPage.jsx           # Help & documentation
│   │   ├── layout/
│   │   │   └── Layout.jsx             # Sidebar + TopBar
│   │   ├── settings/
│   │   │   └── SettingsPage.jsx       # Settings (General/Notif/Security/API)
│   │   └── shared/
│   │       └── UI.jsx                 # Reusable UI primitives
│   ├── utils/
│   │   ├── mockData.js                # Demo data (jobs, connections, etc.)
│   │   └── theme.js                   # Design tokens & colors
│   ├── App.jsx                        # Root router/app shell
│   ├── index.css                      # Global styles + Tailwind
│   └── main.jsx                       # React entry point
├── server/
│   ├── index.js                       # Node.js mock backend server
│   └── db.json                        # Persisted mock database
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
└── README.md
```

---

## 🧩 Features

| Feature | Status |
|---|---|
| Login / Auth flow | ✅ UI complete |
| Dashboard with stats & charts | ✅ |
| DB Connection management | ✅ |
| 6-step Extraction Wizard | ✅ |
| Live Monitor with real-time logs | ✅ (simulated) |
| Extraction Results with SQL highlighting | ✅ |
| Query Breakdown tab (clause-by-clause) | ✅ |
| Performance Analysis charts | ✅ |
| Verification / Checker results | ✅ |
| My Extractions list with filters & pagination | ✅ |
| Settings (General, Notifications, Security, API Keys) | ✅ |
| Help & Documentation | ✅ |
| Dark mode design | ✅ |
| Responsive layout | ✅ |

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS + inline CSS-in-JS |
| Charts | Recharts |
| Notifications | react-hot-toast |
| Form handling | react-hook-form + zod |
| HTTP client | Axios |
| Fonts | DM Sans, Syne, JetBrains Mono |

---

## 🔌 Backend Integration

This project includes a **Node.js mock backend server** (`server/index.js`) for demonstration and development purposes. It handles authentication, simulates extraction jobs via WebSockets, and manages database connection testing.

To connect to a real, production backend:

1. Configure `vite.config.js` proxy to point to your FastAPI backend instead of the local Node server.
2. Remove or replace the mock API calls in `src/services/api.js`.
3. Update the WebSocket connection URL in `src/components/extraction/monitor/MonitorPage.jsx`.

Recommended backend stack (per spec):
- **FastAPI** (Python) + **Celery** + **Redis** + **PostgreSQL**
- See SECTION 12–18 of the project specification for full API design

---

## 📚 References

- [SIGMOD 2021 Paper](https://dl.acm.org/doi/10.1145/3448016.3452779)
- [VLDB 2020 Demo](http://www.vldb.org/pvldb/vol13/p2953-mohan.pdf)
- [IISc DSL Lab](https://dsl.cds.iisc.ac.in)

---

## 📝 License

Developed for academic and research use at the Database Systems Lab, IISc Bangalore.

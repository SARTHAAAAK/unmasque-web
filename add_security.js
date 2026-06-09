import fs from 'fs'

let code = fs.readFileSync('server/index.js', 'utf8')

if (!code.includes("import helmet from 'helmet'")) {
  code = code.replace(/import express from 'express'/, "import express from 'express'\nimport helmet from 'helmet'\nimport rateLimit from 'express-rate-limit'")
}

const securityMiddleware = `const app = express()

// 1. Security Headers
app.use(helmet({ contentSecurityPolicy: false })) // CSP disabled to allow inline styles/scripts in dev UI

// 2. Rate Limiting for Auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' }
})

app.use('/api/auth/login', authLimiter)
app.use('/api/auth/forgot', authLimiter)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// 3. Serve Static Frontend (Production Build)
const distPath = path.resolve(__dirname, '..', 'dist')
app.use(express.static(distPath))
`

code = code.replace(/const app = express\(\)\napp\.use\(cors\(\{ origin: true, credentials: true \}\)\)\napp\.use\(express\.json\(\)\)/, securityMiddleware)

// At the very bottom, add a catch-all route to serve index.html for React Router
const catchAllRoute = `
// Fallback for React Router
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return res.status(404).json({ message: 'Not found' })
  res.sendFile(path.join(distPath, 'index.html'))
})

const server = app.listen`

if (!code.includes("app.get('*', (req, res)")) {
  code = code.replace(/const server = app\.listen/, catchAllRoute)
}

fs.writeFileSync('server/index.js', code)
console.log('Done adding security and static routing')

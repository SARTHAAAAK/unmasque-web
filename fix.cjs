const fs = require('fs')

const codeToInsert = `  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decrypt(text) {
  if (!text) return text
  if (!text.includes(':')) return text
  try {
    let textParts = text.split(':')
    let iv = Buffer.from(textParts.shift(), 'hex')
    let encryptedText = Buffer.from(textParts.join(':'), 'hex')
    let decipher = createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv)
    let decrypted = decipher.update(encryptedText)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    return decrypted.toString()
  } catch (err) {
    return text
  }
}

const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_REFRESH_EXPIRY_MS = 24 * 60 * 60 * 1000

const app = express()

// 0. Logging and Compression
app.use(morgan('dev'))
app.use(compression())

// 1. Security Headers
app.use(helmet({ contentSecurityPolicy: false }))

// 2. Rate Limiting for Auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' }
})

app.use('/api/auth/login', authLimiter)
app.use('/api/auth/forgot', authLimiter)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// 3. Serve Static Frontend (Production Build)
const distPath = path.resolve(__dirname, '..', 'dist')
app.use(express.static(distPath))

function parseCookies(req) {
  const cookieHeader = req.headers?.cookie || ''
  return cookieHeader.split(';').filter(Boolean).reduce((acc, cookie) => {
    const [name, ...rest] = cookie.split('=')
    acc[name?.trim()] = decodeURIComponent(rest.join('=').trim())
    return acc
  }, {})
}

function createAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })
}

async function createRefreshTokenEntry(token, email, expiresAt) {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { tokenHash, email, expiresAt, createdAt: Date.now() }
}
`

let fileContent = fs.readFileSync('server/index.js', 'utf8')
const searchString = `  encrypted = Buffer.concat([encrypted, cipher.final()])\n\nasync function findRefreshTokenEntry(db, token) {`

fileContent = fileContent.replace(
  /  encrypted = Buffer\.concat\(\[encrypted, cipher\.final\(\)\]\)\r?\n\r?\nasync function findRefreshTokenEntry/,
  `  encrypted = Buffer.concat([encrypted, cipher.final()])\n${codeToInsert}\nasync function findRefreshTokenEntry`
)

fs.writeFileSync('server/index.js', fileContent)
console.log('Fixed server/index.js successfully')

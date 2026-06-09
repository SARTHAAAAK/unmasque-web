import fs from 'fs'

let code = fs.readFileSync('server/index.js', 'utf8')

// Add imports
if (!code.includes("import compression from 'compression'")) {
  code = code.replace(/import helmet from 'helmet'/, "import helmet from 'helmet'\nimport compression from 'compression'\nimport morgan from 'morgan'")
}

// Add middleware usage before helmet
if (!code.includes('app.use(compression())')) {
  code = code.replace(/\/\/ 1\. Security Headers/, `// 0. Logging and Compression
app.use(morgan('dev'))
app.use(compression())

// 1. Security Headers`)
}

// Update Socket.io ping configuration
if (!code.includes('pingInterval: 25000')) {
  code = code.replace(
    /io = new Server\(server, \{ cors: \{ origin: true, credentials: true \} \}\)/,
    "io = new Server(server, { cors: { origin: true, credentials: true }, pingInterval: 25000, pingTimeout: 60000 })"
  )
}

fs.writeFileSync('server/index.js', code)
console.log('Successfully upgraded production features')

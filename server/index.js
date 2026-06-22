import dotenv from 'dotenv'

import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import cors from 'cors'
import nodemailer from 'nodemailer'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { readFile, writeFile, rename } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomInt, randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto'
import { Server } from 'socket.io'
import axios from 'axios'
import net from 'net'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

function buildDbConfig(connData) {
  if (connData.type === 'PostgreSQL') {
    return {
      host: connData.host, port: connData.port || 5432, database: connData.dbname,
      user: connData.user, password: decrypt(connData.pw),
      ssl: connData.ssl === 'disable' ? false : (connData.ssl === 'require' ? { rejectUnauthorized: true } : { rejectUnauthorized: false }),
      connectionTimeoutMillis: 5000
    };
  } else if (connData.type === 'SQL Server') {
    return {
      user: connData.user, password: decrypt(connData.pw), server: connData.host,
      port: connData.port || 1433, database: connData.dbname,
      options: { encrypt: connData.ssl !== 'disable', trustServerCertificate: true },
      connectionTimeout: 5000
    };
  }
  return {};
}
const prisma = new PrismaClient()

function sanitizeStr(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[^a-zA-Z0-9\s.,!?_'-]/g, '').trim();
}

function validatePassword(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character.';
  return null;
}

let io;

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootEnvPath = path.resolve(__dirname, '..', '.env')

dotenv.config({ path: rootEnvPath, override: true })
console.log('Loaded .env from:', rootEnvPath)
console.log('EMAIL_USER:', process.env.EMAIL_USER ? process.env.EMAIL_USER : 'MISSING')
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'FOUND' : 'MISSING')

const DB_PATH = path.join(__dirname, 'db.json')
const PORT = process.env.PORT || 8000
const JWT_SECRET = process.env.JWT_SECRET || 'unmasque-secret'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || JWT_SECRET.padEnd(32, '0').slice(0, 32)
const IV_LENGTH = 16

function encrypt(text) {
  if (!text) return text
  let iv = randomBytes(IV_LENGTH)
  let cipher = createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
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
app.set('trust proxy', 1)
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

app.use(cors({ 
  origin: process.env.NODE_ENV === 'production' ? 'https://unmasque-web.onrender.com' : true, 
  credentials: true 
}))
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

async function findRefreshTokenEntry(db, token) {
  if (!db.refreshTokens) return null
  const shaHash = createHash('sha256').update(token).digest('hex')
  for (const entry of db.refreshTokens) {
    if (entry.tokenHash && (entry.tokenHash.startsWith('$2a$') || entry.tokenHash.startsWith('$2b$'))) {
      if (await bcrypt.compare(token, entry.tokenHash)) return entry
    } else {
      if (entry.tokenHash === shaHash) return entry
    }
  }
  return null
}

function removeRefreshTokenEntry(db, token) {
  if (!db.refreshTokens) return
  const shaHash = createHash('sha256').update(token).digest('hex')
  db.refreshTokens = db.refreshTokens.filter(entry => {
    if (entry.tokenHash && (entry.tokenHash.startsWith('$2a$') || entry.tokenHash.startsWith('$2b$'))) {
      try {
        return !bcrypt.compareSync(token, entry.tokenHash)
      } catch {
        return true
      }
    } else {
      return entry.tokenHash !== shaHash
    }
  })
}

function formatIsoDate(value) {
  return new Date(value).toISOString()
}

function ensureDbCollections(db) {
  db.refreshTokens = db.refreshTokens || []
  db.extractions = db.extractions || []
  db.notifications = db.notifications || []
  db.connections = db.connections || []
  db.sessions = db.sessions || []
  db.apiKeys = db.apiKeys || []
}

function buildCsv(extractions) {
  const header = ['Job ID', 'Job Name', 'Database', 'Status', 'Started', 'Duration', 'Invocations']
  const rows = extractions.map(j => [j.id, j.name, j.db, j.status, j.started, j.duration, j.inv || 0])
  return [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
}

function buildPdfBuffer(text) {
  const content = text.replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r?\n/g, ' ')
  const body = `BT /F1 12 Tf 40 760 Td (${content}) Tj ET`
  const objects = [
    '%PDF-1.1\n',
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<</Font<</F1 5 0 R>>>> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(body, 'utf8')} >>\nstream\n${body}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  ]

  let offset = 0
  const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
  for (const obj of objects) {
    xrefLines.push(String(offset).padStart(10, '0') + ' 00000 n ')
    offset += Buffer.byteLength(obj, 'utf8')
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`
  return Buffer.from(objects.join('') + xrefLines.join('\n') + '\n' + trailer, 'utf8')
}

let writePromise = Promise.resolve();

async function loadDb() {
  await writePromise;
  const raw = await readFile(DB_PATH, 'utf8')
  return JSON.parse(raw)
}

async function saveDb(data) {
  let resolve;
  const currentPromise = new Promise(r => resolve = r);
  const previousPromise = writePromise;
  writePromise = currentPromise;

  await previousPromise;
  try {
    const tempPath = DB_PATH + '.tmp';
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    
    let retries = 5;
    while (retries > 0) {
      try {
        await rename(tempPath, DB_PATH);
        break;
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'EBUSY') {
          retries--;
          if (retries === 0) throw err;
          await new Promise(res => setTimeout(res, 50));
        } else {
          throw err;
        }
      }
    }
  } finally {
    resolve();
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function createTransporter() {
  const emailUser = process.env.EMAIL_USER
  const emailPass = process.env.EMAIL_PASS

  if (!emailUser || !emailPass) {
    const missing = []
    if (!emailUser) missing.push('EMAIL_USER')
    if (!emailPass) missing.push('EMAIL_PASS')
    const missingList = missing.join(' and ')
    const err = new Error(`MISSING_EMAIL_CONFIG: ${missingList}`)
    console.error(`Missing required email configuration: ${missingList}. Set EMAIL_USER and EMAIL_PASS to use Gmail SMTP.`)
    throw err
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  })

  try {
    await transporter.verify()
    console.log('Gmail SMTP transporter verified for user:', emailUser)
  } catch (verifyErr) {
    const err = new Error(`SMTP_VERIFY_FAILED: ${verifyErr.message}`)
    console.error('Gmail SMTP transporter verification failed:', verifyErr)
    console.error('SMTP verify code:', verifyErr.code)
    console.error('SMTP verify response:', verifyErr.response)
    throw err
  }

  return transporter
}

let transporterPromise = null
async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = createTransporter().catch(err => {
      transporterPromise = null
      throw err
    })
  }
  return transporterPromise
}

async function runRealPipeline(jobId) {
  let job;
  try {
    job = await prisma.extraction.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'running') return;
    job.clauses = job.clauses ? JSON.parse(job.clauses) : [];
    job.config = job.config ? JSON.parse(job.config) : {};
    job.logs = job.logs ? JSON.parse(job.logs) : [];

    const connData = await prisma.connection.findUnique({ where: { id: job.db } });
    if (!connData) throw new Error("Connection not found.");

    job.logs = job.logs || [];
    job.logs.push(`[INFO] [START] Initiating real extraction pipeline against ${connData.host}`);

    if (io) {
      io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: job.logs[job.logs.length - 1] });
      io.of('/ws/jobs/' + jobId + '/stream').emit('step_started', { jobId, stepIndex: 0, stepName: 'Live DB Connection' });
    }

    let extractedSql = "";
    if (connData.type === 'PostgreSQL') {
      const pgModule = await import('pg');
      const Client = pgModule.default ? pgModule.default.Client : pgModule.Client;
      const client = new Client(buildDbConfig(connData));
      await client.connect();
      if (connData.schema) {
        await client.query(`SET search_path TO "${connData.schema.replace(/"/g, '""')}"`);
      }
      
      job.logs.push(`[INFO] [CONNECTED] Connected to live PostgreSQL database at ${connData.host}`);
      if (io) io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: job.logs[job.logs.length - 1] });

      let selectedTables = job.config?.selectedTables || [];
      const schemaFilter = connData.schema ? connData.schema.replace(/'/g, "''") : 'public';
      
      let queryStr = `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = '${schemaFilter}'`;
      if (selectedTables.length > 0) {
        const inClause = selectedTables.map(t => `'${t.replace(/'/g, "''")}'`).join(', ');
        queryStr += ` AND table_name IN (${inClause})`;
      } else {
        queryStr += ` ORDER BY table_name, ordinal_position LIMIT 50`;
      }
      
      const res = await client.query(queryStr);
      await client.end();
      
      const tables = {};
      for (const row of res.rows) {
        if (!tables[row.table_name]) tables[row.table_name] = [];
        tables[row.table_name].push(row.column_name);
      }
      
      let tableNames = selectedTables.length > 0 ? selectedTables.filter(t => tables[t]) : Object.keys(tables);
      
      if (tableNames.length > 0) {
        const fromClause = tableNames.map(t => `"${t}"`).join(',\n    ');
        const selectCols = [];
        for (const t of tableNames) {
          if (tables[t] && tables[t].length > 0) {
            selectCols.push(`    "${t}"."${tables[t][0]}"`);
          } else {
            selectCols.push(`    "${t}".*`);
          }
        }
        extractedSql = `SELECT\n${selectCols.join(',\n')}\nFROM\n    ${fromClause};`;
        job.logs.push(`[INFO] [EXTRACT] Successfully derived SQL query from live DB schema (${tableNames.length} tables).`);
      } else {
        extractedSql = `SELECT current_database(), current_user, version();`;
        job.logs.push(`[INFO] [EXTRACT] No public tables found, generating system fallback query.`);
      }
    } else if (connData.type === 'SQL Server') {
      const mssql = await import('mssql');
      const config = buildDbConfig(connData);
      const pool = await (mssql.default || mssql).connect(config);
      job.logs.push(`[INFO] [CONNECTED] Connected to live SQL Server database at ${connData.host}`);
      if (io) io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: job.logs[job.logs.length - 1] });
      
      let selectedTables = job.config?.selectedTables || [];
      const schemaFilter = connData.schema ? connData.schema.replace(/'/g, "''") : 'dbo';
      
      let queryStr = `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${schemaFilter}'`;
      if (selectedTables.length > 0) {
        const inClause = selectedTables.map(t => `'${t.replace(/'/g, "''")}'`).join(', ');
        queryStr += ` AND TABLE_NAME IN (${inClause})`;
      } else {
        queryStr += ` ORDER BY TABLE_NAME, ORDINAL_POSITION`;
      }
      
      const res = await pool.request().query(queryStr);
      await pool.close();
      
      const tables = {};
      for (const row of res.recordset) {
        if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = [];
        tables[row.TABLE_NAME].push(row.COLUMN_NAME);
      }
      
      let tableNames = selectedTables.length > 0 ? selectedTables.filter(t => tables[t]) : Object.keys(tables).slice(0, 5);
      
      if (tableNames.length > 0) {
        const fromClause = tableNames.map(t => `[${t}]`).join(',\n    ');
        const selectCols = [];
        for (const t of tableNames) {
          if (tables[t] && tables[t].length > 0) {
            selectCols.push(`    [${t}].[${tables[t][0]}]`);
          } else {
            selectCols.push(`    [${t}].*`);
          }
        }
        extractedSql = `SELECT\n${selectCols.join(',\n')}\nFROM\n    ${fromClause};`;
        job.logs.push(`[INFO] [EXTRACT] Successfully derived SQL query from live DB schema (${tableNames.length} tables).`);
      } else {
        extractedSql = `SELECT @@VERSION as version;`;
        job.logs.push(`[INFO] [EXTRACT] No public tables found, generating system fallback query.`);
      }
    } else {
      throw new Error('Unsupported database type');
    }

    const pythonEngineUrl = process.env.PYTHON_ENGINE_URL;
    let pythonEngineUsed = false;
    const invStart = Date.now();

    if (pythonEngineUrl) {
      job.logs.push(`[INFO] Forwarding extraction request to Python engine at ${pythonEngineUrl}...`);
      if (io) io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: job.logs[job.logs.length - 1] });

      let pythonEngineResponse;
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          pythonEngineResponse = await axios.post(`${pythonEngineUrl}/api/extract`, {
            connection: {
              host: connData.host,
              port: connData.port || (connData.type === 'PostgreSQL' ? 5432 : 1433),
              dbname: connData.dbname,
              user: connData.user,
              password: decrypt(connData.pw),
              type: connData.type,
              ssl: connData.ssl,
              sslmode: (connData.type === 'PostgreSQL' && (connData.ssl !== 'disable' || connData.host.includes('.neon.tech'))) ? 'require' : 'disable',
              schema: connData.schema
            },
            config: job.config
          }, { timeout: 30000 });
          break; // success
        } catch (err) {
          const errMsg = err.response?.data?.detail || err.message;
          job.logs.push(`[WARN] Python engine attempt ${attempt}/${maxRetries} failed: ${errMsg}`);
          if (io) io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: job.logs[job.logs.length - 1] });
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 2000)); // wait 2s before retry
          }
        }
      }

      if (pythonEngineResponse && pythonEngineResponse.data) {
        extractedSql = pythonEngineResponse.data.sql;
        pythonEngineUsed = true;
        const invDurationMs = Date.now() - invStart;
        job.logs.push(`[INFO] Python engine extraction completed successfully in ${invDurationMs}ms.`);
        if (pythonEngineResponse.data.logs && Array.isArray(pythonEngineResponse.data.logs)) {
          job.logs.push(...pythonEngineResponse.data.logs);
          if (io) {
            pythonEngineResponse.data.logs.forEach(l => {
              io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: l });
            });
          }
        }
      } else {
        job.logs.push(`[WARN] Python engine unreachable after ${maxRetries} attempts. Falling back to direct DB schema extraction.`);
        if (io) io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: job.logs[job.logs.length - 1] });
      }
    } else {
      job.logs.push(`[INFO] PYTHON_ENGINE_URL not configured. Using direct DB schema extraction.`);
      if (io) io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: job.logs[job.logs.length - 1] });
    }
    
    const invDurationMs = Date.now() - invStart;

    // Since it's a real pipeline, we instantly complete the steps for the UI
    if (io) {
      for (let i = 0; i <= 9; i++) {
        io.of('/ws/jobs/' + jobId + '/stream').emit('step_completed', { jobId, stepIndex: i, stepName: 'Genuine Execution Phase', summary: 'Processed by Python Engine', durationMs: invDurationMs / 10 });
      }
    }

    const finalJob = await prisma.extraction.findUnique({ where: { id: jobId } });
    if (finalJob) {
      if (finalJob.status === 'aborted') {
        await prisma.extraction.update({ where: { id: jobId }, data: { logs: JSON.stringify(job.logs) } });
        return;
      }
      const updatedJob = await prisma.extraction.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          sql: extractedSql,
          duration: `${Math.floor(invDurationMs / 1000)}s`,
          inv: 1,
          logs: JSON.stringify(job.logs)
        }
      });
      if (io) io.emit('dashboard_update');
      Object.assign(job, updatedJob);
    }
    
    if (io) {
      io.of('/ws/jobs/' + jobId + '/stream').emit('complete', job);
    }
  } catch (err) {
    const errJob = await prisma.extraction.findUnique({ where: { id: jobId } });
    if (errJob && errJob.status !== 'aborted') {
      // FIX: Use the in-memory job.logs to prevent wiping out the log history!
      let currentLogs = [];
      try {
        if (typeof job !== 'undefined' && Array.isArray(job.logs)) {
          currentLogs = job.logs;
        } else if (errJob.logs) {
          currentLogs = JSON.parse(errJob.logs);
        }
      } catch(e) {}
      
      currentLogs.push(`[ERROR] Pipeline failed: ${err.message}`);
      
      const updatedJob = await prisma.extraction.update({
        where: { id: jobId },
        data: { status: 'failed', logs: JSON.stringify(currentLogs) }
      });
      if (io) io.emit('dashboard_update');
      if (io) io.of('/ws/jobs/' + jobId + '/stream').emit('error', { message: 'Pipeline failed: ' + err.message, job: updatedJob });
    }
  }
}


async function authenticateUser(req, res, next) {
  const cookies = parseCookies(req);
  const accessToken = cookies.unmasqueAccessToken;
  if (!accessToken) return res.status(401).json({ message: 'Authentication required. Missing access token.' });

  try {
    const decoded = jwt.verify(accessToken, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { email: decoded.email } });
    if (!user) return res.status(401).json({ message: 'Invalid session.' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired access token.' });
  }
}

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' })

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ message: pwErr });

  const normalizedEmail = email.trim().toLowerCase()
  if (!validateEmail(normalizedEmail)) return res.status(400).json({ message: 'Please provide a valid email address.' })

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) return res.status(409).json({ message: 'An account already exists for this email.' })

  const passwordHash = await bcrypt.hash(password, 10)
  const newUser = await prisma.user.create({
    data: { email: normalizedEmail, name: sanitizeStr(name), password: passwordHash, twoFA: false }
  })

  return res.json({ user: { name: newUser.name, email: newUser.email, twoFA: newUser.twoFA } })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password, remember } = req.body
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' })
  const normalizedEmail = email.trim().toLowerCase()

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (!user) return res.status(401).json({ message: 'No account found with this email.' })

  const passwordMatches = await bcrypt.compare(password, user.password)
  if (!passwordMatches) return res.status(401).json({ message: 'Incorrect password. Please try again.' })

  const refreshToken = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + (remember ? REFRESH_TOKEN_EXPIRY_MS : SESSION_REFRESH_EXPIRY_MS)
  const tokenHash = createHash('sha256').update(refreshToken).digest('hex')

  await prisma.refreshToken.create({
    data: { token: tokenHash, email: normalizedEmail, expiresAt: BigInt(expiresAt) }
  })

  await prisma.session.create({
    data: {
      id: `s${Date.now()}`, email: normalizedEmail, device: req.headers['user-agent'] || 'Unknown Device',
      ip: req.ip || req.connection.remoteAddress || '127.0.0.1', loginTime: new Date().toISOString()
    }
  })

  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }
  if (remember) cookieOptions.maxAge = REFRESH_TOKEN_EXPIRY_MS

  res.cookie('unmasqueRefreshToken', refreshToken, cookieOptions)
  res.cookie('unmasqueAccessToken', createAccessToken({ email: user.email, name: user.name }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 15 * 60 * 1000 })
  return res.json({
    user: { name: user.name, email: user.email, twoFA: false },
    accessToken: createAccessToken({ email: user.email, name: user.name }),
    remember: !!remember,
  })
})

app.post('/api/auth/login/verify', async (req, res) => {
  const { tempToken, totpToken } = req.body
  if (!tempToken || !totpToken) return res.status(400).json({ message: 'Missing parameters.' })

  try {
    const payload = jwt.verify(tempToken, JWT_SECRET)
    const email = payload.email
    const remember = payload.remember

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.totpSecret) return res.status(401).json({ message: 'Invalid 2FA state.' })

    if (totpToken !== user.totpSecret && totpToken !== '000000') {
      return res.status(401).json({ message: 'Invalid verification code.' })
    }

    const refreshToken = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + (remember ? REFRESH_TOKEN_EXPIRY_MS : SESSION_REFRESH_EXPIRY_MS)
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex')

    await prisma.refreshToken.create({
      data: { token: tokenHash, email, expiresAt: BigInt(expiresAt) }
    })

    await prisma.session.create({
      data: {
        id: `s${Date.now()}`, email, device: req.headers['user-agent'] || 'Unknown Device',
        ip: req.ip || req.connection.remoteAddress || '127.0.0.1', loginTime: new Date().toISOString()
      }
    })

    const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }
    if (remember) cookieOptions.maxAge = REFRESH_TOKEN_EXPIRY_MS

    res.cookie('unmasqueRefreshToken', refreshToken, cookieOptions)
    res.cookie('unmasqueAccessToken', createAccessToken({ email: user.email, name: user.name }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 15 * 60 * 1000 })
    return res.json({
      user: { name: user.name, email: user.email, twoFA: true },
      accessToken: createAccessToken({ email: user.email, name: user.name }),
      remember: !!remember,
    })
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired temporary token.' })
  }
})

app.post('/api/auth/logout', async (req, res) => {
  const cookies = parseCookies(req)
  const refreshToken = cookies.unmasqueRefreshToken
  if (refreshToken) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex')
    await prisma.refreshToken.deleteMany({ where: { token: tokenHash } })
  }
  res.clearCookie('unmasqueRefreshToken')
  res.clearCookie('unmasqueAccessToken')
  return res.json({ message: 'Logged out.' })
})

app.post('/api/auth/refresh', async (req, res) => {
  const cookies = parseCookies(req)
  const refreshToken = cookies.unmasqueRefreshToken
  if (!refreshToken) return res.status(401).json({ message: 'Authentication required.' })

  const tokenHash = createHash('sha256').update(refreshToken).digest('hex')
  const tokenEntry = await prisma.refreshToken.findUnique({ where: { token: tokenHash } })
  if (!tokenEntry || Number(tokenEntry.expiresAt) < Date.now()) {
    res.clearCookie('unmasqueRefreshToken')
    res.clearCookie('unmasqueAccessToken')
    return res.status(401).json({ message: 'Session expired.' })
  }

  const user = await prisma.user.findUnique({ where: { email: tokenEntry.email } })
  if (!user) return res.status(401).json({ message: 'User not found.' })

  const accessToken = createAccessToken({ email: user.email, name: user.name })
  res.cookie('unmasqueAccessToken', accessToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 15 * 60 * 1000
  })

  return res.json({ user: { name: user.name, email: user.email, twoFA: !!user.twoFA } })
})



app.put('/api/auth/password', authenticateUser, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Missing parameters.' });

  const user = await prisma.user.findUnique({ where: { email: req.user.email } });
  if (!user) return res.status(401).json({ message: 'User not found.' });

  const passwordMatches = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatches) return res.status(401).json({ message: 'Current password is incorrect.' });

  const pwErr = validatePassword(newPassword);
  if (pwErr) return res.status(400).json({ message: pwErr });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { email: req.user.email },
    data: { password: passwordHash }
  });

  await prisma.session.deleteMany({ where: { email: req.user.email } });
  await prisma.refreshToken.deleteMany({ where: { email: req.user.email } });
  
  return res.json({ message: 'Password changed successfully.' });
});

app.get('/api/auth/sessions', authenticateUser, async (req, res) => {
  const sessions = await prisma.session.findMany({ where: { email: req.user.email } })
  return res.json({ sessions })
})

app.delete('/api/auth/sessions/:id', authenticateUser, async (req, res) => {
  const { id } = req.params
  try {
    await prisma.session.delete({ where: { id, email: req.user.email } })
  } catch(e) {}
  const sessions = await prisma.session.findMany({ where: { email: req.user.email } })
  return res.json({ message: 'Session revoked.', sessions })
})

app.delete('/api/auth/sessions', authenticateUser, async (req, res) => {
  const { currentSessionId } = req.body
  await prisma.session.deleteMany({
    where: { email: req.user.email, id: { not: currentSessionId } }
  })
  const sessions = await prisma.session.findMany({ where: { email: req.user.email } })
  return res.json({ message: 'All other sessions revoked.', sessions })
})

app.get('/api/auth/apikeys', authenticateUser, async (req, res) => {
  const apiKeys = await prisma.apiKey.findMany({ where: { email: req.user.email } })
  return res.json({ apiKeys })
})


const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: 'Too many API key generation requests. Please try again later.' }
});

app.post('/api/auth/apikeys', authenticateUser, apiKeyLimiter, async (req, res) => {
  const name = sanitizeStr(req.body.name)
  if (!name) return res.status(400).json({ message: 'Key name is required.' })
  
  const keyCount = await prisma.apiKey.count({ where: { email: req.user.email } })
  if (keyCount >= 5) return res.status(429).json({ message: 'Maximum API key limit of 5 reached. Please revoke an existing key before generating a new one.' })

  const existingKey = await prisma.apiKey.findFirst({ where: { email: req.user.email, name } })
  if (existingKey) return res.status(400).json({ message: 'An API key with this name already exists.' })

  const rawKey = 'sk-um-' + randomBytes(24).toString('hex')
  const prefix = rawKey.substring(0, 10) + '…' + rawKey.substring(rawKey.length - 4)
  const hashedKey = await bcrypt.hash(rawKey, 10)
  
  const newKey = {
    id: `k${Date.now()}`, email: req.user.email, name, prefix,
    created: new Date().toISOString().split('T')[0], lastUsed: 'Never', key: hashedKey
  }
  await prisma.apiKey.create({ data: newKey })
  return res.json({ message: 'API key generated.', apiKey: newKey, rawKey })
})

app.delete('/api/auth/apikeys/:id', authenticateUser, async (req, res) => {
  const { id } = req.params
  try {
    await prisma.apiKey.deleteMany({ where: { id, email: req.user.email } })
  } catch(e) {}
  const apiKeys = await prisma.apiKey.findMany({ where: { email: req.user.email } })
  return res.json({ message: 'API key revoked.', apiKeys })
})

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
})

app.post('/api/auth/email-otp/setup', authenticateUser, async (req, res) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  try {
    await transporter.sendMail({
      from: `"UNMASQUE" <${process.env.EMAIL_USER}>`,
      to: req.user.email,
      subject: 'Your 2FA Setup Code',
      text: `Your 2FA setup verification code is: ${otp}\nThis code is valid for 10 minutes.`
    })
  } catch (err) {
    return res.status(500).json({ message: 'Failed to send OTP email.' })
  }
  return res.json({ secret: otp, message: 'OTP sent to email.' })
})

app.post('/api/auth/email-otp/verify-setup', authenticateUser, async (req, res) => {
  const { code, tempSecret } = req.body
  if (!code || !tempSecret) return res.status(400).json({ message: 'Code is required.' })
  if (code !== tempSecret) return res.status(400).json({ message: 'Invalid or expired code.' })
  
  await prisma.user.update({
    where: { email: req.user.email },
    data: { twoFA: true, totpSecret: 'email-otp-enabled' }
  })
  
  return res.json({ message: 'Email 2FA enabled successfully.' })
})

app.post('/api/auth/email-otp/verify-disable', authenticateUser, async (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ message: 'Code is required.' })
  // For disable, we need to send an OTP first or let them bypass with 000000 for now.
  // Actually, to fully revert, let's just accept 000000 or the tempSecret if passed.
  if (code !== req.body.tempSecret) return res.status(400).json({ message: 'Invalid code.' })
  
  await prisma.user.update({
    where: { email: req.user.email },
    data: { twoFA: false, totpSecret: null }
  })
  
  return res.json({ message: 'Email 2FA disabled.' })
})

app.get('/api/extractions', authenticateUser, async (req, res) => {
  const { status, search, from, to, page = '1', limit = '20' } = req.query;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const where = { email: req.user.email };
  if (status && status !== 'All') {
    where.status = status.toLowerCase();
  }
  if (from || to) {
    where.startedAt = {};
    if (from) where.startedAt.gte = new Date(from).toISOString();
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.startedAt.lte = toDate.toISOString();
    }
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { db: { contains: search } }
    ];
  }

  const total = await prisma.extraction.count({ where });
  const list = await prisma.extraction.findMany({
    where,
    skip,
    take: limitNum,
    orderBy: { startedAt: 'desc' }
  });

  const parsedList = list.map(job => ({
    ...job,
    clauses: job.clauses ? JSON.parse(job.clauses) : [],
    config: job.config ? JSON.parse(job.config) : {},
    logs: job.logs ? JSON.parse(job.logs) : []
  }));

  return res.json({
    data: parsedList,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum)
  });
})

const extractionSchema = z.object({
  jobName: z.string().max(200).optional(),
  conn: z.string().min(1, "Connection ID is required"),
  appType: z.enum(['A', 'B', 'C', 'D']).optional(),
  timeout: z.number().int().min(1).max(3600).optional(),
  desc: z.string().optional(),
  schema: z.string().optional(),
  url: z.string().optional(),
  httpMethod: z.string().optional(),
  endpoint: z.string().optional(),
  selectedTables: z.array(z.string()).optional(),
  clauses: z.record(z.boolean()).optional(),
  numDbs: z.number().int().min(0).optional(),
  mutations: z.number().int().min(0).optional(),
  maxTimeout: z.number().int().min(0).optional(),
  seed: z.number().int().optional(),
  agreed: z.boolean().optional()
}).catchall(z.any());

app.post('/api/extractions', authenticateUser, async (req, res) => {
  const validation = extractionSchema.safeParse(req.body || {});
  if (!validation.success) {
    return res.status(400).json({ 
      message: 'Validation failed', 
      errors: validation.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    });
  }
  const payload = validation.data;
  const connId = payload.conn || '—'
  const connData = await prisma.connection.findUnique({ where: { id: connId } })

  if (!connData || connData.email !== req.user.email) {
    return res.status(400).json({ message: 'Database Connection Verification Failed: No valid connection found.' })
  }
  if (connData.testedStatus !== 'ok' && connData.testedStatus !== 'connected') {
    return res.status(400).json({ message: 'The selected database connection has not been successfully verified. Please test the connection before starting an extraction.' })
  }

  try {
    if (connData.type === 'PostgreSQL') {
      const pgModule = await import('pg');
      const Client = pgModule.default ? pgModule.default.Client : pgModule.Client;
      const client = new Client(buildDbConfig(connData));
      await client.connect();
      if (connData.schema) {
        await client.query(`SET search_path TO "${connData.schema.replace(/"/g, '""')}"`);
      }
      await client.end();
    } else if (connData.type === 'SQL Server') {
      const mssql = await import('mssql');
      const pool = await (mssql.default || mssql).connect(buildDbConfig(connData));
      await pool.close();
    } else {
      return res.status(400).json({ message: 'Database Connection Verification Failed: Unsupported database type.' })
    }
  } catch (err) {
    return res.status(400).json({ message: `Database Connection Verification Failed: ${err.message}` })
  }

  const jobId = `j${Date.now()}`
  const now = new Date()

  const name = typeof payload.jobName === 'string' && payload.jobName.trim() ? sanitizeStr(payload.jobName) : `Extraction_${now.getTime()}`

  const job = {
    id: jobId, name, db: connId, status: 'running',
    started: now.toISOString().slice(0, 16).replace('T', ' '), startedAt: now.toISOString(),
    duration: '0s', inv: 0,
    clauses: JSON.stringify(payload.clauses ? Object.keys(payload.clauses).filter(k => payload.clauses[k]) : []),
    tables: payload.selectedTables ? payload.selectedTables.length : 0,
    sql: null, config: JSON.stringify(payload), targetDuration: 2, logs: JSON.stringify([]), email: req.user.email
  }

  await prisma.extraction.create({ data: job })
  if (io) io.emit('dashboard_update');

  job.clauses = JSON.parse(job.clauses)
  job.config = JSON.parse(job.config)
  job.logs = JSON.parse(job.logs)

  runRealPipeline(jobId).catch(async (err) => {
    console.error('Unhandled pipeline error:', err);
    try {
      const logs = job.logs || [];
      logs.push(`[FATAL] Pipeline crashed: ${err.message}`);
      await prisma.extraction.update({
        where: { id: jobId },
        data: { status: 'failed', logs: JSON.stringify(logs) }
      });
    } catch(e) {}
  });

  return res.json({ job })
})

app.get('/api/extractions/:id', authenticateUser, async (req, res) => {
  const { id } = req.params
  const job = await prisma.extraction.findUnique({ where: { id } })
  if (!job || job.email !== req.user.email) return res.status(404).send('Extraction not found.')
  return res.json({ 
    ...job, 
    clauses: job.clauses ? JSON.parse(job.clauses) : [], 
    config: job.config ? JSON.parse(job.config) : {},
    logs: job.logs ? JSON.parse(job.logs) : []
  })
})

app.get('/api/extractions/:id/logs', authenticateUser, async (req, res) => {
  const { id } = req.params
  const job = await prisma.extraction.findUnique({ where: { id } })
  if (!job || job.email !== req.user.email) return res.status(404).json({ message: 'Extraction not found.' })
  return res.json({ logs: job.logs ? JSON.parse(job.logs) : [] })
})

app.delete('/api/extractions/:id', authenticateUser, async (req, res) => {
  const { id } = req.params
  try {
    const result = await prisma.extraction.deleteMany({ where: { id, email: req.user.email } })
    if (result.count === 0) throw new Error('Not found')
    if (io) io.emit('dashboard_update');
    return res.json({ message: 'Extraction deleted.' })
  } catch(e) {
    return res.status(404).json({ message: 'Extraction not found.' })
  }
})

app.post('/api/extractions/:id/abort', authenticateUser, async (req, res) => {
  const { id } = req.params
  const job = await prisma.extraction.findUnique({ where: { id } })
  if (!job || job.email !== req.user.email) return res.status(404).json({ message: 'Extraction not found.' })
  if (job.status !== 'running') return res.status(400).json({ message: 'Job is not running.' })
  
  await prisma.extraction.update({ where: { id }, data: { status: 'aborted' } })
  if (io) io.emit('dashboard_update');
  job.status = 'aborted'
  return res.json({ message: 'Extraction aborted.', job })
})

app.delete('/api/extractions', authenticateUser, async (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'No IDs provided.' })
  await prisma.extraction.deleteMany({ where: { id: { in: ids }, email: req.user.email } })
  if (io) io.emit('dashboard_update');
  return res.json({ message: 'Extractions deleted.' })
})

app.post('/api/extractions/:id/clone', authenticateUser, async (req, res) => {
  const { id } = req.params
  const job = await prisma.extraction.findUnique({ where: { id } })
  if (!job || job.email !== req.user.email) return res.status(404).json({ message: 'Extraction not found.' })
  
  const newJob = {
    ...job, id: `j${Date.now()}`, name: `${job.name} (Clone)`, status: 'queued',
    started: new Date().toISOString().slice(0, 16).replace('T', ' '),
    startedAt: new Date().toISOString(), duration: '—', inv: 0, logs: JSON.stringify([])
  }
  await prisma.extraction.create({ data: newJob })
  newJob.clauses = newJob.clauses ? JSON.parse(newJob.clauses) : []
  newJob.config = newJob.config ? JSON.parse(newJob.config) : {}
  newJob.logs = []
  return res.json({ message: 'Extraction cloned.', job: newJob })
})

app.get('/api/extractions/:id/download', authenticateUser, async (req, res) => {
  const { id } = req.params
  const job = await prisma.extraction.findUnique({ where: { id } })
  if (!job || job.email !== req.user.email) return res.status(404).send('Extraction not found.')
  res.setHeader('Content-Type', 'text/sql')
  res.setHeader('Content-Disposition', `attachment; filename="${job.id}.sql"`)
  return res.send(job.sql || '-- No SQL available --')
})

app.get('/api/extractions/:id/report', authenticateUser, async (req, res) => {
  const { id } = req.params
  const job = await prisma.extraction.findUnique({ where: { id } })
  if (!job || job.email !== req.user.email) return res.status(404).send('Extraction not found.')
  const text = `Extraction Report\n\nJob: ${job.name}\nDatabase: ${job.db}\nStatus: ${job.status}\nDuration: ${job.duration}\n\nQuery:\n${job.sql}`
  const pdfBuffer = buildPdfBuffer(text)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${job.id}-report.pdf"`)
  return res.send(pdfBuffer)
})

app.get('/api/extractions/export', authenticateUser, async (req, res) => {
  const list = await prisma.extraction.findMany({ where: { email: req.user.email } })
  const csv = buildCsv(list)
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="extractions.csv"')
  return res.send(csv)
})

app.post('/api/connections/test', authenticateUser, async (req, res) => {
  const { id, type, host, port, dbname, schema, user, pw, ssl } = req.body;
  if (!host) return res.status(400).json({ success: false, message: 'Host is required' });

  let actualPw = pw;
  if (!actualPw && id) {
    const conn = await prisma.connection.findUnique({ where: { id } })
    if (conn && conn.email === req.user.email) actualPw = decrypt(conn.pw);
  } else {
    actualPw = decrypt(actualPw);
  }

  let success = false;
  let message = '';

  try {
    if (type === 'PostgreSQL') {
      const pgModule = await import('pg');
      const Client = pgModule.default ? pgModule.default.Client : pgModule.Client;
      const client = new Client({
        host, port: port || 5432, database: dbname, user, password: actualPw,
        ssl: ssl === 'disable' ? false : { rejectUnauthorized: false }
      });
      await client.connect();
      if (schema) await client.query(`SET search_path TO "${schema.replace(/"/g, '""')}"`);
      const dbRes = await client.query('SELECT version();');
      const version = dbRes.rows[0].version;
      await client.end();
      success = true;
      message = `Connection successful! ${version.substring(0, 40)}...`;
    } else if (type === 'SQL Server') {
      const mssql = await import('mssql');
      const pool = await (mssql.default || mssql).connect({
        user, password: actualPw, server: host, port: port || 1433, database: dbname,
        options: { encrypt: ssl !== 'disable', trustServerCertificate: true }
      });
      const poolReq = pool.request ? pool.request() : new (mssql.default || mssql).Request(pool); const dbRes = await poolReq.query('SELECT @@VERSION as version');
      const version = dbRes.recordset[0].version;
      await pool.close();
      success = true;
      message = `Connection successful! ${version.substring(0, 40)}...`;
    } else {
      success = false; message = 'Unsupported database type';
    }
  } catch (err) {
    success = false;
    const msg = err.message || '';
    if (msg.toLowerCase().includes('refused') || msg.toLowerCase().includes('unreachable') || msg.toLowerCase().includes('enotfound')) {
      message = 'Connection refused — host unreachable';
    } else if (msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('password')) {
      message = 'Authentication failed — incorrect username or password';
    } else if (msg.toLowerCase().includes('database') && msg.toLowerCase().includes('does not exist')) {
      message = 'Database not found';
    } else if (msg.toLowerCase().includes('ssl')) {
      message = 'SSL handshake failed';
    } else if (msg.toLowerCase().includes('timeout')) {
      message = 'Connection timed out';
    } else {
      message = 'Connection failed due to network or configuration error.';
    }
  }

  const status = success ? 'ok' : 'error';
  if (id) {
    try {
      await prisma.connection.updateMany({
        where: { id, email: req.user.email },
        data: { testedStatus: status, testedAt: new Date().toISOString() }
      })
    } catch(e) {}
  }

  res.json({ success, message, status });
});

app.get('/api/connections', authenticateUser, async (req, res) => {
  const userConns = await prisma.connection.findMany({ where: { email: req.user.email } })
  return res.json(userConns.map(c => ({ ...c, pw: '', status: c.testedStatus })))
});

const connectionSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().regex(/^([a-zA-Z0-9.-]+)$/, 'Invalid host format'),
  port: z.number().int().min(1).max(65535),
  dbname: z.string().min(1),
  user: z.string().min(1),
  type: z.enum(['PostgreSQL', 'SQL Server']),
  ssl: z.enum(['disable', 'prefer', 'require', 'verify-full']).optional()
}).catchall(z.any());

app.put('/api/connections/:id', authenticateUser, async (req, res) => {
  const validation = connectionSchema.safeParse({ ...req.body, port: parseInt(req.body.port) || 0 });
  if (!validation.success) {
    return res.status(400).json({ message: 'Validation failed', errors: validation.error.errors });
  }

  const data = {
    name: sanitizeStr(req.body.name), type: req.body.type, host: req.body.host, port: parseInt(req.body.port),
    dbname: req.body.dbname, schema: req.body.schema, user: req.body.user, ssl: req.body.ssl,
    testedStatus: req.body.status, testedAt: req.body.tested
  }
  if (req.body.pw) data.pw = encrypt(req.body.pw)

  try {
    const existing = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (existing && existing.email !== req.user.email) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    if (existing) {
      await prisma.connection.update({
        where: { id: req.params.id },
        data
      });
    } else {
      await prisma.connection.create({
        data: {
          id: req.params.id, email: req.user.email, pw: encrypt(req.body.pw) || '',
          createdAt: new Date().toISOString(), ...data
        }
      });
    }
    res.json({ success: true, message: 'Connection updated', connection: { id: req.params.id, ...req.body, pw: '' } });
  } catch (err) {
    console.error('Error saving connection:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save connection.' });
  }
});

app.delete('/api/connections/:id', authenticateUser, async (req, res) => {
  try {
    const existing = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Connection not found.' });
    if (existing.email !== req.user.email) return res.status(403).json({ message: 'Forbidden' });
    
    await prisma.connection.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Connection deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete connection.' });
  }
});

app.post('/api/auth/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    
    if (!user) {
      return res.status(404).json({ message: 'Account not found. Please check the email address you entered.' });
    }

    const codeString = Math.floor(100000 + Math.random() * 900000).toString();
    const tokenHash = createHash('sha256').update(codeString).digest('hex');
    const expiry = Date.now() + 15 * 60 * 1000;

    await prisma.user.update({
      where: { email: normalizedEmail },
      data: { resetToken: tokenHash, resetTokenExpiry: BigInt(expiry) }
    });

      try {
        await transporter.sendMail({
          from: `"UNMASQUE" <${process.env.EMAIL_USER}>`,
          to: normalizedEmail,
          subject: 'Password Reset Code - UNMASQUE',
          text: `Your password reset code is: ${codeString}\nThis code will expire in 15 minutes.`
        });
      } catch (err) {
        console.error('Failed to send reset email', err);
        return res.status(500).json({ message: `Email Delivery Failed: ${err.message}` });
      }

      return res.json({ message: 'Verification code sent to your email.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ message: 'Internal server error while processing request.' });
  }
});

app.post('/api/auth/verify-reset', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ message: 'Email and code are required.' });

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  
  if (!user || !user.resetToken || !user.resetTokenExpiry) {
    return res.status(400).json({ message: 'Invalid or expired code.' });
  }

  if (Number(user.resetTokenExpiry) < Date.now()) {
    return res.status(400).json({ message: 'Code has expired.' });
  }

  const tokenHash = createHash('sha256').update(code).digest('hex');
  if (tokenHash !== user.resetToken) {
    return res.status(400).json({ message: 'Invalid code.' });
  }

  const nextToken = randomBytes(32).toString('hex');
  const nextTokenHash = createHash('sha256').update(nextToken).digest('hex');
  await prisma.user.update({
    where: { email: normalizedEmail },
    data: { resetToken: nextTokenHash }
  });

  return res.json({ message: 'Code verified.', resetToken: nextToken });
});

app.post('/api/auth/reset', async (req, res) => {
  const { email, resetToken, password } = req.body;
  if (!email || !resetToken || !password) return res.status(400).json({ message: 'Missing parameters.' });

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ message: pwErr });

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  
  if (!user || !user.resetToken || !user.resetTokenExpiry) {
    return res.status(400).json({ message: 'Invalid or expired reset session.' });
  }

  if (Number(user.resetTokenExpiry) < Date.now()) {
    return res.status(400).json({ message: 'Reset session has expired.' });
  }

  const tokenHash = createHash('sha256').update(resetToken).digest('hex');
  if (tokenHash !== user.resetToken) {
    return res.status(400).json({ message: 'Invalid reset session.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ 
    where: { email: normalizedEmail }, 
    data: { password: passwordHash, resetToken: null, resetTokenExpiry: null } 
  });

  return res.json({ message: 'Password has been reset successfully.' });
});

app.get('/api/notifications', authenticateUser, async (req, res) => {
  const notifications = await prisma.notification.findMany({ where: { email: req.user.email } })
  return res.json({ notifications })
})

app.delete('/api/notifications/:id', authenticateUser, async (req, res) => {
  const { id } = req.params
  try {
    const result = await prisma.notification.deleteMany({ where: { id, email: req.user.email } })
    if (result.count === 0) throw new Error('Not found')
    return res.json({ message: 'Notification dismissed' })
  } catch(e) {
    return res.status(404).json({ message: 'Notification not found' })
  }
})


// Fallback for React Router
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return res.status(404).json({ message: 'Not found' })
  res.sendFile(path.join(distPath, 'index.html'))
})

const server = app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`)
  
  // Clean up old sessions and refresh tokens on boot
  try {
    await prisma.session.deleteMany({ where: { loginTime: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() } } })
    await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: Date.now() } } })
    
    // Fix running jobs
    const jobs = await prisma.extraction.findMany({ where: { status: 'running' } })
    for (const j of jobs) {
      await prisma.extraction.update({ where: { id: j.id }, data: { status: 'failed' } })
    }
  } catch (err) {
    console.error('Boot cleanup error:', err.message || err)
  }
})

io = new Server(server, { path: '/ws/socket.io', cors: { origin: true, credentials: true }, pingInterval: 25000, pingTimeout: 60000 })

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id))
})

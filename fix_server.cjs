const fs = require('fs');

let content = fs.readFileSync('server/index.js', 'utf8');

// 1. Add sanitizeStr & validatePassword
const helpers = `
function sanitizeStr(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[^a-zA-Z0-9\\s.,!?_'-]/g, '').trim();
}

function validatePassword(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character.';
  return null;
}
`;
content = content.replace('const prisma = new PrismaClient()', 'const prisma = new PrismaClient()\n' + helpers);

// 2. JWT Verification
const authUserOld = `async function authenticateUser(req, res, next) {
  const cookies = parseCookies(req)
  const refreshToken = cookies.unmasqueRefreshToken
  if (!refreshToken) return res.status(401).json({ message: 'Authentication required.' })

  const tokenHash = createHash('sha256').update(refreshToken).digest('hex')
  const tokenEntry = await prisma.refreshToken.findUnique({ where: { token: tokenHash } })
  if (!tokenEntry || Number(tokenEntry.expiresAt) < Date.now()) {
    return res.status(401).json({ message: 'Invalid or expired session.' })
  }

  const user = await prisma.user.findUnique({ where: { email: tokenEntry.email } })
  if (!user) return res.status(401).json({ message: 'Invalid session.' })

  req.user = user
  next()
}`;
const authUserNew = `async function authenticateUser(req, res, next) {
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
}`;
content = content.replace(authUserOld, authUserNew);

// Fix login to set accessToken cookie
content = content.replace(
  "res.cookie('unmasqueRefreshToken', refreshToken, cookieOptions)\n  return res.json({",
  "res.cookie('unmasqueRefreshToken', refreshToken, cookieOptions)\n  res.cookie('unmasqueAccessToken', createAccessToken({ email: user.email, name: user.name }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 15 * 60 * 1000 })\n  return res.json({"
);
content = content.replace(
  "res.cookie('unmasqueRefreshToken', refreshToken, cookieOptions)\n    return res.json({",
  "res.cookie('unmasqueRefreshToken', refreshToken, cookieOptions)\n    res.cookie('unmasqueAccessToken', createAccessToken({ email: user.email, name: user.name }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 15 * 60 * 1000 })\n    return res.json({"
);

// Bug 6 & 9: Signup
const signupOld = `  const { name, email, password } = req.body
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' })

  const normalizedEmail = email.trim().toLowerCase()
  if (!validateEmail(normalizedEmail)) return res.status(400).json({ message: 'Please provide a valid email address.' })

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) return res.status(409).json({ message: 'An account already exists for this email.' })

  const passwordHash = await bcrypt.hash(password, 10)`;
const signupNew = `  const { name, email, password } = req.body
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' })

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ message: pwErr });

  const normalizedEmail = email.trim().toLowerCase()
  if (!validateEmail(normalizedEmail)) return res.status(400).json({ message: 'Please provide a valid email address.' })

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) return res.status(409).json({ message: 'An account already exists for this email.' })

  const passwordHash = await bcrypt.hash(password, 10)`;
content = content.replace(signupOld, signupNew);
content = content.replace(`name: name.trim()`, `name: sanitizeStr(name)`);

// Bug 9: Password Change
content = content.replace(
  `  const passwordMatches = await bcrypt.compare(currentPassword, user.password);\n  if (!passwordMatches) return res.status(401).json({ message: 'Current password is incorrect.' });\n\n  const passwordHash = await bcrypt.hash(newPassword, 10);`,
  `  const passwordMatches = await bcrypt.compare(currentPassword, user.password);\n  if (!passwordMatches) return res.status(401).json({ message: 'Current password is incorrect.' });\n\n  const pwErr = validatePassword(newPassword);\n  if (pwErr) return res.status(400).json({ message: pwErr });\n\n  const passwordHash = await bcrypt.hash(newPassword, 10);`
);

// Bug 10 & Bug 6: API Keys
const apikeysOld = `app.post('/api/auth/apikeys', authenticateUser, async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ message: 'Key name is required.' })
  
  const existingKey = await prisma.apiKey.findFirst({ where: { email: req.user.email, name } })
  if (existingKey) return res.status(400).json({ message: 'An API key with this name already exists.' })`;
const apikeysNew = `
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
  if (existingKey) return res.status(400).json({ message: 'An API key with this name already exists.' })`;
content = content.replace(apikeysOld, apikeysNew);

// Bug 5 & Bug 6 & Bug 13: Extractions
content = content.replace(
  `  const name = typeof payload.jobName === 'string' && payload.jobName.trim() ? payload.jobName.trim() : \`Extraction_\${now.getTime()}\``,
  `  const name = typeof payload.jobName === 'string' && payload.jobName.trim() ? sanitizeStr(payload.jobName) : \`Extraction_\${now.getTime()}\``
);

content = content.replace(
  `  if (!connData || connData.email !== req.user.email) {
    return res.status(400).json({ message: 'Database Connection Verification Failed: No valid connection found.' })
  }`,
  `  if (!connData || connData.email !== req.user.email) {
    return res.status(400).json({ message: 'Database Connection Verification Failed: No valid connection found.' })
  }
  if (connData.testedStatus !== 'ok' && connData.testedStatus !== 'connected') {
    return res.status(400).json({ message: 'The selected database connection has not been successfully verified. Please test the connection before starting an extraction.' })
  }`
);

content = content.replace(
  `  runRealPipeline(jobId);`,
  `  runRealPipeline(jobId).catch(async (err) => {
    console.error('Unhandled pipeline error:', err);
    try {
      const logs = job.logs || [];
      logs.push(\`[FATAL] Pipeline crashed: \${err.message}\`);
      await prisma.extraction.update({
        where: { id: jobId },
        data: { status: 'failed', logs: JSON.stringify(logs) }
      });
    } catch(e) {}
  });`
);

// Bug 11: DB Errors
const dbTestOld = `  } catch (err) {
    success = false; message = err.message || 'Connection failed';
  }`;
const dbTestNew = `  } catch (err) {
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
  }`;
content = content.replace(dbTestOld, dbTestNew);


// Bug 1: IDOR on connections + Bug 7: Missing Input Validation
const connPutOld = `app.put('/api/connections/:id', authenticateUser, async (req, res) => {
  const data = {
    name: req.body.name, type: req.body.type, host: req.body.host, port: parseInt(req.body.port) || null,
    dbname: req.body.dbname, schema: req.body.schema, user: req.body.user, ssl: req.body.ssl,
    testedStatus: req.body.status, testedAt: req.body.tested
  }
  if (req.body.pw) data.pw = encrypt(req.body.pw)

  try {
    await prisma.connection.upsert({
      where: { id: req.params.id },
      update: data,
      create: {
        id: req.params.id, email: req.user.email, pw: encrypt(req.body.pw) || '',
        createdAt: new Date().toISOString(), ...data
      }
    })
    res.json({ success: true, message: 'Connection updated', connection: { id: req.params.id, ...req.body, pw: '' } });
  } catch (err) {
    console.error('Error saving connection:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save connection.' });
  }
});`;

const connPutNew = `const connectionSchema = z.object({
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
});`;
content = content.replace(connPutOld, connPutNew);

// Bug 12: 2FA bypass
content = content.replace(
  `  if (code !== '000000' && code !== req.body.tempSecret) return res.status(400).json({ message: 'Invalid code.' })`,
  `  if (code !== req.body.tempSecret) return res.status(400).json({ message: 'Invalid code.' })`
);
content = content.replace(
  `    if (totpToken !== user.totpSecret && totpToken !== '000000') {`,
  `    if (totpToken !== user.totpSecret) {`
);
content = content.replace(
  `  if (code !== tempSecret && code !== '000000') return res.status(400).json({ message: 'Invalid or expired code.' })`,
  `  if (code !== tempSecret) return res.status(400).json({ message: 'Invalid or expired code.' })`
);

fs.writeFileSync('server/index.js', content, 'utf8');

// Bug 8 requires more surgical changes, let's just do it with replace_file_content separately.

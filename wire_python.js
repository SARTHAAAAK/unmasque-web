import fs from 'fs'

let code = fs.readFileSync('server/index.js', 'utf8')

// If axios is not imported at the top, we can just use dynamic import or require
if (!code.includes("const axios = require('axios')") && !code.includes("import axios")) {
  code = code.replace(/import { Server } from 'socket\.io'/, "import { Server } from 'socket.io'\nimport axios from 'axios'")
}

const replacement = `
    const pythonEngineUrl = process.env.PYTHON_ENGINE_URL;

    if (pythonEngineUrl) {
      job.logs.push(\`[INFO] Forwarding extraction request to Python engine at \${pythonEngineUrl}...\`);
      if (io) io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: job.logs[job.logs.length - 1] });

      try {
        const response = await axios.post(\`\${pythonEngineUrl}/api/extract\`, {
          connection: {
            host: connData.host,
            port: connData.port,
            dbname: connData.dbname,
            user: connData.user,
            password: decrypt(connData.pw),
            type: connData.type
          },
          config: job.config
        });

        extractedSql = response.data.sql || extractedSql;
        job.logs.push(\`[INFO] Python engine extraction completed successfully.\`);
        if (response.data.logs && Array.isArray(response.data.logs)) {
           job.logs.push(...response.data.logs);
        }
      } catch (err) {
        job.logs.push(\`[WARNING] Python engine unreachable or failed (\${err.message}). Falling back to simulation.\`);
        if (io) io.of('/ws/jobs/' + jobId + '/stream').emit('log', { message: job.logs[job.logs.length - 1] });
        // Let it fall through to simulation
      }
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));
`

code = code.replace(/const sleep = ms => new Promise\(r => setTimeout\(r, ms\)\);/, replacement)

fs.writeFileSync('server/index.js', code)
console.log('Done injecting python conditional wiring')

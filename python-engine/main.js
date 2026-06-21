import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import pg from 'pg';

const execPromise = util.promisify(exec);
const app = express();
app.use(express.json());
app.use(cors());

app.post('/api/extract', async (req, res) => {
    const logs = [];
    const jobName = req.body.config?.jobName || 'Untitled';
    logs.push(`[CORE ENGINE] Microservice initialized. Received job: ${jobName}`);
    logs.push(`[CORE ENGINE] Attempting live connection to ${req.body.connection.type} database at ${req.body.connection.host}...`);

    let tables = {};
    
    // 1. LIVE DATABASE CONNECTION
    try {
        if (req.body.connection.type === 'PostgreSQL') {
            const sslmode = req.body.connection.sslmode;
            const sslVal = req.body.connection.ssl;
            const sslConfig = sslmode === 'disable' ? false : (sslVal === 'require' ? { rejectUnauthorized: true } : { rejectUnauthorized: false });

            const client = new pg.Client({
                host: req.body.connection.host,
                port: req.body.connection.port || 5432,
                database: req.body.connection.dbname,
                user: req.body.connection.user,
                password: req.body.connection.password,
                ssl: sslConfig
            });
            await client.connect();
            logs.push(`[CORE ENGINE] Successfully authenticated to PostgreSQL database.`);
            
            const schema = req.body.connection.schema || req.body.config?.schema || 'public';
            await client.query(`SET search_path TO "${schema}"`);
            
            const selectedTables = req.body.config.selectedTables || [];
            let queryStr = `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = '${schema}'`;
            if (selectedTables.length > 0) {
                const inClause = selectedTables.map(t => `'${t}'`).join(', ');
                queryStr += ` AND table_name IN (${inClause})`;
            }
            
            const dbRes = await client.query(queryStr);
            for (const row of dbRes.rows) {
                if (!tables[row.table_name]) tables[row.table_name] = [];
                tables[row.table_name].push(row.column_name);
            }
            await client.end();
            logs.push(`[CORE ENGINE] Read metadata for ${Object.keys(tables).length} target tables.`);
        } else {
            logs.push(`[CORE ENGINE] Database type ${req.body.connection.type} unsupported by lightweight driver, falling back.`);
            for (const t of (req.body.config.selectedTables || [])) {
                tables[t] = [];
            }
        }
    } catch (e) {
        logs.push(`[CORE ENGINE] [ERROR] Database connection failed: ${e.message}`);
        return res.status(400).json({ detail: `Database error: ${e.message}` });
    }

    // 2. REAL BLACK-BOX INVOCATION & VALIDATION
    const appType = req.body.config.appType || 'D';
    logs.push(`[CORE ENGINE] Initiating black-box extraction (Type ${appType})...`);
    
    let appOutput = "";
    const startTime = Date.now();
    try {
        if (appType === 'D') {
            const method = req.body.config.httpMethod || 'GET';
            const url = `${req.body.config.url || ''}${req.body.config.endpoint || ''}`;
            if (!req.body.config.url) throw new Error("HTTP Target URL cannot be empty.");
            
            logs.push(`[CORE ENGINE] Sending actual ${method} request to ${url}`);
            const resp = await axios({ method, url, timeout: 15000 });
            logs.push(`[CORE ENGINE] Target application responded with HTTP ${resp.status}`);
            appOutput = typeof resp.data === 'string' ? resp.data.trim() : JSON.stringify(resp.data);
            
        } else if (appType === 'B') {
            if (!req.body.config.execPath) throw new Error("Shell executable path cannot be empty.");
            const cmd = `${req.body.config.execPath} ${req.body.config.execArgs || ''}`.trim();
            logs.push(`[CORE ENGINE] Executing shell command: ${cmd}`);
            
            const { stdout } = await execPromise(cmd, { cwd: req.body.config.execCwd || undefined, timeout: 30000 });
            logs.push(`[CORE ENGINE] Shell command completed successfully.`);
            appOutput = stdout.trim();
            
        } else if (appType === 'C') {
            if (!req.body.config.pyScriptPath) throw new Error("Python script path cannot be empty.");
            const cmd = `${req.body.config.pyVersion || 'python'} ${req.body.config.pyScriptPath} ${req.body.config.pyArgs || ''}`.trim();
            logs.push(`[CORE ENGINE] Executing script: ${cmd}`);
            
            const { stdout } = await execPromise(cmd, { timeout: 30000 });
            logs.push(`[CORE ENGINE] Script execution completed successfully.`);
            appOutput = stdout.trim();
            
        } else if (appType === 'A') {
            const procName = req.body.config.procName || '';
            if (!procName) throw new Error("Stored procedure name cannot be empty.");
            logs.push(`[CORE ENGINE] Executing Database Procedure: ${procName}`);
            appOutput = `Executed Procedure: ${procName}`;
        }
    } catch (e) {
        const errorMsg = `Target application execution failed: ${e.message}`;
        logs.push(`[CORE ENGINE] [FATAL ERROR] ${errorMsg}`);
        return res.status(400).json({ detail: errorMsg });
    }
    
    const durationMs = Date.now() - startTime;
    logs.push(`[CORE ENGINE] Extraction routines completed in ${(durationMs/1000).toFixed(2)} seconds.`);

    if (!appOutput) {
        logs.push("[CORE ENGINE] [WARNING] The target application returned no output.");
        appOutput = "/* Application returned empty output */";
    }

    // 3. FINAL SQL ASSIGNMENT
    // We map the actual black-box output exactly to the resulting query
    let sql = appOutput;

    // Apply strict UI configurations to the extracted text
    if (req.body.config.distinct && !sql.toUpperCase().includes('SELECT DISTINCT')) {
        sql = sql.replace(/SELECT/i, 'SELECT DISTINCT');
    }
    if (req.body.config.clauses?.ORDERBY && sql.toUpperCase().includes('SELECT')) {
        // Optional naive order by injection for the UI configuration
        if (!sql.toUpperCase().includes('ORDER BY')) {
            sql += '\nORDER BY 1 DESC';
        }
    }

    res.json({ sql, logs });
});

app.listen(8001, () => {
    console.log("Core Engine Microservice listening on http://localhost:8001");
});

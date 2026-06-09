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
            const client = new pg.Client({
                host: req.body.connection.host,
                port: req.body.connection.port || 5432,
                database: req.body.connection.dbname,
                user: req.body.connection.user,
                password: req.body.connection.password
            });
            await client.connect();
            logs.push(`[CORE ENGINE] Successfully authenticated to PostgreSQL database.`);
            
            const schema = req.body.config.schema || 'public';
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

    // 2. REAL BLACK-BOX INVOCATION
    const appType = req.body.config.appType || 'D';
    logs.push(`[CORE ENGINE] Initiating black-box extraction (Type ${appType})...`);
    
    const startTime = Date.now();
    try {
        if (appType === 'D') {
            const method = req.body.config.httpMethod || 'GET';
            const url = `${req.body.config.url || ''}${req.body.config.endpoint || ''}`;
            logs.push(`[CORE ENGINE] Sending actual ${method} request to ${url}`);
            const resp = await axios({ method, url, timeout: 10000 });
            logs.push(`[CORE ENGINE] Target application responded with HTTP ${resp.status}`);
        } else if (appType === 'B') {
            const cmd = `${req.body.config.execPath} ${req.body.config.execArgs}`;
            logs.push(`[CORE ENGINE] Executing shell command: ${cmd}`);
            const { stdout } = await execPromise(cmd, { cwd: req.body.config.execCwd, timeout: 15000 });
            logs.push(`[CORE ENGINE] Shell command completed successfully.`);
        } else if (appType === 'C') {
            const cmd = `${req.body.config.pyVersion || 'python'} ${req.body.config.pyScriptPath} ${req.body.config.pyArgs}`;
            logs.push(`[CORE ENGINE] Executing script: ${cmd}`);
            const { stdout } = await execPromise(cmd, { timeout: 15000 });
            logs.push(`[CORE ENGINE] Script execution completed successfully.`);
        } else if (appType === 'A') {
            logs.push(`[CORE ENGINE] Simulated trigger of stored procedure: ${req.body.config.procName}`);
        }
    } catch (e) {
        logs.push(`[CORE ENGINE] [WARNING] Target application execution threw an exception: ${e.message}`);
    }
    
    const durationMs = Date.now() - startTime;
    logs.push(`[CORE ENGINE] Extraction routines completed in ${(durationMs/1000).toFixed(2)} seconds.`);

    // 3. QUERY GENERATION FROM REAL SCHEMA
    let sql = "SELECT 'No tables available' AS result;";
    const tableKeys = Object.keys(tables);
    if (tableKeys.length > 0) {
        const fromClause = tableKeys.map(t => `"${t}"`).join(',\n    ');
        const selectCols = [];
        for (const [t, cols] of Object.entries(tables)) {
            if (cols.length > 0) selectCols.push(`    "${t}"."${cols[0]}"`);
            else selectCols.push(`    "${t}".*`);
        }
        sql = `SELECT\n${selectCols.join(',\n')}\nFROM\n    ${fromClause}\nLIMIT 100;`;
        logs.push(`[CORE ENGINE] Successfully assembled syntactically valid SQL query.`);
    }

    if (req.body.config.distinct) sql = sql.replace('SELECT', 'SELECT DISTINCT');
    if (req.body.config.clauses?.ORDERBY) sql = sql.replace('LIMIT 100', 'ORDER BY 1 DESC\nLIMIT 100');

    res.json({ sql, logs });
});

app.listen(8001, () => {
    console.log("Core Engine Microservice listening on http://localhost:8001");
});

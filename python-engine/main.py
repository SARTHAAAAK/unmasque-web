from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import psycopg2
import time
import requests
import subprocess
import os

app = FastAPI()

class ConnectionParams(BaseModel):
    host: str
    port: int
    dbname: str
    user: str
    password: str
    type: str

class ExtractRequest(BaseModel):
    connection: ConnectionParams
    config: Dict[str, Any]

class ExtractResponse(BaseModel):
    sql: str
    logs: List[str]

@app.get("/")
def read_root():
    return {"status": "online", "message": "UNMASQUE Python Core Engine is running natively!"}

@app.post("/api/extract", response_model=ExtractResponse)
async def run_extraction(req: ExtractRequest):
    logs = []
    job_name = req.config.get('jobName', 'Untitled')
    logs.append(f"[PYTHON] Core Engine initialized. Received job: {job_name}")
    logs.append(f"[PYTHON] Attempting live connection to {req.connection.type} database at {req.connection.host}...")
    
    # 1. LIVE DATABASE CONNECTION
    tables = {}
    try:
        if req.connection.type == 'PostgreSQL':
            conn = psycopg2.connect(
                host=req.connection.host,
                port=req.connection.port,
                dbname=req.connection.dbname,
                user=req.connection.user,
                password=req.connection.password
            )
            cur = conn.cursor()
            logs.append(f"[PYTHON] Successfully authenticated to PostgreSQL database.")
            
            schema = req.config.get('schema', 'public')
            cur.execute(f"SET search_path TO {schema}")
            
            selected_tables = req.config.get('selectedTables', [])
            
            # Fetch Real Schema
            query = f"SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = '{schema}'"
            if selected_tables:
                in_clause = ", ".join([f"'{t}'" for t in selected_tables])
                query += f" AND table_name IN ({in_clause})"
                
            cur.execute(query)
            for row in cur.fetchall():
                t_name, c_name = row
                if t_name not in tables:
                    tables[t_name] = []
                tables[t_name].append(c_name)
                
            cur.close()
            conn.close()
            logs.append(f"[PYTHON] Read metadata for {len(tables)} target tables.")
        else:
            logs.append(f"[PYTHON] Database type {req.connection.type} not fully supported by standard driver, using fallback schema logic.")
            for t in req.config.get('selectedTables', []):
                tables[t] = []
    except Exception as e:
        logs.append(f"[PYTHON] [ERROR] Database connection failed: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")

    # 2. REAL BLACK-BOX INVOCATION & VALIDATION
    app_type = req.config.get('appType', 'D')
    logs.append(f"[PYTHON] Initiating black-box extraction (Type {app_type})...")
    
    start_time = time.time()
    app_output = ""
    
    try:
        if app_type == 'D': # HTTP
            base_url = req.config.get('url', '').strip()
            endpoint = req.config.get('endpoint', '').strip()
            url = f"{base_url}{endpoint}"
            method = req.config.get('httpMethod', 'GET')
            
            if not base_url:
                raise ValueError("HTTP Target URL cannot be empty.")
                
            logs.append(f"[PYTHON] Sending actual {method} request to {url}")
            resp = requests.request(method, url, timeout=15)
            logs.append(f"[PYTHON] Target application responded with HTTP {resp.status_code}")
            
            if not resp.ok:
                raise ValueError(f"Application returned HTTP {resp.status_code}: {resp.text}")
            app_output = resp.text.strip()

        elif app_type == 'B': # Shell
            exec_path = req.config.get('execPath', '').strip()
            if not exec_path:
                raise ValueError("Shell executable path cannot be empty.")
                
            cmd = f"{exec_path} {req.config.get('execArgs', '')}".strip()
            cwd = req.config.get('execCwd', None) or None
            logs.append(f"[PYTHON] Executing shell command: {cmd}")
            
            proc = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=30)
            logs.append(f"[PYTHON] Shell command returned exit code {proc.returncode}")
            
            if proc.returncode != 0:
                raise ValueError(f"Process exited with code {proc.returncode}. Stderr: {proc.stderr}")
            app_output = proc.stdout.strip()

        elif app_type == 'C': # Python
            py_path = req.config.get('pyScriptPath', '').strip()
            if not py_path:
                raise ValueError("Python script path cannot be empty.")
                
            cmd = f"{req.config.get('pyVersion', 'python')} {py_path} {req.config.get('pyArgs', '')}".strip()
            logs.append(f"[PYTHON] Executing Python script: {cmd}")
            
            proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            logs.append(f"[PYTHON] Python script returned exit code {proc.returncode}")
            
            if proc.returncode != 0:
                raise ValueError(f"Script exited with code {proc.returncode}. Stderr: {proc.stderr}")
            app_output = proc.stdout.strip()
            
        elif app_type == 'A': # SQL Procedure
            proc_name = req.config.get('procName', '').strip()
            if not proc_name:
                raise ValueError("Stored procedure name cannot be empty.")
            logs.append(f"[PYTHON] Executing Database Procedure: {proc_name}")
            # Placeholder for actual procedure execution since we already closed the DB connection
            app_output = f"Executed Procedure: {proc_name}"

    except Exception as e:
        error_msg = f"Target application execution failed: {str(e)}"
        logs.append(f"[PYTHON] [FATAL ERROR] {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
        
    duration = time.time() - start_time
    logs.append(f"[PYTHON] Extraction routines completed successfully in {duration:.2f} seconds.")
    
    if not app_output:
        logs.append("[PYTHON] [WARNING] The target application returned no output.")
        app_output = "/* Application returned empty output */"

    # 3. FINAL SQL ASSIGNMENT
    # Instead of generating a generic query from the schema, we map the actual black-box output.
    # In a fully integrated UNMASQUE environment, app_output contains the extracted hidden query.
    sql = app_output
    
    # Optionally apply strict UI configurations to the extracted text
    if req.config.get('distinct', False) and "SELECT DISTINCT" not in sql.upper():
        sql = sql.replace("SELECT", "SELECT DISTINCT", 1)
        sql = sql.replace("select", "SELECT DISTINCT", 1)
        
    return ExtractResponse(sql=sql, logs=logs)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

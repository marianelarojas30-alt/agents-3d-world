@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  start "AgentsWorldServer" /min python server.py
) else (
  start "AgentsWorldServer" /min py server.py
)
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8737"

@echo off
cd /d "%~dp0.."
echo Starting GridSense AI production server on http://127.0.0.1:3000
"C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" start --hostname 127.0.0.1 --port 3000
echo Server exited with code %ERRORLEVEL%
timeout /t 3600 > nul

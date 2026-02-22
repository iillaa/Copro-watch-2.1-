@echo off
echo ===================================================
echo Starting Copro-Watch (Portable Offline Mode)...
echo ===================================================
echo Do not close this black window.

:: Starts the standalone server on port 8080, serving the current directory
start /B server.exe --index index.html -p 8080 .

:: Waits 2 seconds for the server to spin up, then opens the default browser
timeout /t 2 >nul
start http://localhost:8080
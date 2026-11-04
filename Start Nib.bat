@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed once. Installing it now...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  echo.
  echo Done. Close this window and double-click Start Nib again.
  pause
  exit /b
)
if not exist node_modules (
  echo First run: setting up Nib, about a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b )
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"

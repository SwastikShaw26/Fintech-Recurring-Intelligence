@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo FinSight needs a working .venv. See the Windows setup in README.md.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m src.launch_local %*
if errorlevel 1 (
  echo FinSight could not start. See the error above and README.md.
  pause
  exit /b 1
)

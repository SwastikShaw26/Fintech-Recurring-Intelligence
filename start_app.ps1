# FinSight - Fintech Recurring Intelligence Launcher
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "   FinSight — Recurring Payment Intelligence Platform" -ForegroundColor Green
Write-Host "   hackFront India 2026 — Problem T4.1 | Team CTRL+SLOTH" -ForegroundColor Yellow
Write-Host "===============================================================" -ForegroundColor Cyan

# 1. Run Recurrence Detection v3
Write-Host "`n[1/3] Running Recurrence Detection Engine v3..." -ForegroundColor Yellow
python src/detect_recurring_v3.py

# 2. Run Evaluation Benchmark
Write-Host "`n[2/3] Running Evaluation Benchmark..." -ForegroundColor Yellow
python src/evaluate_detector_v3.py

# 3. Launch FastAPI Server (Serves API and Built React Frontend)
Write-Host "`n[3/3] Starting FinSight Full-Stack Application..." -ForegroundColor Green
Write-Host "Application URL : http://localhost:8000" -ForegroundColor Cyan
Write-Host "API Swagger Docs: http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "`nPress Ctrl+C to stop the server.`n" -ForegroundColor DarkGray

python -m uvicorn src.api:app --host 127.0.0.1 --port 8000 --reload

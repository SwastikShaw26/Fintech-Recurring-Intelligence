param(
    [string]$Python = 'python',
    [ValidateRange(1, 65535)][int]$Port = 8000,
    [switch]$Smoke
)

$ErrorActionPreference = 'Stop'
$runtime = New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ('finsight-demo-' + [guid]::NewGuid()))
$previousProcessed = $env:FINSIGHT_PROCESSED_DIR
$previousDist = $env:FINSIGHT_FRONTEND_DIST
$previousApi = $env:VITE_API_URL

function Assert-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE." }
}

Push-Location $PSScriptRoot
try {
    $env:FINSIGHT_PROCESSED_DIR = Join-Path $runtime.FullName 'processed'
    $env:FINSIGHT_FRONTEND_DIST = Join-Path $runtime.FullName 'dist'
    $env:VITE_API_URL = '/'

    & $Python -c 'import fastapi, uvicorn'
    Assert-Exit 'Python dependency check (install requirements.txt first)'
    & $Python -m src.detect_recurring_v3
    Assert-Exit 'Detector'

    Push-Location frontend
    try {
        if (!(Test-Path -LiteralPath 'node_modules/.bin/vite.cmd')) {
            npm ci
            Assert-Exit 'Frontend dependency install'
        }
        npm run build -- --outDir $env:FINSIGHT_FRONTEND_DIST --emptyOutDir
        Assert-Exit 'Frontend build'
    } finally {
        Pop-Location
    }

    if ($Smoke) {
        & $Python -m pytest -q -p no:cacheprovider
        Assert-Exit 'Demo smoke tests'
    } else {
        Write-Host "FinSight is available at http://127.0.0.1:$Port"
        & $Python -m uvicorn src.api:app --host 127.0.0.1 --port $Port
        Assert-Exit 'FastAPI'
    }
} finally {
    Pop-Location
    $env:FINSIGHT_PROCESSED_DIR = $previousProcessed
    $env:FINSIGHT_FRONTEND_DIST = $previousDist
    $env:VITE_API_URL = $previousApi
    $resolvedRuntime = Resolve-Path -LiteralPath $runtime.FullName -ErrorAction SilentlyContinue
    if ($resolvedRuntime.Path -eq $runtime.FullName) {
        Remove-Item -LiteralPath $resolvedRuntime.Path -Recurse -Force
    }
}

# Runs the backend using the project's .venv, regardless of what's active on
# PATH. Prevents the classic mistake of a global `uvicorn` picking up the
# wrong `jwt` package (PyPI has two unrelated packages that both install as
# module `jwt`: the wrong one shadows PyJWT's PyJWKClient).
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir
try {
    & "$scriptDir\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --port 8000
} finally {
    Pop-Location
}

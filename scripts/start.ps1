$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)
python scripts/start.py @args
if ($LASTEXITCODE -ne 0) { throw 'Startup failed' }

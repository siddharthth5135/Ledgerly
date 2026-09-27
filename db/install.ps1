# Ledgerly DB — Windows helper
# Usage:
#   .\install.ps1 -DatabaseUrl "postgresql://USER:PASS@HOST:5432/ledgerly?sslmode=require"
#
# Requires: psql on PATH

param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Error "psql not found. Install PostgreSQL client tools, or run SQL files manually in Neon/Supabase SQL Editor. See DATABASE_SETUP.md"
}

Write-Host "Installing Ledgerly schema + SPs..." -ForegroundColor Cyan
psql $DatabaseUrl -v ON_ERROR_STOP=1 -f install.sql
if ($LASTEXITCODE -ne 0) {
  Write-Error "Install failed (exit $LASTEXITCODE)"
}
Write-Host "Done. Paste verify output into Cursor chat." -ForegroundColor Green

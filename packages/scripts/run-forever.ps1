# Keeps the bot + dashboard alive: restarts node automatically if the process
# exits for ANY reason (crash, OOM, voice-library abort) and records every
# (re)start with a timestamp in logs/supervisor.log so silent deaths leave
# evidence (the app log alone cannot show a death that logs nothing).
#
# Single instance only: never run this AND `node bot/src/index.js` manually.
# Stop everything with:
#   Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
#   Get-CimInstance Win32_Process |
#     Where-Object { $_.CommandLine -match 'run-forever' } |
#     ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$root = Split-Path $PSScriptRoot -Parent
$log = Join-Path $root 'logs\supervisor.log'

while ($true) {
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) supervisor: starting node bot/src/index.js"
    & node (Join-Path $root 'bot\src\index.js')
    $code = $LASTEXITCODE
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) supervisor: node exited code=$code restarting in 5s"
    Start-Sleep -Seconds 5
}

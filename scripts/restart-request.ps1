$ErrorActionPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$exePath = Join-Path $projectRoot 'release\REQuest Desktop\REQuest.exe'

if (-not (Test-Path -LiteralPath $exePath)) { exit 1 }

$running = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $exePath }
foreach ($process in $running) {
    Stop-Process -Id $process.ProcessId -Force
}
Start-Sleep -Milliseconds 500
Start-Process -FilePath $exePath -WorkingDirectory (Split-Path -Parent $exePath)


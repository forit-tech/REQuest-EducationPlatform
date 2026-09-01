$ErrorActionPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
# Ярлык на рабочем столе может вести на любую упакованную сборку, поэтому берём ту,
# что обновлялась последней, а не одну жёстко заданную по имени.
$releaseRoot = Join-Path $projectRoot 'release'
$exePath = Get-ChildItem -LiteralPath $releaseRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike 'previous-desktop-*' } |
    ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Filter '*.exe' -ErrorAction SilentlyContinue } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName

if (-not (Test-Path -LiteralPath $exePath)) { exit 1 }

$running = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $exePath }
foreach ($process in $running) {
    Stop-Process -Id $process.ProcessId -Force
}
Start-Sleep -Milliseconds 500
Start-Process -FilePath $exePath -WorkingDirectory (Split-Path -Parent $exePath)


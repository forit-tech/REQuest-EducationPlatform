$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$electronRuntime = Join-Path $projectRoot 'node_modules\electron\dist'
$releaseRoot = Join-Path $projectRoot 'release'
$desktopApp = Join-Path $releaseRoot 'REQuest Desktop'
$appResources = Join-Path $desktopApp 'resources\app'

if (-not (Test-Path (Join-Path $electronRuntime 'electron.exe'))) {
    throw 'Electron runtime is missing. Run npm install first.'
}

if (Test-Path $desktopApp) {
    $backup = Join-Path $releaseRoot ('previous-desktop-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Move-Item -LiteralPath $desktopApp -Destination $backup
}

New-Item -ItemType Directory -Force -Path $desktopApp | Out-Null
Copy-Item -Path (Join-Path $electronRuntime '*') -Destination $desktopApp -Recurse -Force
Move-Item -LiteralPath (Join-Path $desktopApp 'electron.exe') -Destination (Join-Path $desktopApp 'REQuest.exe')

New-Item -ItemType Directory -Force -Path $appResources | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'package.json') -Destination $appResources
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist') -Destination $appResources -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'electron') -Destination $appResources -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets') -Destination $appResources -Recurse

Write-Output (Join-Path $desktopApp 'REQuest.exe')


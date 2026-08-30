$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$electronRuntime = Join-Path $projectRoot 'node_modules\electron\dist'
$releaseRoot = Join-Path $projectRoot 'release'
$desktopApp = Join-Path $releaseRoot 'REduQuest Desktop'
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
Move-Item -LiteralPath (Join-Path $desktopApp 'electron.exe') -Destination (Join-Path $desktopApp 'REduQuest.exe')

New-Item -ItemType Directory -Force -Path $appResources | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'package.json') -Destination $appResources
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist') -Destination $appResources -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'electron') -Destination $appResources -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets') -Destination $appResources -Recurse

# Запомним, откуда собрано: приложение по этому пути ищет обновления в git.
$gitDir = Join-Path $projectRoot '.git'
if (Test-Path -LiteralPath $gitDir) {
    Push-Location $projectRoot
    try {
        $remote = (& git remote get-url origin 2>$null)
        $branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
    } finally { Pop-Location }
    if ($remote -and $branch) {
        [ordered]@{
            projectRoot = $projectRoot
            remote      = $remote.Trim()
            branch      = $branch.Trim()
            enabled     = $true
            packedAt    = (Get-Date).ToString('o')
        } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $appResources 'update-config.json') -Encoding utf8
    }
}

Write-Output (Join-Path $desktopApp 'REduQuest.exe')


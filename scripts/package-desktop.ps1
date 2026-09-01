$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$electronRuntime = Join-Path $projectRoot 'node_modules\electron\dist'
$releaseRoot = Join-Path $projectRoot 'release'
# Имя совпадает с тем, на что ведёт ярлык на рабочем столе.
$desktopApp = Join-Path $releaseRoot 'REQuest Desktop'
$appResources = Join-Path $desktopApp 'resources\app'

if (-not (Test-Path (Join-Path $electronRuntime 'electron.exe'))) {
    throw 'Electron runtime is missing. Run npm install first.'
}

# Держим ровно одну резервную копию: каждая весит около 400 МБ, и раньше они
# накапливались при каждой упаковке, съев несколько гигабайт.
if (Test-Path $desktopApp) {
    $backup = Join-Path $releaseRoot 'previous-desktop'
    if (Test-Path $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
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

Write-Output (Join-Path $desktopApp 'REQuest.exe')


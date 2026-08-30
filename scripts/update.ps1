<#
.SYNOPSIS
    Обновление REduQuest из git: подтягивает изменения, переустанавливает
    зависимости при необходимости, пересобирает приложение и перезапускает его.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/update.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/update.ps1 -CheckOnly
#>
[CmdletBinding()]
param(
    # Только проверить наличие обновлений и выйти с кодом 10, если они есть.
    [switch]$CheckOnly,
    # Не перезапускать приложение после обновления.
    [switch]$NoRestart,
    # Обновиться, даже если в рабочем каталоге есть незакоммиченные изменения.
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8
$projectRoot = Split-Path -Parent $PSScriptRoot

function Say {
    param([string]$Message, [string]$Colour = 'Gray', [string]$Prefix = '  · ')
    Write-Host $Prefix -ForegroundColor DarkGray -NoNewline
    Write-Host $Message -ForegroundColor $Colour
}

function Fail {
    param([string]$Message)
    Write-Host '  ✕ ' -ForegroundColor Red -NoNewline
    Write-Host $Message -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '  REduQuest · обновление' -ForegroundColor Cyan
Write-Host ''

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'git не установлен — обновление невозможно.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) { Fail 'Каталог не является git-репозиторием.' }

Push-Location $projectRoot
try {
    $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
    Say "ветка: $branch"

    & git fetch --quiet origin $branch
    if ($LASTEXITCODE -ne 0) { Fail 'Не удалось связаться с origin. Проверьте сеть и доступ к репозиторию.' }

    $local = (& git rev-parse HEAD).Trim()
    $remote = (& git rev-parse "origin/$branch").Trim()

    if ($local -eq $remote) {
        Say 'обновлений нет — установлена последняя версия' 'Green' '  ✓ '
        Write-Host ''
        exit 0
    }

    $behind = [int](& git rev-list --count "HEAD..origin/$branch").Trim()
    Say "доступно новых коммитов: $behind" 'Yellow'
    & git --no-pager log --oneline --no-decorate "HEAD..origin/$branch" | Select-Object -First 8 | ForEach-Object { Say $_ 'DarkGray' '      ' }

    if ($CheckOnly) {
        Write-Host ''
        exit 10
    }

    $dirty = (& git status --porcelain) | Where-Object { $_ }
    if ($dirty -and -not $Force) {
        Write-Host ''
        Fail "В рабочем каталоге $($dirty.Count) незакоммиченных изменений. Сохраните их или запустите с -Force."
    }
    if ($dirty -and $Force) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        & git stash push --include-untracked --message "before-update-$stamp" | Out-Null
        Say "локальные изменения убраны в stash: before-update-$stamp" 'Yellow'
    }

    $lockBefore = if (Test-Path 'package-lock.json') { (Get-FileHash 'package-lock.json').Hash } else { '' }

    & git merge --ff-only "origin/$branch"
    if ($LASTEXITCODE -ne 0) { Fail 'Быстрая перемотка невозможна: ветка разошлась с origin. Разберитесь вручную.' }
    Say "обновлено до $((& git rev-parse --short HEAD).Trim())" 'Green' '  ✓ '

    $lockAfter = if (Test-Path 'package-lock.json') { (Get-FileHash 'package-lock.json').Hash } else { '' }
    if ($lockBefore -ne $lockAfter) {
        Say 'зависимости изменились — переустанавливаем'
        & npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Fail 'Не удалось переустановить зависимости.' }
        Say 'зависимости обновлены' 'Green' '  ✓ '
    } else {
        Say 'зависимости не менялись'
    }

    & npm run build
    if ($LASTEXITCODE -ne 0) { Fail 'Сборка не удалась. Приложение осталось на предыдущей версии.' }
    Say 'веб-сборка обновлена' 'Green' '  ✓ '

    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'package-desktop.ps1') | Out-Null
    Say 'desktop-приложение пересобрано' 'Green' '  ✓ '

    $config = Join-Path $projectRoot 'release\REduQuest Desktop\resources\app\update-config.json'
    if (Test-Path -LiteralPath (Split-Path -Parent $config)) {
        [ordered]@{
            projectRoot = $projectRoot
            remote      = (& git remote get-url origin).Trim()
            branch      = $branch
            enabled     = $true
            checkedAt   = (Get-Date).ToString('o')
        } | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding utf8
    }

    if (-not $NoRestart) {
        Say 'перезапуск приложения'
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'restart-request.ps1')
    }

    Write-Host ''
    Write-Host '  ✓ Обновление завершено' -ForegroundColor Green
    Write-Host ''
} finally { Pop-Location }

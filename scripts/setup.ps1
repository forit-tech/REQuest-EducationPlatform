<#
.SYNOPSIS
    Установщик REduQuest: проверяет окружение, ставит зависимости, собирает
    desktop-приложение, создаёт ярлыки и настраивает автообновление из git.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1 -SkipChecks -NoAutoUpdate
#>
[CmdletBinding()]
param(
    # Пропустить проверку контента и учебного графа (быстрее, но без гарантий).
    [switch]$SkipChecks,
    # Не настраивать автообновление из git.
    [switch]$NoAutoUpdate,
    # Не создавать ярлыки на рабочем столе.
    [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8
$projectRoot = Split-Path -Parent $PSScriptRoot
$started = Get-Date
$steps = [ordered]@{}

$MinNodeMajor = 20

function Write-Banner {
    $line = '─' * 64
    Write-Host ''
    Write-Host "  ┌$line┐" -ForegroundColor DarkCyan
    Write-Host '  │' -ForegroundColor DarkCyan -NoNewline
    Write-Host '   REduQuest · установка учебной платформы                      ' -ForegroundColor Cyan -NoNewline
    Write-Host '│' -ForegroundColor DarkCyan
    Write-Host '  │' -ForegroundColor DarkCyan -NoNewline
    Write-Host '   Русскоязычные практические профессии в IT и данных           ' -ForegroundColor DarkGray -NoNewline
    Write-Host '│' -ForegroundColor DarkCyan
    Write-Host "  └$line┘" -ForegroundColor DarkCyan
    Write-Host ''
}

function Write-Step {
    param([int]$Number, [int]$Total, [string]$Title)
    Write-Host ''
    Write-Host "  [$Number/$Total] " -ForegroundColor DarkCyan -NoNewline
    Write-Host $Title -ForegroundColor White
}

function Write-Ok {
    param([string]$Message)
    Write-Host '        ✓ ' -ForegroundColor Green -NoNewline
    Write-Host $Message -ForegroundColor Gray
}

function Write-Info {
    param([string]$Message)
    Write-Host '        · ' -ForegroundColor DarkGray -NoNewline
    Write-Host $Message -ForegroundColor DarkGray
}

function Write-Warn {
    param([string]$Message)
    Write-Host '        ! ' -ForegroundColor Yellow -NoNewline
    Write-Host $Message -ForegroundColor Yellow
}

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)
    $stepStart = Get-Date
    try {
        & $Action
        $steps[$Name] = @{ Status = 'ok'; Seconds = [math]::Round(((Get-Date) - $stepStart).TotalSeconds, 1) }
    } catch {
        $steps[$Name] = @{ Status = 'fail'; Seconds = [math]::Round(((Get-Date) - $stepStart).TotalSeconds, 1); Error = $_.Exception.Message }
        throw
    }
}

function Test-Tool {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    return $null
}

Write-Banner
Write-Host "  Каталог проекта: $projectRoot" -ForegroundColor DarkGray

$total = 6

# ── 1. Окружение ────────────────────────────────────────────────────────────
Write-Step 1 $total 'Проверка окружения'
Invoke-Step 'environment' {
    $nodePath = Test-Tool 'node'
    if (-not $nodePath) { throw 'Node.js не найден. Установите LTS-версию с https://nodejs.org и повторите запуск.' }
    $nodeVersion = (& node --version).TrimStart('v')
    $nodeMajor = [int]($nodeVersion.Split('.')[0])
    if ($nodeMajor -lt $script:MinNodeMajor) {
        throw "Нужен Node.js $($script:MinNodeMajor) или новее, установлен $nodeVersion."
    }
    Write-Ok "Node.js $nodeVersion"

    if (-not (Test-Tool 'npm')) { throw 'npm не найден, хотя Node.js установлен. Переустановите Node.js.' }
    Write-Ok "npm $((& npm --version))"

    $gitPath = Test-Tool 'git'
    if ($gitPath) {
        Write-Ok "git $(((& git --version) -replace 'git version ', ''))"
    } else {
        Write-Warn 'git не найден — автообновление будет недоступно.'
    }

    $freeGb = [math]::Round((Get-PSDrive -Name (Split-Path -Qualifier $projectRoot).TrimEnd(':')).Free / 1GB, 1)
    if ($freeGb -lt 2) { Write-Warn "На диске свободно $freeGb ГБ — сборке может не хватить места." }
    else { Write-Ok "Свободно на диске: $freeGb ГБ" }
}

# ── 2. Зависимости ──────────────────────────────────────────────────────────
Write-Step 2 $total 'Установка зависимостей'
Invoke-Step 'dependencies' {
    Push-Location $projectRoot
    try {
        $lock = Join-Path $projectRoot 'package-lock.json'
        if (Test-Path -LiteralPath $lock) {
            Write-Info 'найден package-lock.json — ставим строго по нему'
            & npm ci --no-audit --no-fund
        } else {
            Write-Info 'package-lock.json отсутствует — обычная установка'
            & npm install --no-audit --no-fund
        }
        if ($LASTEXITCODE -ne 0) { throw "npm завершился с кодом $LASTEXITCODE" }
        Write-Ok 'зависимости установлены'
    } finally { Pop-Location }
}

# ── 3. Проверки контента ────────────────────────────────────────────────────
Write-Step 3 $total 'Проверка учебного контента'
Invoke-Step 'validation' {
    if ($SkipChecks) { Write-Info 'пропущено ключом -SkipChecks'; return }
    Push-Location $projectRoot
    try {
        & npm run content:validate
        if ($LASTEXITCODE -ne 0) { throw 'Проверка контента не прошла' }
        & npm run curriculum:validate
        if ($LASTEXITCODE -ne 0) { throw 'Проверка учебного графа не прошла' }
        Write-Ok 'контент и учебный граф в порядке'
    } finally { Pop-Location }
}

# ── 4. Сборка ───────────────────────────────────────────────────────────────
Write-Step 4 $total 'Сборка приложения'
Invoke-Step 'build' {
    Push-Location $projectRoot
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "Сборка не удалась (код $LASTEXITCODE)" }
        Write-Ok 'веб-сборка готова'
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'package-desktop.ps1') | Out-Null
        $exe = Join-Path $projectRoot 'release\REQuest Desktop\REQuest.exe'
        if (-not (Test-Path -LiteralPath $exe)) { throw 'Desktop-сборка не создана' }
        $sizeMb = [math]::Round(((Get-ChildItem -LiteralPath (Split-Path -Parent $exe) -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 0)
        Write-Ok "desktop-приложение собрано ($sizeMb МБ)"
    } finally { Pop-Location }
}

# ── 5. Ярлыки ───────────────────────────────────────────────────────────────
Write-Step 5 $total 'Ярлыки на рабочем столе'
Invoke-Step 'shortcuts' {
    if ($NoShortcuts) { Write-Info 'пропущено ключом -NoShortcuts'; return }
    $created = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-shortcuts.ps1')
    foreach ($item in $created) { Write-Ok ([IO.Path]::GetFileNameWithoutExtension($item)) }
}

# ── 6. Автообновление ───────────────────────────────────────────────────────
Write-Step 6 $total 'Автообновление из git'
Invoke-Step 'autoupdate' {
    if ($NoAutoUpdate) { Write-Info 'пропущено ключом -NoAutoUpdate'; return }
    if (-not (Test-Tool 'git')) { Write-Warn 'git недоступен — пропускаем'; return }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
        Write-Warn 'каталог не является git-репозиторием — пропускаем'
        return
    }
    Push-Location $projectRoot
    try {
        $remote = & git remote get-url origin 2>$null
        if (-not $remote) { Write-Warn 'у репозитория нет origin — пропускаем'; return }
        Write-Ok "источник обновлений: $remote"
        $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
        $config = [ordered]@{
            projectRoot = $projectRoot
            remote      = $remote.Trim()
            branch      = $branch
            enabled     = $true
            checkedAt   = (Get-Date).ToString('o')
        }
        $target = Join-Path $projectRoot 'release\REQuest Desktop\resources\app\update-config.json'
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        $config | ConvertTo-Json | Set-Content -LiteralPath $target -Encoding utf8
        Write-Ok "ветка обновлений: $branch"
        Write-Info 'приложение проверит обновления при следующем запуске'
    } finally { Pop-Location }
}

# ── Итог ────────────────────────────────────────────────────────────────────
$elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 0)
Write-Host ''
Write-Host '  ┌────────────────────────────────────────────────────────────────┐' -ForegroundColor DarkGreen
Write-Host '  │' -ForegroundColor DarkGreen -NoNewline
Write-Host '   Готово. REduQuest установлен.                                 ' -ForegroundColor Green -NoNewline
Write-Host '│' -ForegroundColor DarkGreen
Write-Host '  └────────────────────────────────────────────────────────────────┘' -ForegroundColor DarkGreen
Write-Host ''
foreach ($name in $steps.Keys) {
    $step = $steps[$name]
    $mark = if ($step.Status -eq 'ok') { '✓' } else { '✕' }
    $colour = if ($step.Status -eq 'ok') { 'DarkGray' } else { 'Red' }
    Write-Host ("        {0} {1,-14} {2,5} с" -f $mark, $name, $step.Seconds) -ForegroundColor $colour
}
Write-Host ''
Write-Host "  Всего: $elapsed с" -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Запуск:      ' -ForegroundColor DarkGray -NoNewline
Write-Host 'ярлык REQuest на рабочем столе' -ForegroundColor White
Write-Host '  Обновление:  ' -ForegroundColor DarkGray -NoNewline
Write-Host 'npm run update' -ForegroundColor White
Write-Host '  Разработка:  ' -ForegroundColor DarkGray -NoNewline
Write-Host 'npm run dev' -ForegroundColor White
Write-Host ''

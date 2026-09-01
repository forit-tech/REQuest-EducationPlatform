#Requires -Version 5.1
<#
.SYNOPSIS
    Обновляет содержимое упакованных десктоп-сборок из текущего билда.

.DESCRIPTION
    Упакованное приложение хранит собственную копию dist рядом с исполняемым файлом,
    поэтому пересборка проекта до него не доходит: пользователь запускает ярлык
    и видит старую версию. Скрипт копирует в каждую сборку внутри release только
    полезную нагрузку — dist, electron, assets и package.json. Тяжёлая среда
    Electron (около 225 МБ) не трогается, поэтому синхронизация занимает секунды.

    Папки previous-desktop-* пропускаются: это резервные копии прошлых сборок.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\sync-desktop-payload.ps1
#>
[CmdletBinding()]
param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot 'release'
$distPath = Join-Path $projectRoot 'dist'

if (-not (Test-Path -LiteralPath $distPath)) {
    Write-Warning 'Папки dist нет — сначала выполните npm run build.'
    exit 1
}

if (-not (Test-Path -LiteralPath $releaseRoot)) {
    if (-not $Quiet) { Write-Output 'Упакованных сборок нет, синхронизировать нечего.' }
    exit 0
}

$targets = Get-ChildItem -LiteralPath $releaseRoot -Directory |
    Where-Object { $_.Name -notlike 'previous-desktop-*' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'resources\app') }

if (-not $targets) {
    if (-not $Quiet) { Write-Output 'Готовых сборок в release не найдено.' }
    exit 0
}

$payload = @('dist', 'electron', 'assets')
$updated = 0

foreach ($target in $targets) {
    $appResources = Join-Path $target.FullName 'resources\app'

    foreach ($item in $payload) {
        $source = Join-Path $projectRoot $item
        if (-not (Test-Path -LiteralPath $source)) { continue }
        $destination = Join-Path $appResources $item
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
    }

    Copy-Item -LiteralPath (Join-Path $projectRoot 'package.json') -Destination $appResources -Force

    $updated++
    if (-not $Quiet) {
        $stamp = (Get-Item -LiteralPath (Join-Path $appResources 'dist\index.html')).LastWriteTime
        Write-Output ("Обновлено: {0} (сборка от {1:yyyy-MM-dd HH:mm})" -f $target.Name, $stamp)
    }
}

if (-not $Quiet) {
    Write-Output "Синхронизировано сборок: $updated"
    Write-Output 'Перезапустите приложение, чтобы увидеть изменения.'
}

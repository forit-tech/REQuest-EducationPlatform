$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$exePath = Join-Path $projectRoot 'release\REduQuest Desktop\REduQuest.exe'
$iconPath = Join-Path $projectRoot 'assets\request.ico'
$restartScript = Join-Path $PSScriptRoot 'restart-request.ps1'

if (-not (Test-Path -LiteralPath $exePath)) { throw 'Build the desktop app first: npm run desktop:pack' }

$shell = New-Object -ComObject WScript.Shell
$launchPath = Join-Path $desktop 'REduQuest.lnk'
$launch = $shell.CreateShortcut($launchPath)
$launch.TargetPath = $exePath
$launch.WorkingDirectory = Split-Path -Parent $exePath
$launch.IconLocation = $iconPath + ',0'
$launch.Description = 'REduQuest desktop learning platform'
$launch.Save()

$restartPath = Join-Path $desktop 'REduQuest Restart.lnk'
$restart = $shell.CreateShortcut($restartPath)
$restart.TargetPath = 'powershell.exe'
$restart.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $restartScript + '"'
$restart.WorkingDirectory = $projectRoot
$restart.IconLocation = $iconPath + ',0'
$restart.Description = 'Restart REduQuest desktop application'
$restart.Save()

Write-Output $launchPath
Write-Output $restartPath

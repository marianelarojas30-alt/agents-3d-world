# Installs Agents World to start automatically on Windows login.
# Usage: right-click -> "Run with PowerShell" (or: powershell -ExecutionPolicy Bypass -File install-autostart-windows.ps1)
$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir "AgentsWorld.lnk"
$targetPath = Join-Path $projectDir "start.bat"

$WScriptShell = New-Object -ComObject WScript.Shell
$shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $projectDir
$shortcut.WindowStyle = 7  # minimized
$shortcut.Save()

Write-Host "Done. Agents World will open by itself next time you log in to Windows."
Write-Host "To remove it: delete this file -> $shortcutPath"

# Creates Desktop and Start Menu shortcuts for the RocksteadyBot launcher.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ProductName = "RocksteadyBot"
$launcher = Join-Path $PSScriptRoot "start-desktop.cmd"
$exeCandidates = @(
  (Join-Path $Root "apps\desktop\out\win-unpacked\RocksteadyBot.exe"),
  (Join-Path $Root "apps\desktop\out\win-unpacked\Rakazo.exe")
)

$icon = $launcher
foreach ($candidate in $exeCandidates) {
  if (Test-Path $candidate) {
    $icon = $candidate
    break
  }
}

$locations = @(
  [Environment]::GetFolderPath("Desktop"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
)

$shell = New-Object -ComObject WScript.Shell
foreach ($folder in $locations) {
  if (-not $folder -or -not (Test-Path $folder)) { continue }
  $path = Join-Path $folder "$ProductName.lnk"
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $launcher
  $shortcut.Arguments = ""
  $shortcut.WorkingDirectory = $Root
  $shortcut.WindowStyle = 1
  $shortcut.Description = "Start $ProductName"
  $shortcut.IconLocation = "$icon,0"
  $shortcut.Save()
  Write-Output "Created $path"
}

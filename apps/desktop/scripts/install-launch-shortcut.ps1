param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot
)

$desktop = [Environment]::GetFolderPath("Desktop")
if ([string]::IsNullOrWhiteSpace($desktop)) { exit 0 }

$cmd = Join-Path $RepoRoot "apps\desktop\scripts\launch-desktop.cmd"
if (-not (Test-Path -LiteralPath $cmd)) { exit 0 }

$lnkPath = Join-Path $desktop "RocksteadyBot Quick Launch.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $cmd
$shortcut.WorkingDirectory = $RepoRoot
$shortcut.WindowStyle = 1
$shortcut.Description = "Start RocksteadyBot without rebuilding"
$icon = Join-Path $RepoRoot "apps\desktop\assets\icon.ico"
if (Test-Path -LiteralPath $icon) {
  $shortcut.IconLocation = $icon
}
$shortcut.Save()

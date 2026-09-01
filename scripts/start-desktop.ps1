# Starts Docker, Postgres, and the local API/web stack if needed, then opens the desktop app.
param(
  [switch]$InstallShortcut
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ProductName = "RocksteadyBot"
$HealthUrl = "http://127.0.0.1:3100/health"
$WorkerHealthUrl = "http://127.0.0.1:3102/health"
$SupervisorHealthUrl = "http://127.0.0.1:7091/health"
$WebUrl = "http://127.0.0.1:5173"
$DockerWaitSeconds = 240
$PostgresWaitSeconds = 90
$StackWaitSeconds = 180
$LogDir = Join-Path $env:LOCALAPPDATA "rocksteadybot"
$ExeCandidates = @(
  (Join-Path $Root "apps\desktop\out\win-unpacked\RocksteadyBot.exe"),
  (Join-Path $Root "apps\desktop\out\win-unpacked\Rakazo.exe")
)

function Write-Step([string]$Message) {
  Write-Host $Message
  try {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Add-Content -Path (Join-Path $LogDir "start-desktop.log") -Value "$(Get-Date -Format o) $Message" -Encoding utf8
  } catch {
    # Ignore log I/O failures so startup can continue.
  }
}

function Show-Failure([string]$Message) {
  Write-Step $Message
  $shell = New-Object -ComObject WScript.Shell
  $null = $shell.Popup($Message, 0, $ProductName, 16)
}

function Test-HttpOk([string]$Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-JsonHealth([string]$Url) {
  try {
    $health = Invoke-RestMethod -Uri $Url -TimeoutSec 2
    return [bool]$health.ok
  } catch {
    return $false
  }
}

function Test-ApiHealth {
  return Test-JsonHealth $HealthUrl
}

function Test-WorkerHealth {
  return Test-JsonHealth $WorkerHealthUrl
}

function Test-SupervisorHealth {
  return Test-JsonHealth $SupervisorHealthUrl
}

function Test-WebUp {
  return Test-HttpOk $WebUrl
}

function Test-StackReady {
  return (Test-PostgresReady) -and (Test-ApiHealth) -and (Test-WebUp) -and (Test-SupervisorHealth) -and (Test-WorkerHealth)
}

function Test-PostgresReady {
  if (-not (Test-PortListening 5433)) { return $false }
  Initialize-DockerPath
  try {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $compose = Join-Path $Root "infra\compose\docker-compose.yml"
    $null = & docker compose --env-file .env -f $compose exec -T postgres pg_isready -U rakazo 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    if ($code -eq 0) { return $true }
  } catch {
    # Port 5433 is open; accept that when Docker CLI is not ready yet.
  }
  return $true
}

function Test-PortListening([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $connect = $client.ConnectAsync("127.0.0.1", $Port)
    $completed = $connect.Wait(250)
    $open = $completed -and $client.Connected
    $client.Close()
    return $open
  } catch {
    return $false
  }
}

function Get-DesktopExe {
  foreach ($candidate in $ExeCandidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

function Get-ElectronExe {
  $paths = @(
    (Join-Path $Root "apps\desktop\node_modules\electron\dist\electron.exe"),
    (Join-Path $Root "node_modules\electron\dist\electron.exe")
  )
  foreach ($candidate in $paths) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

function Test-SmartAppControl {
  try {
    $state = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy" -Name "VerifiedAndReputablePolicyState" -ErrorAction Stop).VerifiedAndReputablePolicyState
    return $state -eq 1
  } catch {
    return $false
  }
}

function Initialize-ForegroundWin32 {
  if ("RocksteadyBotWin32" -as [type]) { return }
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RocksteadyBotWin32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
}

function Show-ExistingApp {
  Initialize-ForegroundWin32
  $windows = Get-Process -Name "RocksteadyBot","electron" -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle }
  if (-not $windows) { return $false }
  foreach ($proc in $windows) {
    if ([RocksteadyBotWin32]::IsIconic($proc.MainWindowHandle)) {
      [RocksteadyBotWin32]::ShowWindowAsync($proc.MainWindowHandle, 9) | Out-Null
    }
    [RocksteadyBotWin32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
  }
  return $true
}

function Install-AppShortcut {
  $launcher = Join-Path $PSScriptRoot "start-desktop.cmd"
  $icon = Get-DesktopExe
  if (-not $icon) { $icon = $launcher }

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
  }
}

function Get-PnpmShimDir {
  return (Join-Path $env:LOCALAPPDATA "rocksteadybot\corepack-shims")
}

function Add-PathDir([string]$Directory) {
  if (-not $Directory -or -not (Test-Path $Directory)) { return }
  $parts = $env:PATH.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries)
  if ($parts -contains $Directory) { return }
  $env:PATH = "$Directory;$env:PATH"
}

function Initialize-Pnpm {
  $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
  $nodeDir = Join-Path $env:ProgramFiles "nodejs"
  Add-PathDir $nodeDir

  if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
    throw "Node.js / corepack is not available. Install Node.js 22+, then open $ProductName again."
  }

  $shimDir = Get-PnpmShimDir
  New-Item -ItemType Directory -Force -Path $shimDir | Out-Null

  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & corepack enable --install-directory $shimDir
  $enableCode = $LASTEXITCODE
  & corepack prepare pnpm@9.15.0 --activate
  $prepareCode = $LASTEXITCODE
  $ErrorActionPreference = $previous

  if ($enableCode -ne 0 -or $prepareCode -ne 0) {
    throw "Could not enable pnpm 9.15.0 via corepack."
  }

  Add-PathDir $shimDir
}

function Invoke-Pnpm {
  param(
    [Parameter(Mandatory, ValueFromRemainingArguments)]
    [string[]]$PnpmArgs
  )
  Initialize-Pnpm
  & pnpm @PnpmArgs
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm $($PnpmArgs -join ' ') failed."
  }
}

function Initialize-EnvFile {
  $envPath = Join-Path $Root ".env"
  if (Test-Path $envPath) { return }

  $example = Join-Path $Root ".env.example"
  if (-not (Test-Path $example)) {
    throw "Missing .env.example. Cannot create a local .env."
  }

  Write-Step "Creating .env with new local secrets..."
  $authSecret = -join ((1..48) | ForEach-Object { "{0:x2}" -f (Get-Random -Maximum 256) })
  $encryptionKey = -join ((1..32) | ForEach-Object { "{0:x2}" -f (Get-Random -Maximum 256) })
  $contents = Get-Content -Path $example -Raw
  $contents = $contents.Replace("replace-with-32-plus-character-secret", $authSecret)
  $contents = $contents.Replace("replace-with-64-char-hex-or-passphrase", $encryptionKey)
  Set-Content -Path $envPath -Value $contents -Encoding utf8
}

function Initialize-DockerPath {
  $bins = @(
    (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin"),
    (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\resources\bin")
  )
  foreach ($bin in $bins) {
    if ($bin -and (Test-Path (Join-Path $bin "docker.exe"))) {
      if (-not ($env:PATH.Split(";") -contains $bin)) {
        $env:PATH = "$bin;$env:PATH"
      }
      return
    }
  }
}

function Test-DockerReady {
  try {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $null = & docker info 2>&1
    $ErrorActionPreference = $previous
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Start-DockerDesktop {
  Initialize-DockerPath
  if (Test-DockerReady) { return }

  $desktopExe = @(
    (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe")
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

  if (-not $desktopExe) {
    throw "Docker Desktop is not installed. Install it, then open $ProductName again."
  }

  if (-not (Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue)) {
    Write-Step "Starting Docker Desktop..."
    Start-Process -FilePath $desktopExe | Out-Null
  } else {
    Write-Step "Waiting for Docker Engine..."
  }

  $deadline = (Get-Date).AddSeconds($DockerWaitSeconds)
  while ((Get-Date) -lt $deadline) {
    Initialize-DockerPath
    if (Test-DockerReady) { return }
    Start-Sleep -Seconds 3
  }

  throw "Docker Engine did not become ready. Open Docker Desktop, wait until it is running, then try again."
}

function Start-Postgres {
  Write-Step "Starting Postgres..."
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & docker compose --env-file .env -f infra/compose/docker-compose.yml up postgres -d
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous
  if ($code -ne 0) {
    throw "Could not start Postgres. Check Docker Desktop and try again."
  }
  Wait-PostgresReady
}

function Wait-PostgresReady {
  Write-Step "Waiting for Postgres..."
  $deadline = (Get-Date).AddSeconds($PostgresWaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PostgresReady) { return }
    Start-Sleep -Seconds 2
  }
  throw "Postgres did not become ready. Open Docker Desktop, then try $ProductName again."
}

function Test-ComputerImage {
  try {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $null = & docker image inspect rakazo/computer:local 2>&1
    $ErrorActionPreference = $previous
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Start-HiddenPowerShell([string]$WorkingDirectory, [string]$Command, [string]$LogName) {
  Initialize-Pnpm
  $shimDir = Get-PnpmShimDir
  $nodeDir = Join-Path $env:ProgramFiles "nodejs"
  $rootBin = Join-Path $Root "node_modules\.bin"
  $localBin = Join-Path $WorkingDirectory "node_modules\.bin"
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $log = Join-Path $LogDir $LogName
  $launch = Join-Path $LogDir "$LogName.launch.ps1"
  $script = @"
`$env:PATH = '$shimDir;$localBin;$rootBin;$nodeDir;' + `$env:PATH
`$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
Set-Location '$WorkingDirectory'
$Command *>> '$log'
"@
  Set-Content -Path $launch -Value $script -Encoding utf8
  $hidden = New-Object -ComObject WScript.Shell
  $null = $hidden.Run("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$launch`"", 0, $false)
}

function Start-ApiAndWorker {
  if (-not (Test-ApiHealth)) {
    Write-Step "Starting the API..."
    Start-HiddenPowerShell (Join-Path $Root "apps\api") "node --import tsx src/index.ts" "api.log"
  }
  if (-not (Test-WorkerHealth)) {
    Write-Step "Starting the worker..."
    Start-HiddenPowerShell (Join-Path $Root "apps\worker") "node --import tsx src/index.ts" "worker.log"
  }
}

function Start-Web {
  if (Test-WebUp) { return }
  Write-Step "Starting the web app..."
  Start-HiddenPowerShell (Join-Path $Root "apps\web") "pnpm exec vite" "web.log"
}

function Start-Supervisor {
  if (Test-SupervisorHealth) { return }
  Write-Step "Starting the sandbox supervisor..."
  Start-HiddenPowerShell (Join-Path $Root "infra\sandboxes\supervisor") "node --import tsx src/index.ts" "supervisor.log"
}

function Start-DevStack {
  # Do not call turbo.exe here. Windows Smart App Control blocks that unsigned binary
  # (Code Integrity 3077), which surfaces as `spawn UNKNOWN` and leaves the app unopened.
  Start-ApiAndWorker
  Start-Web
  Start-Supervisor
}

function Wait-StackReady {
  Write-Step "Waiting for the local stack..."
  $deadline = (Get-Date).AddSeconds($StackWaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-StackReady) { return }
    Start-Sleep -Seconds 2
  }
  throw "The local stack did not become ready. See $LogDir\start-desktop.log, $LogDir\api.log, $LogDir\worker.log, $LogDir\supervisor.log, and $LogDir\web.log."
}

function Start-DesktopProcess([string]$FileName, [string]$WorkingDirectory, [string[]]$Arguments = @()) {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $launch = Join-Path $LogDir "desktop.launch.cmd"
  $argLine = ($Arguments | ForEach-Object { "`"$_`"" }) -join " "
  $script = @"
@echo off
set RAKAZO_DISABLE_AUTO_UPDATE=1
set RAKAZO_DISABLE_BUNDLED_RENDERER=1
cd /d "$WorkingDirectory"
start "" "$FileName" $argLine
"@
  Set-Content -Path $launch -Value $script -Encoding ascii
  # `start` goes through ShellExecute so Smart App Control can show its prompt
  # instead of silently failing CreateProcess.
  $null = Start-Process -FilePath $launch -WorkingDirectory $WorkingDirectory -WindowStyle Hidden
}

function Start-DesktopApp {
  Write-Step "Opening the desktop app..."
  if (Show-ExistingApp) { return }

  $exe = Get-DesktopExe
  if ($exe) {
    Start-DesktopProcess $exe (Split-Path $exe)
    Start-Sleep -Seconds 3
    if (Show-ExistingApp) { return }
    Write-Step "The packaged app did not show a window. Trying Electron..."
  }

  $electron = Get-ElectronExe
  $desktopDir = Join-Path $Root "apps\desktop"
  if ($electron -and (Test-Path (Join-Path $desktopDir "dist\main.js"))) {
    Start-DesktopProcess $electron $desktopDir @(".")
    Start-Sleep -Seconds 3
    if (Show-ExistingApp) { return }
  }

  Initialize-Pnpm
  Start-HiddenPowerShell $desktopDir "pnpm dev" "desktop.log"
  Start-Sleep -Seconds 8
  if (Show-ExistingApp) { return }

  $hint = ""
  if (Test-SmartAppControl) {
    $hint = " Windows Smart App Control is on and may be blocking the unsigned app. If Windows showed a block notice, choose Run anyway, or turn Smart App Control off in Windows Security > App and browser control."
  }
  throw "The desktop app did not open.$hint See $LogDir\start-desktop.log and $LogDir\desktop.log."
}

$mutex = $null
$ownsMutex = $false
try {
  $mutex = New-Object System.Threading.Mutex($false, "Local\RocksteadyBotStartDesktop")
  $ownsMutex = $mutex.WaitOne(0)
  if (-not $ownsMutex) {
    Write-Step "Startup is already in progress."
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
      if ((Show-ExistingApp) -and (Test-StackReady)) { exit 0 }
      Start-Sleep -Seconds 2
    }
    throw "Startup is already running in another window. Wait for it to finish, or see $LogDir\start-desktop.log."
  }

  Write-Step $ProductName
  Install-AppShortcut
  if ($InstallShortcut) { exit 0 }

  if ((Show-ExistingApp) -and (Test-StackReady)) {
    Write-Step "Already running."
    exit 0
  }

  if (Test-StackReady) {
    Start-DesktopApp
    exit 0
  }

  Initialize-EnvFile
  Start-DockerDesktop

  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Step "Installing dependencies..."
    Invoke-Pnpm install
  }

  Start-Postgres

  if (-not (Test-Path (Join-Path $Root "packages\db\src\generated"))) {
    Write-Step "Generating the database client..."
    Invoke-Pnpm db:generate
  }

  Write-Step "Applying database migrations..."
  # On Windows, Prisma's schema-engine-windows.exe is often blocked by Smart App
  # Control (`spawn UNKNOWN`). @rakazo/db migrate falls back to Docker Postgres.
  Invoke-Pnpm db:migrate

  if (-not (Test-ComputerImage)) {
    Write-Step "Building the computer image (first time can take several minutes)..."
    Invoke-Pnpm sandbox:build
  }

  Start-DevStack
  Wait-StackReady
  Start-DesktopApp
} catch {
  Show-Failure $_.Exception.Message
  exit 1
} finally {
  if ($ownsMutex -and $mutex) {
    try { $mutex.ReleaseMutex() } catch { }
  }
  if ($mutex) { $mutex.Dispose() }
}

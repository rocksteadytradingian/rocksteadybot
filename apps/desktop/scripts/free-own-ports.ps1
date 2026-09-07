param(
  [int[]]$Ports = @(3100, 5173)
)

# Keep this in sync with isOwnStackProcess in apps/desktop/src/local-stack.ts.
function Test-OwnStackProcess([string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
  if ($CommandLine -match "docker-proxy|com\.docker|vpnkit|Docker Desktop") { return $false }
  if ($CommandLine -match '(^|[\\/])electron(\.exe)?(\s|$)' -and $CommandLine -notmatch "@rakazo/api") {
    return $false
  }
  return $CommandLine -match "@rakazo/(api|web|worker)" `
    -or $CommandLine -match "apps[\\/](api|web)[\\/]" `
    -or $CommandLine -match "pnpm.*--filter\s+@rakazo/(api|web|worker)" `
    -or ($CommandLine -match "vite" -and $CommandLine -match "rakazo|rckbot|rocksteady")
}

$listening = netstat -ano -p tcp
foreach ($port in $Ports) {
  $processIds = New-Object "System.Collections.Generic.HashSet[int]"
  foreach ($line in $listening) {
    if ($line -notmatch "LISTENING") { continue }
    $parts = $line.Trim() -split "\s+"
    if ($parts.Length -lt 5) { continue }
    $procId = 0
    if (-not [int]::TryParse($parts[-1], [ref]$procId) -or $procId -le 0) { continue }
    $local = $parts[1]
    $localPort = $null
    if ($local -match "\]:(\d+)$") { $localPort = [int]$Matches[1] }
    elseif ($local -match ":(\d+)$") { $localPort = [int]$Matches[1] }
    if ($localPort -eq $port) { [void]$processIds.Add($procId) }
  }
  foreach ($procId in $processIds) {
    $commandLine = $null
    try {
      $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction Stop).CommandLine
    } catch {
      continue
    }
    if (Test-OwnStackProcess $commandLine) {
      & taskkill /PID $procId /F >$null 2>&1
    }
  }
}

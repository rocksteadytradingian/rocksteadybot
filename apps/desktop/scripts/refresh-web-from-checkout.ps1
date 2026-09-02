param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot,
  [string]$Docker = "docker"
)

Set-Location -LiteralPath $RepoRoot
$compose = @("compose")
if (Test-Path -LiteralPath (Join-Path $RepoRoot ".env")) {
  $compose += @("--env-file", ".env")
}
$compose += @(
  "-f", "infra/compose/docker-compose.yml",
  "-f", "infra/compose/docker-compose.desktop.yml"
)

function Invoke-Compose {
  & $Docker @compose @args
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($args -join ' ') failed with exit $LASTEXITCODE"
  }
}

function Copy-Checkout([string]$HostPath, [string]$Destination) {
  $local = Join-Path $RepoRoot ($HostPath -replace "/\.$", "")
  if (-not (Test-Path -LiteralPath $local)) { return $false }
  Invoke-Compose cp $HostPath $Destination
  return $true
}

Write-Host "Copying the current sign-in page into Docker..."
$copied = Copy-Checkout "apps/web/src/." "web:/app/apps/web/src/"
[void](Copy-Checkout "apps/web/index.html" "web:/app/apps/web/index.html")
[void](Copy-Checkout "apps/web/vite.config.ts" "web:/app/apps/web/vite.config.ts")
[void](Copy-Checkout "apps/desktop/scripts/inject-forgot-password-fallback.mjs" "web:/tmp/inject-forgot-password-fallback.mjs")
foreach ($copy in @(
    @("apps/api/src/.", "api:/app/apps/api/src/"),
    @("packages/auth/src/.", "api:/app/packages/auth/src/"),
    @("packages/adapters/src/.", "api:/app/packages/adapters/src/")
  )) {
  try {
    [void](Copy-Checkout $copy[0] $copy[1])
  } catch {
    Write-Host "Skipped $($copy[0]): $_"
  }
}

if (-not $copied) {
  throw "Could not copy apps/web/src into the web container."
}

Invoke-Compose exec -T -u root web chown -R node:node /app/apps/web
try {
  Invoke-Compose exec -T -u root web node /tmp/inject-forgot-password-fallback.mjs
} catch {
  Write-Host "Could not inject the Forgot password fallback into the current preview."
}

Write-Host "Rebuilding the web app inside Docker..."
try {
  Invoke-Compose exec -T -u node web bash -lc "RAKAZO_ALLOW_DEV_SECRETS=1 pnpm --filter @rakazo/web build"
} catch {
  Write-Host "Web rebuild failed; restarting with the copied files and fallback link."
}

Invoke-Compose restart web
try {
  Invoke-Compose restart api
} catch {
  Write-Host "API restart skipped."
}

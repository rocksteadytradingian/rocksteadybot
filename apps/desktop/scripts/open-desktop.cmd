@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..\..") do set "ROOT=%%~fI"
cd /d "%ROOT%" || (
  echo Could not open the RocksteadyBot checkout.
  exit /b 1
)

set "COMPOSE_FILE=infra\compose\docker-compose.yml"
set "DESKTOP_COMPOSE=infra\compose\docker-compose.desktop.yml"
set "DOCKER=docker"
if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" (
  set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
)

"%DOCKER%" info >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    echo Starting Docker Desktop...
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    set /a _tries=0
    :wait_docker
    timeout /t 2 /nobreak >nul
    "%DOCKER%" info >nul 2>&1
    if not errorlevel 1 goto docker_ready
    set /a _tries+=1
    if !_tries! LSS 45 goto wait_docker
  )
  echo Docker Desktop is not running. Start it, then open this shortcut again.
  exit /b 1
)

:docker_ready
findstr /C:"Forgot password?" "apps\web\src\pages\Auth.tsx" >nul
if errorlevel 1 (
  echo This checkout does not contain Forgot password.
  echo In PowerShell run:
  echo   cd /d "%ROOT%"
  echo   git pull
  echo Then open this shortcut again.
  pause
  exit /b 1
)
findstr /C:"auth-origin" "apps\web\index.html" >nul
if errorlevel 1 (
  echo This checkout is missing the current sign-in page.
  echo In PowerShell run:
  echo   cd /d "%ROOT%"
  echo   git pull
  echo Then open this shortcut again.
  pause
  exit /b 1
)

rem PowerShell is optional. Windows Smart App Control often blocks it; Docker is enough.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%free-own-ports.ps1" >nul 2>&1

set "COMPOSE_ENV="
if exist "%ROOT%\.env" set "COMPOSE_ENV=--env-file .env"

echo Starting RocksteadyBot...
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" up -d --remove-orphans
if errorlevel 1 (
  curl.exe -s -o NUL -w "%%{http_code}" "http://127.0.0.1:5173/" | findstr /x "200" >nul
  if errorlevel 1 (
    echo Docker Compose could not start. Close whatever is using port 5173, then try again.
    exit /b 1
  )
)

echo Rebuilding the sign-in page from this checkout. This can take a few minutes...
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" up -d --force-recreate --no-deps web
if errorlevel 1 (
  echo Docker could not rebuild the sign-in page.
  "%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" logs --tail 80 web
  exit /b 1
)
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" up -d --force-recreate --no-deps api

set /a _wait=0
:wait_health
set "CODE="
for /f %%C in ('curl.exe -s -o NUL -w "%%{http_code}" "http://127.0.0.1:5173/rpc/health"') do set "CODE=%%C"
if "!CODE!"=="200" goto healthy
for /f %%C in ('curl.exe -s -o NUL -w "%%{http_code}" -X POST "http://127.0.0.1:5173/rpc/health" -H "content-type: application/json" -d "{\"json\":{}}"') do set "CODE=%%C"
if "!CODE!"=="200" goto healthy
timeout /t 2 /nobreak >nul
set /a _wait+=1
if !_wait! LSS 90 goto wait_health
echo Sign-in cannot reach the API through http://127.0.0.1:5173.
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" ps
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" logs --tail 40 api
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" logs --tail 40 web
echo Start Docker Desktop, then open this shortcut again.
exit /b 1

:healthy
curl.exe -s "http://127.0.0.1:5173/sign-in" | findstr /C:"auth-origin" >nul
if errorlevel 1 (
  echo Sign-in is still the old page. Web logs:
  "%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" logs --tail 80 web
  exit /b 1
)
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" exec -T web grep -R "Can't reach the server." /app/apps/web/dist >nul
if errorlevel 1 (
  echo Sign-in still has the old error text. Web logs:
  "%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" logs --tail 80 web
  exit /b 1
)

set "ELECTRON="
if exist "%ROOT%\node_modules\electron\dist\electron.exe" set "ELECTRON=%ROOT%\node_modules\electron\dist\electron.exe"
if not defined ELECTRON if exist "%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe" (
  set "ELECTRON=%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe"
)

if defined ELECTRON if not exist "%ROOT%\apps\desktop\dist\main.js" (
  echo Building the desktop app...
  npx --yes pnpm@9.15.0 --config.engine-strict=false --filter @rakazo/desktop build >nul 2>&1
)

rem Do not let a stale Electron rebuild Compose onto the previous image.
set "RAKAZO_WEB_URL=http://127.0.0.1:5173"
set "RAKAZO_DISABLE_LOCAL_STACK=1"
set "RAKAZO_PERFORMANCE_CLEAR_CACHE=1"

if defined ELECTRON if exist "%ROOT%\apps\desktop\dist\main.js" (
  start "" /D "%ROOT%\apps\desktop" "!ELECTRON!" .
) else (
  start "" "http://127.0.0.1:5173/sign-in"
)

cscript //nologo "%SCRIPT_DIR%install-desktop-shortcut.vbs" "%ROOT%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-desktop-shortcut.ps1" -RepoRoot "%ROOT%" >nul 2>&1
exit /b 0

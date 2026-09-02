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
  goto fail
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
    goto fail
  )
)

echo Rebuilding the sign-in page from this checkout. This can take a few minutes...
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" up -d --force-recreate --no-deps web
if errorlevel 1 (
  echo Docker could not rebuild the sign-in page.
  "%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" logs --tail 80 web
  goto fail
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
goto fail

:healthy
curl.exe -s "http://127.0.0.1:5173/sign-in" | findstr /C:"auth-origin" >nul
if errorlevel 1 (
  echo Warning: sign-in page may still be rebuilding.
)
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" exec -T web grep -R "Can't reach the server." /app/apps/web/dist >nul

set "APP_URL=http://127.0.0.1:5173/sign-in"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME_X86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "EDGE_X86=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "RAKAZO_WEB_URL=http://127.0.0.1:5173"
set "RAKAZO_DISABLE_LOCAL_STACK=1"
set "RAKAZO_PERFORMANCE_CLEAR_CACHE=1"

set "ELECTRON="
if exist "%ROOT%\node_modules\electron\dist\electron.exe" set "ELECTRON=%ROOT%\node_modules\electron\dist\electron.exe"
if not defined ELECTRON if exist "%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe" (
  set "ELECTRON=%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe"
)

if defined ELECTRON if not exist "%ROOT%\apps\desktop\dist\main.js" (
  echo Building the desktop app...
  npx --yes pnpm@9.15.0 --config.engine-strict=false --filter @rakazo/desktop build >nul 2>&1
)

rem cmd.exe ignores a chained else when the first IF is false, so Electron-missing
rem must fall through to Chrome/Edge rather than using "if defined ELECTRON ... else".
if defined ELECTRON (
  if exist "%ROOT%\apps\desktop\dist\main.js" (
    echo Opening the desktop window...
    start "" /D "%ROOT%\apps\desktop" "!ELECTRON!" .
    goto opened
  )
)
if exist "!CHROME!" (
  echo Opening RocksteadyBot...
  start "" "!CHROME!" --app=!APP_URL!
  goto opened
)
if exist "!CHROME_X86!" (
  echo Opening RocksteadyBot...
  start "" "!CHROME_X86!" --app=!APP_URL!
  goto opened
)
if exist "!EDGE!" (
  echo Opening RocksteadyBot...
  start "" "!EDGE!" --app=!APP_URL!
  goto opened
)
if exist "!EDGE_X86!" (
  echo Opening RocksteadyBot...
  start "" "!EDGE_X86!" --app=!APP_URL!
  goto opened
)
echo Opening RocksteadyBot in the browser...
start "" "!APP_URL!"

:opened
cscript //nologo "%SCRIPT_DIR%install-desktop-shortcut.vbs" "%ROOT%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-desktop-shortcut.ps1" -RepoRoot "%ROOT%" >nul 2>&1
exit /b 0

:fail
echo.
pause
exit /b 1

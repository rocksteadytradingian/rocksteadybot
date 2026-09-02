@echo off
rem Fast path: start the existing stack and open the desktop app.
rem No image rebuild and no forced container recreate. Use open-desktop.cmd
rem (the "RocksteadyBot" shortcut) after pulling changes or when something is broken.
setlocal EnableExtensions EnableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..\..") do set "ROOT=%%~fI"
cd /d "%ROOT%" || (
  echo Could not open the RocksteadyBot checkout.
  exit /b 1
)

set "COMPOSE_FILE=infra\compose\docker-compose.yml"
set "DESKTOP_COMPOSE=infra\compose\docker-compose.desktop.yml"
set "LOG=%ROOT%\apps\desktop\desktop-launch.log"
set "DOCKER=docker"
if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" (
  set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
)

echo ===== %DATE% %TIME% (quick launch) =====>> "%LOG%"

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
set "COMPOSE_ENV="
if exist "%ROOT%\.env" set "COMPOSE_ENV=--env-file .env"

echo Starting RocksteadyBot...
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" up -d --remove-orphans
if errorlevel 1 (
  curl.exe -s -o NUL -w "%%{http_code}" "http://127.0.0.1:5173/" | findstr /x "200" >nul
  if errorlevel 1 (
    echo Docker Compose could not start. Open the "RocksteadyBot" shortcut to rebuild, or close whatever is using port 5173.
    goto fail
  )
)

rem Build the Electron shell only if it is missing; otherwise reuse the last build.
set "ELECTRON="
if exist "%ROOT%\node_modules\electron\dist\electron.exe" set "ELECTRON=%ROOT%\node_modules\electron\dist\electron.exe"
if not defined ELECTRON if exist "%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe" (
  set "ELECTRON=%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe"
)
set "NEED_BUILD="
if not defined ELECTRON set "NEED_BUILD=1"
if not exist "%ROOT%\apps\desktop\dist\main.js" set "NEED_BUILD=1"
if not exist "%ROOT%\apps\desktop\dist\preload.cjs" set "NEED_BUILD=1"
if not exist "%ROOT%\apps\desktop\dist\setup.html" set "NEED_BUILD=1"
if defined NEED_BUILD (
  echo Desktop app not built yet. Preparing it once...
  call "%SCRIPT_DIR%ensure-desktop.cmd" "%ROOT%"
  if errorlevel 1 goto fail
  if not defined ELECTRON (
    if exist "%ROOT%\node_modules\electron\dist\electron.exe" set "ELECTRON=%ROOT%\node_modules\electron\dist\electron.exe"
    if not defined ELECTRON if exist "%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe" set "ELECTRON=%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe"
  )
)
if not defined ELECTRON (
  echo The desktop app is not installed. Open the "RocksteadyBot" shortcut once to install it.
  goto fail
)

set "RAKAZO_WEB_URL=http://127.0.0.1:5173/sign-in"
set "RAKAZO_REPO_ROOT=%ROOT%"
set "RAKAZO_DISABLE_LOCAL_STACK=1"
set "RAKAZO_PERFORMANCE_CLEAR_CACHE=1"
set "ELECTRON_ENABLE_LOGGING=1"

set /a _wait=0
:wait_health
set "CODE="
for /f %%C in ('curl.exe -s -o NUL -w "%%{http_code}" "http://127.0.0.1:5173/rpc/health"') do set "CODE=%%C"
if "!CODE!"=="200" goto launch
for /f %%C in ('curl.exe -s -o NUL -w "%%{http_code}" -X POST "http://127.0.0.1:5173/rpc/health" -H "content-type: application/json" -d "{\"json\":{}}"') do set "CODE=%%C"
if "!CODE!"=="200" goto launch
set /a _wait+=1
if !_wait! EQU 1 echo Waiting for the stack at http://127.0.0.1:5173 ...
timeout /t 2 /nobreak >nul
if !_wait! LSS 40 goto wait_health
echo The stack did not answer on http://127.0.0.1:5173. Try the "RocksteadyBot" shortcut to rebuild.
"%DOCKER%" compose !COMPOSE_ENV! -f "%COMPOSE_FILE%" -f "%DESKTOP_COMPOSE%" ps
echo Opening the desktop window anyway.

:launch
echo Opening the desktop window...
echo Leave this window open while you use the app.
cd /d "%ROOT%\apps\desktop" || goto fail
"!ELECTRON!" .
set "ERR=!ERRORLEVEL!"
cd /d "%ROOT%"
echo Electron exited !ERR! (quick launch)>> "%LOG%"
if not "!ERR!"=="0" (
  echo The desktop window closed with error !ERR!.
  echo See apps\desktop\desktop-launch.log
  goto fail
)
exit /b 0

:fail
echo.
echo A log is at apps\desktop\desktop-launch.log
pause
exit /b 1

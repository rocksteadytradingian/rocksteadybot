@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~1"
if "%ROOT%"=="" (
  for %%I in ("%~dp0..\..\..") do set "ROOT=%%~fI"
)
cd /d "%ROOT%" || exit /b 1

set "PF86=%ProgramFiles(x86)%"
set "ELECTRON="
if exist "%ROOT%\node_modules\electron\dist\electron.exe" set "ELECTRON=%ROOT%\node_modules\electron\dist\electron.exe"
if not defined ELECTRON if exist "%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe" (
  set "ELECTRON=%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe"
)

set "NODE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "!PF86!\nodejs\node.exe" set "NODE=!PF86!\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE (
  for /f "delims=" %%I in ('where node 2^>nul') do (
    set "NODE=%%I"
    goto got_node
  )
)

:got_node
if not defined ELECTRON (
  echo Installing the desktop app. This can take several minutes...
  if not defined NODE (
    echo Node.js is not installed. Trying winget...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
    if not defined NODE if exist "!PF86!\nodejs\node.exe" set "NODE=!PF86!\nodejs\node.exe"
  )
  if not defined NODE (
    echo Could not install Node.js. Install the LTS build from https://nodejs.org then open this shortcut again.
    exit /b 1
  )
  call :build_desktop
  if errorlevel 1 exit /b 1
) else (
  if defined NODE (
    echo Updating the desktop app from this checkout...
    call :build_desktop
    if errorlevel 1 exit /b 1
  )
)

if exist "%ROOT%\node_modules\electron\dist\electron.exe" if exist "%ROOT%\apps\desktop\dist\main.js" if exist "%ROOT%\apps\desktop\dist\preload.cjs" if exist "%ROOT%\apps\desktop\dist\setup.html" exit /b 0
if exist "%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe" if exist "%ROOT%\apps\desktop\dist\main.js" if exist "%ROOT%\apps\desktop\dist\preload.cjs" if exist "%ROOT%\apps\desktop\dist\setup.html" exit /b 0
echo Electron was not installed into this checkout.
exit /b 1

:build_desktop
for %%I in ("!NODE!") do set "NODE_DIR=%%~dpI"
set "NPX=!NODE_DIR!npx.cmd"
if not exist "!NPX!" set "NPX=!NODE_DIR!npx.exe"
if not exist "!NPX!" (
  echo npx was not found next to Node.js at !NODE_DIR!
  exit /b 1
)
echo Using Node at !NODE!
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
set "npm_config_engine_strict=false"
if not exist "%ROOT%\node_modules\electron\dist\electron.exe" if not exist "%ROOT%\apps\desktop\node_modules\electron\dist\electron.exe" (
  "!NPX!" --yes pnpm@9.15.0 --config.engine-strict=false install --filter @rakazo/desktop...
  if errorlevel 1 (
    echo pnpm install failed. Check the output above.
    exit /b 1
  )
)
"!NPX!" --yes pnpm@9.15.0 --config.engine-strict=false --filter @rakazo/desktop build
if errorlevel 1 (
  echo The desktop app failed to build. Check the output above.
  exit /b 1
)
exit /b 0

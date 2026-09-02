@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..\..") do set "ROOT=%%~fI"
cd /d "%ROOT%" || (
  echo Could not open the RocksteadyBot checkout.
  exit /b 1
)

set "EMAIL=%~1"
set "PASSWORD=%~2"
if "%EMAIL%"=="" goto usage
if "%PASSWORD%"=="" goto usage

set "DOCKER=docker"
if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" (
  set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
)

"%DOCKER%" info >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is not running. Start it, then try again.
  exit /b 1
)

set "COMPOSE_ENV="
if exist "%ROOT%\.env" set "COMPOSE_ENV=--env-file .env"

"%DOCKER%" compose %COMPOSE_ENV% -f infra\compose\docker-compose.yml -f infra\compose\docker-compose.desktop.yml exec -T api pnpm --config.engine-strict=false auth:set-password --email "%EMAIL%" --password "%PASSWORD%"
exit /b %ERRORLEVEL%

:usage
echo Usage: set-password.cmd you@example.com new-password
echo Password must be at least 8 characters.
echo This uses Docker. You do not need pnpm on Windows.
exit /b 1

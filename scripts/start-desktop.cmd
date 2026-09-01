@echo off
title RocksteadyBot
cd /d "%~dp0\.."
echo Starting RocksteadyBot...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-desktop.ps1"
if errorlevel 1 pause

@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
bun "%SCRIPT_DIR%..\src\cli.ts" %*
exit /b %ERRORLEVEL%

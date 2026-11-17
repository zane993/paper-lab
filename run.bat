@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title 善驮论文工坊 v0.2.0 启动器
set "PORT=8777"

echo ============================================
echo   善驮论文工坊 v0.2.0  本地试用
echo ============================================
echo.

rem --- 1. 探测可用的 Python（排除 Windows 应用商店占位程序） ---
set "PY="
call :detect python
if not defined PY call :detect py
if defined PY goto :runpy
goto :runps

:runpy
echo [启动] 检测到 Python，使用内置 http.server
start "善驮论文工坊服务器" /min %PY% -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0."
timeout /t 2 >nul
start "" "http://127.0.0.1:%PORT%/"
echo.
echo [提示] 服务器在最小化的命令行窗口中运行，关闭该窗口即停止服务。
echo [提示] 若浏览器显示无法访问，可能是端口 %PORT% 被占用，请关闭占用程序后重试。
echo.
pause
exit /b 0

:runps
echo [启动] 未检测到可用的 Python，改用 Windows 内置 PowerShell 服务器（无需安装任何东西）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port %PORT% -Open
if errorlevel 1 (
  echo.
  echo [回退] 本地服务器未能启动，改为直接用文件方式打开。
  echo        该方式下部分浏览器不允许网页保存数据，建议改用 run.bat 的服务器模式。
  echo.
  start "" "%~dp0index.html"
  pause
)
exit /b 0

rem --- 子程序：验证某命令是否为可用的 Python ---
:detect
set "TMPV="
for /f "delims=" %%V in ('%~1 -c "print(123)" 2^>nul') do set "TMPV=%%V"
if "%TMPV%"=="123" set "PY=%~1"
exit /b 0

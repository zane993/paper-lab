@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 善驮论文工坊 安装程序
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause

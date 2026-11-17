@echo off
chcp 65001 >nul
title 善驮论文工坊 卸载
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
echo.
pause

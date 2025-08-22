@echo off
cd /d %~dp0


setlocal enabledelayedexpansion

rem 生成随机UUID
set CHARS=0123456789abcdef
set UUID=
for /l %%i in (1,1,32) do (
    set /a IDX=!random! %% 16
    for %%j in (!IDX!) do set UUID=!UUID!!CHARS:~%%j,1!
)

:: 启动Python脚本并设置窗口标题为随机UUID
start python "%~dp0\Spoofer.py"
title %UUID%

python "%~dp0\HaoP.py"


endlocal

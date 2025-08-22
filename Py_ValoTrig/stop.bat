@echo off
echo 正在结束所有 py.exe 和 python.exe 进程...

taskkill /f /im py.exe
taskkill /f /im python.exe

if %errorlevel%==0 (
    echo 所有 py.exe 和 python.exe 进程已成功结束。
) else (
    echo 未能找到或结束 py.exe 和 python.exe 进程。
)

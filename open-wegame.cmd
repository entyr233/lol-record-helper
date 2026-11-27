@echo off
setlocal
set "edge=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%edge%" set "edge=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%edge%" set "edge=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if not exist "%edge%" (
    echo Microsoft Edge could not be found.
    pause
    exit /b 1
)
if not defined LOCALAPPDATA exit /b 1
start "" "%edge%" --user-data-dir="%LOCALAPPDATA%\lol-tft\EdgeProfile" --restore-last-session --no-first-run "https://www.wegame.com.cn/helper/lol/"

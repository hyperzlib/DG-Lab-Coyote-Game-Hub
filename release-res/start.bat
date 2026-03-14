@echo off
cd /d "%~dp0"

bin\node.exe server/index.js %*

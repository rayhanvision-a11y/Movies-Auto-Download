@echo off
title Movies Auto Download Server
echo ====================================================
echo 🎬 Starting Movies Auto Download Server...
echo ====================================================
cd /d "%~dp0"

:: Open default web browser at localhost:5000
start "" http://localhost:5000

:: Run Node.js App
node index.js

pause

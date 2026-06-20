@echo off
:: Change directory to the folder where this batch file is located
cd /d "%~dp0"

echo ==============================================
echo       MonitorLocal Scanner Launcher
echo ==============================================
echo.

:: 1. Check for node_modules
if not exist node_modules (
    echo [!] Node modules not found. Installing dependencies...
    echo     Please wait, this may take a moment...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies. Make sure Node.js is installed.
        pause
        exit /b %errorlevel%
    )
    echo [-] Dependencies installed successfully.
)

:: 2. Check for serviceAccountKey.json
if not exist serviceAccountKey.json (
    echo [WARNING] serviceAccountKey.json not found in this folder.
    echo           Please place your Firebase key file here before running.
    echo.
)

:: 3. Check for config.json
if not exist config.json (
    echo [WARNING] config.json not found. Creating default template...
    echo { "userId": "REPLACE_WITH_YOUR_FIREBASE_UID" } > config.json
    echo           Please edit config.json and paste your UID.
    echo.
)

:: 4. Start the scanner in the background (hidden)
echo [-] Launching scanner in background (invisible mode)...
start "" wscript.exe run-hidden.vbs

echo.
echo [-] SUCCESS: The scanner is running in the background.
echo     You can close this command window now.
echo     To stop the scanner, end "Node.js JavaScript Runtime" (node.exe) in Task Manager.
echo.
pause

@echo off
echo ======================================
echo Installing Dependencies
echo ======================================
echo.

cd /d "%~dp0"

echo Installing npm dependencies...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ npm install failed!
    pause
    exit /b 1
)

echo.
echo ✅ Dependencies installed successfully!
echo.
echo You can now run:
echo   npm run dev     - Start development server
echo   npm run build   - Build for production
echo.
pause

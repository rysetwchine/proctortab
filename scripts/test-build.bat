@echo off
echo Testing build...
cd /d "%~dp0"

REM First ensure dependencies are installed
echo Checking dependencies...
npm ls pdfjs-dist tesseract.js 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing missing dependencies...
    call npm install pdfjs-dist@^4.11.0 tesseract.js@^5.1.0
)

echo.
echo Building project...
call npm run build

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Build successful!
) else (
    echo.
    echo ❌ Build failed - check errors above
)
pause

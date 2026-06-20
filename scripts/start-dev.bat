@echo off
REM Start dev server with proper error handling

cd /d C:\Users\Userr\Desktop\proctortab

echo Checking for syntax errors...
npm run build

if errorlevel 1 (
  echo.
  echo SYNTAX ERROR DETECTED - Cannot build
  pause
  exit /b 1
)

echo.
echo Build successful! Starting dev server...
echo.
npm run dev

pause

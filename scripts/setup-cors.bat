@echo off
REM Firebase CORS Configuration for Windows
REM This batch file applies the CORS configuration to your Firebase Storage bucket

echo.
echo ============================================
echo Firebase CORS Configuration Setup
echo ============================================
echo.

REM Check if gsutil is installed
where gsutil >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: gsutil not found!
    echo.
    echo Please install Google Cloud SDK:
    echo 1. Download from: https://cloud.google.com/sdk/docs/install
    echo 2. Run the installer
    echo 3. Run this script again
    echo.
    pause
    exit /b 1
)

echo [1/3] Authenticating with Google Cloud...
gcloud auth login
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Authentication failed
    pause
    exit /b 1
)

echo.
echo [2/3] Setting project to shifting-tab-detector...
gcloud config set project shifting-tab-detector
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to set project
    pause
    exit /b 1
)

echo.
echo [3/3] Applying CORS configuration...
echo Trying bucket: shifting-tab-detector.firebasestorage.app
gsutil cors set cors.json gs://shifting-tab-detector.firebasestorage.app
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo WARN: Failed on firebasestorage.app. Trying fallback bucket: shifting-tab-detector.appspot.com
    gsutil cors set cors.json gs://shifting-tab-detector.appspot.com
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to apply CORS configuration to both buckets
        pause
        exit /b 1
    )
)

echo.
echo ============================================
echo SUCCESS! CORS Configuration Applied
echo ============================================
echo.
echo Verifying configuration...
echo Trying to verify on firebasestorage.app (if it exists)...
gsutil cors get gs://shifting-tab-detector.firebasestorage.app
echo.
echo Trying to verify on appspot.com (if it exists)...
gsutil cors get gs://shifting-tab-detector.appspot.com
echo.
echo You can now:
echo 1. Start your dev server: npm run dev
echo 2. Go to https://localhost:8080
echo 3. Upload files to courses
echo.
pause

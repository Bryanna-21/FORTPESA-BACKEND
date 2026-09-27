@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo Fortpesa Payment Platform - Verification
echo ================================================
where node >nul 2>nul || (echo ERROR: Node.js is not installed. Install Node.js 20+ first.&pause&exit /b 1)
node --version
call npm install
if errorlevel 1 (echo ERROR: npm install failed.&pause&exit /b 1)
call npm run prisma:generate
if errorlevel 1 (echo ERROR: Prisma client generation failed.&pause&exit /b 1)
call npm run typecheck
if errorlevel 1 (echo ERROR: TypeScript typecheck failed.&pause&exit /b 1)
call npm run lint
if errorlevel 1 (echo ERROR: ESLint failed.&pause&exit /b 1)
echo.
echo Verification completed successfully.
pause

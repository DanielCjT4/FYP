@echo off
echo ==========================================
echo Starting Decentralized Bug Bounty Platform
echo ==========================================
echo.

echo [1/4] Starting Local Blockchain (Hardhat)...
start "Hardhat Node" cmd /k "npx hardhat node"
echo Waiting 15 seconds for the blockchain to boot up...
timeout /t 15 /nobreak >nul

echo.
echo [2/4] Deploying Smart Contract...
if exist "ignition\deployments\chain-1337" rmdir /s /q "ignition\deployments\chain-1337"
echo y | call npx hardhat ignition deploy ./ignition/modules/VulnerabilityPlatform.js --network localhost

echo.
echo [3/4] Seeding test accounts and data...
call npx hardhat run scripts/seed.js --network localhost

echo.
echo [4/4] Starting Next.js Website...
start "Next.js Frontend" cmd /k "npm run dev"

echo.
echo ==========================================
echo All systems go! 
echo Accounts seeded: Alice (Researcher), CyberCorp (Org), Judge (Validator)
echo Opening your browser to http://localhost:3000...
echo ==========================================
timeout /t 3 /nobreak >nul
start http://localhost:3000


# ============================================================
# Fleet ERP - Financial Report Fix Commands
# ============================================================
# Run each command one by one in PowerShell from C:\Fleet-ERP

# ---- Step 1: Backup original files ----
Copy-Item C:\Fleet-ERP\client\src\pages\FinancialReport.jsx C:\Fleet-ERP\client\src\pages\FinancialReport.jsx.backup
Copy-Item C:\Fleet-ERP\server\database-pg.js C:\Fleet-ERP\server\database-pg.js.backup

# ---- Step 2: Find the start and end line of getFinancialReport in database-pg.js ----
$startLine = (Select-String -Path C:\Fleet-ERP\server\database-pg.js -Pattern "export async function getFinancialReport").LineNumber
Write-Host "getFinancialReport starts at line: $startLine"

# ---- Step 3: Replace getFinancialReport function in database-pg.js ----
# Read the new function from the downloaded file
$newFunction = Get-Content -Path .\database-pg-getFinancialReport.js -Raw

# Read the original file
$original = Get-Content -Path C:\Fleet-ERP\server\database-pg.js -Raw

# Find and replace the old function
$pattern = '(?s)export async function getFinancialReport\(\).*?^}\s*$'
$replaced = $original -replace $pattern, $newFunction

# Write back
$replaced | Set-Content -Path C:\Fleet-ERP\server\database-pg.js -NoNewline
Write-Host "database-pg.js updated successfully!"

# ---- Step 4: Replace FinancialReport.jsx ----
Copy-Item .\FinancialReport.jsx C:\Fleet-ERP\client\src\pages\FinancialReport.jsx -Force
Write-Host "FinancialReport.jsx updated successfully!"

# ---- Step 5: Rebuild and Deploy ----
# If using Vercel + GitHub:
# cd C:\Fleet-ERP
# git add .
# git commit -m "Fix: Financial report calculations - corrected salary, removed partsDev duplication, added WO/project counts"
# git push

Write-Host ""
Write-Host "=========================================="
Write-Host "Done! Now push to GitHub to deploy."
Write-Host "=========================================="

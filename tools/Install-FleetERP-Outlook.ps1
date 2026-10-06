# Fleet ERP - Outlook Desktop integration installer
# Put this file in the same folder as FleetERP-Outlook.ps1 and run it once.

$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'FleetERP'
$source = Join-Path $PSScriptRoot 'FleetERP-Outlook.ps1'
$scriptPath = Join-Path $installDir 'FleetERP-Outlook.ps1'

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path $source -Destination $scriptPath -Force

$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $scriptPath + '" "%1"'
New-Item -Path 'HKCU:\Software\Classes\fleeterp-outlook' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\fleeterp-outlook' -Name '(Default)' -Value 'Fleet ERP Outlook'
Set-ItemProperty -Path 'HKCU:\Software\Classes\fleeterp-outlook' -Name 'URL Protocol' -Value ''
New-Item -Path 'HKCU:\Software\Classes\fleeterp-outlook\shell\open\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\fleeterp-outlook\shell\open\command' -Name '(Default)' -Value $command

Write-Host ''
Write-Host 'Fleet ERP Outlook integration installed successfully.' -ForegroundColor Green
Write-Host 'Use the Fleet ERP Open Outlook Email button now.'
# Fleet ERP - Outlook Desktop integration installer
# Run this PowerShell file once on each Windows PC that uses the ERP.

$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'FleetERP'
$scriptPath = Join-Path $installDir 'FleetERP-Outlook.ps1'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$helper = @'
param([Parameter(Mandatory=$true)][string]$Uri)
$prefix = 'fleeterp-outlook://open/'
if (-not $Uri.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { exit 1 }
$payload = $Uri.Substring($prefix.Length).Split('?')[0].Split('#')[0]
$payload = $payload.Replace('-', '+').Replace('_', '/')
while (($payload.Length % 4) -ne 0) { $payload += '=' }
try { $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json } catch { exit 2 }
try {
  $outlook = New-Object -ComObject Outlook.Application
  $mail = $outlook.CreateItem(0)
  $mail.BodyFormat = 2
  $mail.To = [string]$json.to
  $mail.Subject = [string]$json.subject
  $mail.HTMLBody = [string]$json.html
  $mail.Display()
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Fleet ERP could not open Outlook.`r`n`r`n$($_.Exception.Message)", "Fleet ERP - Outlook") | Out-Null
  exit 3
}
'@
Set-Content -Path $scriptPath -Value $helper -Encoding UTF8

$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $scriptPath + '" "%1"'
New-Item -Path 'HKCU:\Software\Classes\fleeterp-outlook' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\fleeterp-outlook' -Name '(Default)' -Value 'Fleet ERP Outlook'
Set-ItemProperty -Path 'HKCU:\Software\Classes\fleeterp-outlook' -Name 'URL Protocol' -Value ''
New-Item -Path 'HKCU:\Software\Classes\fleeterp-outlook\shell\open\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\fleeterp-outlook\shell\open\command' -Name '(Default)' -Value $command
Write-Host 'Fleet ERP Outlook integration installed successfully.' -ForegroundColor Green
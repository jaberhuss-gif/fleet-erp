param(
  [Parameter(Mandatory=$true)]
  [string]$Uri
)

$prefix = 'fleeterp-outlook://open/'
if (-not $Uri.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { exit 1 }

$payload = $Uri.Substring($prefix.Length).Split('?')[0].Split('#')[0]
$payload = $payload.Replace('-', '+').Replace('_', '/')
while (($payload.Length % 4) -ne 0) { $payload += '=' }

try {
  $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
} catch { exit 2 }

try {
  $outlook = New-Object -ComObject Outlook.Application
  $mail = $outlook.CreateItem(0)
  $mail.BodyFormat = 2
  $mail.To = [string]$json.to
  if ($json.cc) { $mail.CC = [string]$json.cc }
  $mail.Subject = [string]$json.subject
  $mail.HTMLBody = [string]$json.html
  $mail.Display()
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Fleet ERP could not open Outlook.`r`n`r`n$($_.Exception.Message)", "Fleet ERP - Outlook") | Out-Null
  exit 3
}
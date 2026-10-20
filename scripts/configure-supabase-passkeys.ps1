param([switch]$Apply, [string]$RpId, [string[]]$Origins)
$ErrorActionPreference = 'Stop'
# Use the CLI credential in memory; never print or write the management token.
$taskToken = $env:SUPABASE_ACCESS_TOKEN
if (-not $taskToken) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RmcPasskeyCredential {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public UInt32 Flags, Type; public string TargetName, Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize; public IntPtr CredentialBlob;
    public UInt32 Persist, AttributeCount; public IntPtr Attributes;
    public string TargetAlias, UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool Read(string target, UInt32 type, UInt32 flags, out IntPtr credential);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr credential);
  public static string Token() {
    IntPtr pointer;
    if (!Read("Supabase CLI:supabase", 1, 0, out pointer)) throw new Exception("Run supabase login first, or set SUPABASE_ACCESS_TOKEN in the terminal.");
    try {
      var value = Marshal.PtrToStructure<Credential>(pointer);
      var bytes = new byte[value.CredentialBlobSize]; Marshal.Copy(value.CredentialBlob, bytes, 0, bytes.Length);
      var utf8 = System.Text.Encoding.UTF8.GetString(bytes).TrimEnd('\0');
      if (utf8.StartsWith("sbp_") || utf8.StartsWith("{")) return utf8;
      return Marshal.PtrToStringUni(value.CredentialBlob, (int)value.CredentialBlobSize / 2).TrimEnd('\0');
    } finally { CredFree(pointer); }
  }
}
'@
  $taskToken = [RmcPasskeyCredential]::Token()
  if ($taskToken.StartsWith('{')) { $taskToken = ($taskToken | ConvertFrom-Json).access_token }
}
if (-not $taskToken) { throw 'Supabase management credential is unavailable.' }
$taskEnv = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../.env.local')
$taskUrlLine = $taskEnv | Where-Object { $_ -match '^VITE_SUPABASE_URL=' } | Select-Object -First 1
$taskUrl = [uri]($taskUrlLine -replace '^VITE_SUPABASE_URL=', '')
if ($taskUrl.Host -notmatch '^([a-z0-9]+)\.supabase\.co$') { throw 'Expected a hosted Supabase project URL.' }
$taskRef = $Matches[1]
$taskEndpoint = "https://api.supabase.com/v1/projects/$taskRef/config/auth"
$taskHeaders = @{ Authorization = "Bearer $taskToken" }
$taskConfig = Invoke-RestMethod -Uri $taskEndpoint -Headers $taskHeaders
if (-not $Apply) {
  $taskConfig | Select-Object site_url, passkey_enabled, webauthn_rp_id, webauthn_rp_display_name, webauthn_rp_origins | ConvertTo-Json
  exit
}
if (-not $RpId) {
  if ($taskConfig.webauthn_rp_id) { $RpId = $taskConfig.webauthn_rp_id }
  else { $RpId = ([uri]$taskConfig.site_url).Host }
}
if (-not $Origins) {
  if ($taskConfig.webauthn_rp_origins) { $Origins = @($taskConfig.webauthn_rp_origins -split ',' | ForEach-Object { $_.Trim() }) }
  else { $Origins = @(([uri]$taskConfig.site_url).GetLeftPart([System.UriPartial]::Authority)) }
}
# Do not silently invalidate credentials enrolled under a previous RP ID.
if ($taskConfig.passkey_enabled -and $taskConfig.webauthn_rp_id -and $taskConfig.webauthn_rp_id -ne $RpId) {
  throw 'The RP ID is already in use. Changing it would invalidate existing passkeys.'
}
if (-not $RpId -or $RpId -match '[/@: ]') { throw 'RP ID must be a bare hostname.' }
if ($Origins.Count -gt 5 -or $Origins.Count -lt 1) { throw 'Provide between one and five origins.' }
foreach ($taskOrigin in $Origins) {
  $taskParsed = [uri]$taskOrigin
  $taskLoopback = $taskParsed.Host -in @('localhost','127.0.0.1','[::1]')
  if (($taskParsed.Scheme -ne 'https' -and -not ($taskLoopback -and $taskParsed.Scheme -eq 'http')) -or
      $taskParsed.UserInfo -or $taskParsed.AbsolutePath -ne '/' -or $taskParsed.Query -or $taskParsed.Fragment -or
      ($taskParsed.Host -ne $RpId -and -not $taskParsed.Host.EndsWith(".$RpId"))) {
    throw "Invalid origin for RP ID ${RpId}: $taskOrigin"
  }
}
$taskBody = @{ passkey_enabled = $true; webauthn_rp_display_name = 'IARS'; webauthn_rp_id = $RpId; webauthn_rp_origins = ($Origins -join ',') } | ConvertTo-Json
$null = Invoke-RestMethod -Method Patch -Uri $taskEndpoint -Headers $taskHeaders -ContentType 'application/json' -Body $taskBody
$taskVerified = Invoke-RestMethod -Uri $taskEndpoint -Headers $taskHeaders
if (-not $taskVerified.passkey_enabled -or $taskVerified.webauthn_rp_id -ne $RpId -or $taskVerified.webauthn_rp_origins -ne ($Origins -join ',')) {
  throw 'Passkey configuration did not match after saving.'
}
$taskEnvPath = Join-Path $PSScriptRoot '../.env.local'
$taskEnvText = [System.IO.File]::ReadAllText($taskEnvPath)
if ($taskEnvText -match '(?m)^VITE_PASSKEY_RP_ID=.*$') {
  $taskEnvText = [regex]::Replace($taskEnvText, '(?m)^VITE_PASSKEY_RP_ID=.*$', "VITE_PASSKEY_RP_ID=$RpId")
} else { $taskEnvText = $taskEnvText.TrimEnd() + "`r`nVITE_PASSKEY_RP_ID=$RpId`r`n" }
[System.IO.File]::WriteAllText($taskEnvPath, $taskEnvText, (New-Object System.Text.UTF8Encoding($false)))
$taskVerified | Select-Object passkey_enabled, webauthn_rp_id, webauthn_rp_display_name, webauthn_rp_origins | ConvertTo-Json

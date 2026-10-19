param([switch]$Apply)
$ErrorActionPreference = 'Stop'
# Use the existing Supabase CLI credential directly in memory. It is never
# printed, persisted to a file, or passed as a command-line argument.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RmcSupabaseCredential {
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
    if (!Read("Supabase CLI:supabase", 1, 0, out pointer)) throw new Exception("Supabase CLI credential is unavailable.");
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
$managementToken = [RmcSupabaseCredential]::Token()
if (!$managementToken.StartsWith('sbp_')) { throw 'Unexpected Supabase CLI credential format.' }
$headers = @{ Authorization = "Bearer $managementToken" }
$endpoint = 'https://api.supabase.com/v1/projects/iqnjyebkcetcmwammxff/config/auth'
$current = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get
if ($Apply) {
  if (!$env:VITE_GOOGLE_CLIENT_ID -or !$env:GOOGLE_CLIENT_SECRET) { throw 'Google credentials are required in the process environment.' }
  $payload = @{ external_google_enabled = $true; external_google_client_id = $env:VITE_GOOGLE_CLIENT_ID; external_google_secret = $env:GOOGLE_CLIENT_SECRET }
  if ($current.PSObject.Properties.Name -contains 'external_google_skip_nonce_check') { $payload.external_google_skip_nonce_check = $false }
  $null = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Patch -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Compress)
  $current = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get
}
[pscustomobject]@{
  GoogleEnabled = $current.external_google_enabled
  ClientIdMatchesLocal = ($current.external_google_client_id -eq $env:VITE_GOOGLE_CLIENT_ID)
  SecretSavedSuccessfully = $(if ($Apply) { $true } else { $null })
  SecretConfigured = [bool]$current.external_google_secret
  NonceChecksEnabled = ($current.external_google_skip_nonce_check -eq $false)
  SiteUrl = $current.site_url
  CallbackUrl = 'https://iqnjyebkcetcmwammxff.supabase.co/auth/v1/callback'
} | ConvertTo-Json -Compress
$managementToken = $null; $headers = $null; $current = $null

param([switch]$Activate)
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
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
@{ managementToken = $taskToken; activate = [bool]$Activate } | ConvertTo-Json -Compress | node scripts/configure-gas-email.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$videoRoot = Split-Path -Parent $PSScriptRoot
$voiceFolder = Join-Path $videoRoot 'public/audio/takes'
New-Item -ItemType Directory -Force -Path $voiceFolder | Out-Null
$segments = Get-Content -LiteralPath (Join-Path $videoRoot 'narration.json') -Raw | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.SelectVoice('Microsoft Zira Desktop')
  $synth.Rate = 0
  $synth.Volume = 100
  foreach ($segment in $segments) {
    $target = Join-Path $voiceFolder ($segment.id + '.wav')
    $synth.SetOutputToWaveFile($target)
    $words = [System.Security.SecurityElement]::Escape($segment.text)
    $words = $words.Replace('IARS', '<sub alias="eye ars">IARS</sub>').Replace('QR', '<sub alias="Q R">QR</sub>')
    $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><prosody rate="-4%">' + $words + '</prosody></speak>'
    $synth.SpeakSsml($ssml)
    $synth.SetOutputToNull()
    Write-Output ('Generated ' + $segment.id)
  }
} finally { $synth.Dispose() }
$qaFolder = Join-Path $videoRoot 'qa'
New-Item -ItemType Directory -Force -Path $qaFolder | Out-Null
@{ voice = 'Microsoft Zira Desktop en-US'; provider = 'Windows System.Speech'; edition = 'Review' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $qaFolder 'voice-provenance.json') -Encoding utf8

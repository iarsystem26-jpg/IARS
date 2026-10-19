# Audio cue sheet

48 kHz stereo master; three separate unmuted Remotion audio tracks. `mix.wav` is their lossless sum. Remotion renders the mounted tracks; the finalization step copies the H.264 frames and encodes that identical WAV sum to AAC with an exact presentation duration, removing the renderer's AAC padding without recompressing the video.

| Time | Frame | Layer | Cue |
|---|---|---|---|
| 0.000–4.000 | 0–239 | Music | Original suspended electronic pad; restrained plucked pulses and soft low-frequency rhythm. |
| 0.050, 0.450, 0.950, 1.450, 2.000 | 3, 27, 57, 87, 120 | Effects | Short paper/interface ticks reinforce the accumulating sheets and search motif. |
| 0.350–2.069 | 21–124 | Narration | Problem question. |
| 3.650–4.300 | 219–258 | Effects | Soft filtered-noise sweep for the gold product reveal. |
| 4.000–11.000 | 240–659 | Music | Harmonic resolution to D major; simple alternating plucks and measured pulse. |
| 4.250–9.003 | 255–540 | Narration | Scan, verify and record. |
| 8.650 | 519 | Effects | Record-button click. |
| 8.900, 8.980 | 534, 539 | Effects | Two-note confirmation, E5–A5. |
| 10.650–11.300 | 639–678 | Effects | Restrained sweep into the closing card. |
| 11.250, 11.330, 11.410 | 675, 680, 685 | Effects | D-major logo accent with short decay. |
| 11.450–14.265 | 687–856 | Narration | Value proposition and login CTA. |
| 14.350–15.000 | 861–899 | Music/effects | Smooth fade to silence; preserve complete final spoken line. |

The score ducks around measured speech windows. The generated mix is checked for peak and RMS level before export; the encoded AAC is decoded and checked again after export. Source narration is normalized per take. No third-party music or sound-effect recordings are used.

## Provenance

Music and effects are original, deterministic synthesis authored in `scripts/advertisement-audio.py`. Fonts retain their existing OFL license files under `public/assets`. School seal is an existing user project asset. Narration uses the project's established Microsoft neural TTS workflow, not ElevenLabs or OpenAI; no separate commercial voice license document is present in the repository. No claim is made that third-party provider terms were independently cleared for paid advertising.

Regenerate with `python scripts/advertisement-audio.py`. Existing MP3 takes are reused for repeatable rendering; to commission another performance, replace those three source takes and rerun the mixer.

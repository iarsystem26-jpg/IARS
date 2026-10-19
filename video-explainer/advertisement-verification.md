# Advertisement verification

Verified from the delivered `IARS-Advertisement-4K-60FPS.mp4` by fully decoding both streams with FFmpeg (equivalent stream inspection and signal analysis; no assumptions based on file extension).

| Check | Result |
|---|---|
| Duration | 15.000 seconds |
| Decoded frames | 900 |
| Resolution | 3840 × 2160 |
| Frame rate | 60 fps |
| Video | H.264, yuv420p, BT.709 |
| Audio | AAC, stereo, 48 kHz; narration + original score + effects |
| Integrated loudness | -15.15 LUFS |
| True peak | -4.22 dBTP; no clipping |
| Signal | Every one-second interval contains audio |
| Final 20 ms | -200.0 dBFS RMS |
| Black intervals | None detected |
| Motion | Four successive moving frames have distinct decoded hashes |
| Size | 7,657,907 bytes |

## Production checks

TypeScript and scoped ESLint checks passed. Representative source frames, the encoded interaction test, and the final decoded contact sheet were visually inspected. The first-frame crop and settled-interface softness found during review were corrected before the final render.

Three audio files are explicitly mounted, unmuted, in `src/advertisement/Advertisement.tsx`. The test exposed 10 ms of AAC container padding. The finalizer copies the rendered H.264 frames and encodes the identical lossless sum of the stems with an exact presentation duration. The final encoded output was decoded to WAV and measured again. Source speech timing is measured in `public/advertisement/audio-report.json`; the closing line ends at 14.265 seconds, before the music fade completes. No basic desktop TTS was substituted. Timing and signal checks do not replace subjective listening approval.

Representative source frames include the first and last frames, both sides of each transition, the identity modal, Record click and saved state. The two-second 1080p interaction test precedes the final native 4K render; its results are in `qa/advertisement/test-verification.json`. The final output's one-second contact sheet is `qa/advertisement/final-contact-sheet.jpg`.

Studio and the public website checks are recorded in `qa/advertisement/preview-check.json`. Product wording is taken from repository source. The UI is an editable, selective source-based reconstruction, with illustrative data explicitly labeled; it is not footage of a live authenticated session. The full product name matches the real `index.html` title.

## Provenance and limitations

Narration is Microsoft Emma neural speech using the existing project workflow. Music and effects are newly synthesized without third-party samples. Existing OFL fonts and the project's school seal are preserved. Separate commercial voice licensing evidence is not present; see `advertisement-audio-cues.md`. This is a generated production master, not a claim of human voice or commercial-rights clearance. No production application behavior or existing 60-second video was changed.

## Reproduce

```powershell
cd video-explainer
npm run typecheck
npm run ad:audio
npm run ad:stills
npm run ad:test
python scripts/advertisement-verify.py test
npm run ad:render
npm run ad:verify
npm run ad:preview
```

Select **IARS-Advertisement** in Studio. The scene compositions live in **Advertisement-Scenes**. The renderer currently uses the installed Windows Chrome path; edit `scripts/advertisement-render.mjs` for a different machine.

SHA-256: `740f76d40afc6507b064547977dd64ff5776bda6f3e0466fd5dda846a21601c0`

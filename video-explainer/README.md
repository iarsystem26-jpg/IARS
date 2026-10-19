# IARS product explainer — 60-second review edition

## New: 15-second advertisement

The separate **IARS-Advertisement** composition is native 3840 × 2160, 60 fps, 900 frames. Its editable scenes are under `src/advertisement/`; narration, score and effects are under `public/advertisement/`.

Use `npm run ad:preview` and select **IARS-Advertisement**. Export with `npm run ad:render`, then check the actual MP4 with `npm run ad:verify`. Deliverable: `IARS-Advertisement-4K-60FPS.mp4`. See `advertisement-storyboard.md`, `advertisement-script.md`, `advertisement-audio-cues.md` and `advertisement-verification.md` for production details and checks. The original 60-second composition remains available.

The requested six-scene product explainer, based on verified application features. The delivered master is 3840 × 2160 (4K UHD), 60 fps, exactly 3,600 frames, with H.264 video and a complete AAC soundtrack. The revised review uses normal-rate conversational US-English Emma neural narration and adapts the three supplied motion references.

## Files

- `product-explainer-60s.mp4` — rendered film (generated, ignored by Git).
- `reference-analysis.md` ? sampled analysis of Sovera, Workly and NeuraFlow and the changes implemented.
- `storyboard.md` — verified product direction, scene timings and motion plan.
- `narration-script.md` — exact spoken words and measured audio timings.
- `audio-cues.md` — score, sound effects, narration and mix details.
- `verification-report.md` — actual output checks, claim evidence and limitations.
- `src/` — editable React/TypeScript composition, six scenes, motion and UI components.
- `public/assets/` — local school seal, original typefaces and licenses.
- `public/audio/` — complete mix, separate music/effects/voice stems and narration takes.
- `product-explainer-60s.srt` — optional editable subtitles.
- `qa/` — measured audio/video results, render log, reference captures and frame sheets.

## Preview and edit

```powershell
cd video-explainer
npm ci
npm run dev -- --port=3100
```

Open the printed Studio URL and select **IARS-Explainer**. The six individual scenes are registered under **Scenes**. Edit the scene files in `src/scenes/`, shared visuals in `src/components/`, and brand constants in `src/design.ts`.

## Render and verify

The helper currently defaults to the installed Windows Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`; edit `browserExecutable` in `scripts/render.mjs` for another machine.

```powershell
npm run lint
npm run stills
python -m pip install -r scripts/requirements.txt
npm run render
npm run verify
```

`render` captures visuals without browser audio extraction, then attaches the existing 60-second WAV soundtrack as AAC in one encoding pass, preserving the rendered H.264 frames and exact presentation duration. `verify` decodes every frame of the actual MP4, checks the exact duration/format/frame count, measures encoded audio loudness/peaks, detects black intervals and generates final-output frame sheets. It only reports completion when checks pass.

## Audio editing

Generated review images, preview images, intermediate audio stems and fitted narration takes are excluded from Git. The final `public/audio/soundtrack.wav`, original narration takes and QA metadata remain tracked. Run `npm run audio:mix` to regenerate the intermediate audio, `npm run stills` for source review frames, and `npm run verify` after rendering for output review images. Historical narration and reference captures require a separate archive to restore.

```powershell
python -m pip install -r scripts/requirements.txt
npm run audio:voice
npm run audio:mix
npm run render
npm run verify
```

`audio:voice` generates `en-US-EmmaNeural` narration using Microsoft Edge online TTS via edge-tts 7.2.8. It requires internet access; existing local WAVs render without a network voice service. Only the narration script is sent. Takes use normal pitch/rate, and all eight final measured fitting ratios are 1.0000. `audio:voice:local` retains the Windows Zira fallback. To use supplied narration, put WAV files named by the IDs in `narration.json` into `public/audio/takes/`, update `qa/voice-provenance.json`, skip voice generation, then mix/render/verify.

The previous 30 fps Rosa film is retained as `product-explainer-30fps-rosa.mp4` for comparison. The original desktop-voice export is also retained as `product-explainer-v1.mp4`.

The music and effects are original procedural synthesis, with no licensed third-party samples. See `public/assets/LICENSES.md` for all asset provenance.

## Scope

This is an isolated video project. It does not import the production application's environment or connect to its backend. UI data is illustrative and the demo QR cannot authenticate or record attendance. The CTA URL is included only after a public IARS-page browser check; `src/site.json` stores the result.


## Current motion and narration

The master is rendered directly at 60 fps with 3,600 frames. `useMotionFrame` evaluates the established choreography at half-frame intervals; timeline sequences scale their seconds by the current fps. The screenshot check compares adjacent source frames, and MP4 verification checks four consecutive decoded moving frames.

Emma is a conversational US-English AI narrator, selected from the available voices marked Cheerful, Clear and Conversational. The script uses lively questions, an upbeat reveal and an inviting CTA. The current script has 101 words; every take fits with a fitting ratio of 1.0000.


## High-quality export and safe footer

The editable layout uses a 1920 × 1080 design canvas. The renderer captures it at scale 2 (double pixel density), producing 3840 × 2160 frames directly from the HTML/SVG source. Captures are lossless PNG, then encoded as H.264 CRF 12 with the slow preset, 4:2:0 and BT.709 color. This improves on the earlier 1080p JPEG/CRF 17 export. `qa/render-result.json` records the actual output resolution and settings.

The illustrative-data note sits below the divider, 40 design pixels from the bottom, with a 24-pixel line height. Source frames from the hero, pass, verification, report and benefits scenes were checked for separation from the UI. The previous 1080p 60 fps film is kept as `product-explainer-1080p-before-footer-fix.mp4`.

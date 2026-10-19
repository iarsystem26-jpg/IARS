# Reference analysis and revision direction

Analyzed on 2026-10-08. All three supplied videos were accessible through their public video pages. Twenty-four frames per video were extracted across their complete runtimes and visually inspected. This is sampled visual analysis, not a claim of a continuous viewing or listening pass. Contact sheets and timestamped images are in `qa/references/`. Reference footage stays outside `public/` and is not used in the composition.

| Reference | Observed visual language | Adaptation for IARS |
| --- | --- | --- |
| [Sovera — ObiN Studio](https://www.youtube.com/watch?v=o7Jxo0F3ZcE), 100 seconds | Black/white alternation with gold accents; concise centered typography; a repeated-type composition around 13s; UI surfaces and cropped controls around 26–43s; broad UI-to-detail changes; orderly logo/URL finish | Keep IARS gold as the accent, alternate bright and navy scenes, expand the dashboard from overview into a readable hero, then direct attention to individual controls |
| [Workly — Solair](https://www.youtube.com/watch?v=YMWbH7xrTHk), 28 seconds | White/pale backgrounds; blue message capsules accumulate in the opening; short text interludes; isolated folder and UI panels; angled workspace at 13s; layered charts around 16s; phone/ribbon depth around 18–21s; notification collage and clean brand ending | Build original attendance-question capsules that accumulate and clear; use generous space, masked type, spring entrances, brighter feature scenes, layered record cards and gentle perspective |
| [NeuraFlow — Zelios](https://www.youtube.com/watch?v=aSte18D2_YE), 20 seconds | Dark blue stage, grid and luminous horizon; blue spotlight and outlined UI around 1–7s; concentric orbit motif around 7–9s; foreground/background cards with strong depth around 13–16s; centered logo over the horizon at 18–19s | Add a restrained blue light field, grid and luminous arc; stage the verified dashboard as a hero; apply depth and floating cards; retain an uncluttered CTA |

The shared pattern is a change in composition every few seconds, with a clear focal object and readable holds. Sampled frame differences support these observations; precise easing curves are an implementation choice, not measurements of the originals.

## Changes implemented

- Opening: light stage, large immediate question, five original attendance message capsules, followed by a clean second question.
- Agitation: three source-related panels drift independently and gather into a stack.
- Product reveal: centered IARS identity and tagline, angled dashboard entrance, followed by a larger straight-on dashboard view and audience line.
- Demo: bright backgrounds and camera moves around the pass, identity verification, and reporting controls. The underlying click sequence remains source-accurate.
- Benefits: layered white cards and quiet continuous motion.
- Handoffs: 24-frame slides/fades. Scene origins remain 0, 8, 15, 25, 42 and 52 seconds; the master remains exactly 3,600 frames.
- Ending: existing school seal, large IARS typography, blue horizon, gold CTA and verified public URL.
- Audio: normal-rate conversational US-English Emma neural narration, shorter wording, more room between ideas, quieter score and stronger music ducking. Every measured voice fitting ratio is 1.0000.

This adapts broad motion-design principles using the application's own brand and workflows. No reference logos, scripts, soundtracks, screenshots or video frames appear in the final film. The production webapp is unchanged; this revision concerns its explainer video.

## Voice provenance

The review narration is `en-US-EmmaNeural` through Microsoft Edge's online TTS service, generated with [edge-tts](https://github.com/rany2/edge-tts) 7.2.8. Generation uses normal rate and pitch, with public script text only. It is synthetic neural narration, not a human recording or an ElevenLabs recording. Individual takes, a voice stem and the full mix remain editable. The previous 30 fps Rosa video is retained as `product-explainer-30fps-rosa.mp4` for comparison.


## 60 fps and engaging narration revision

The master now renders 3,600 frames at 60 fps. Keyframes, cursor paths and springs evaluate fractional positions on their authored time base; sequences and transition durations scale with the composition frame rate, preserving the 60-second story. This is a fresh render from the source composition.

Narration now uses en-US-EmmaNeural, whose available voice metadata lists Cheerful, Clear and Conversational characteristics. The hook, reveal and CTA have shorter, more conversational wording. Normal pitch/rate avoids a sped-up or artificially high-pitched sound. [Microsoft's introduction of conversational voices](https://techcommunity.microsoft.com/t5/ai-azure-ai-services-blog/introducing-super-realistic-ai-voices-optimized-for/ba-p/3933744) explains the voice family's intended use. Final performance remains AI-generated, as accepted by the user.

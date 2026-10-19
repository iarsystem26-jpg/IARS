# Audio cues — IARS 60-second review edition

The source of truth is `narration.json`; measured speech start/end values are written into `qa/audio-analysis.json` and `narration-script.md` by the audio build. Every voice segment is fitted into its declared time window with silence preserved between scenes.

| Time | Visual/action | Audio |
| --- | --- | --- |
| 00:00–00:08 | Light stage and accumulating attendance message capsules | Restrained minor-colored synth pad, soft plucks; quiet capsule ticks at 0.7, 1.5, 2.3, 3.1, 4.2 and 5.4 s |
| 00:08–00:15 | Disconnected records | More rhythmic pulses; subtle low rise from 13.8 s |
| 00:15 | Seal and IARS reveal | Original warm reveal chord and soft air accent |
| 00:15–00:25 | Product and audience | Brighter chord progression; sparse electronic percussion |
| 00:25.8 | Select My QR | Soft original click |
| 00:26.1 | QR card opens | UI pop |
| 00:29.9 | Select Start | Soft click |
| 00:31.7 | Student verification appears | UI pop |
| 00:34.4 | Select Record after identity check | Soft click |
| 00:34.7 | Attendance recorded | Two-note confirmation |
| 00:37.2 | Records view arrives | Restrained whoosh |
| 00:38.5 / 00:39.1 | Open Event Scope and select the sample event | Soft clicks |
| 00:39.8 | Select CSV | Soft click |
| 00:40.1 | CSV download started | Confirmation tone |
| 00:42–00:52 | Benefits and roles | Uplifting pad extension and restrained rhythmic layer |
| 00:52 | Final brand composition | Soft logo accent |
| 00:57–01:00 | CTA hold | Closing chord; smooth fade ends at 60.000 s |

## Sources and mixing

- Voice: `en-US-EmmaNeural`, US English, generated through Microsoft Edge online TTS using edge-tts 7.2.8. This is a neural synthetic review voice. Generation uses normal pitch/rate, and all eight measured fitting ratios are 1.0000. Shorter wording leaves natural pauses without speeding up recordings.
- Music: an original electronic score synthesized by `scripts/build-audio.py`. No downloaded commercial recording or reference-brand audio is used.
- Effects: original deterministic synthesis in the same script. No external sound-library assets.
- Fonts and school seal are listed in `public/assets/LICENSES.md`; soundtrack originals have no third-party samples.
- Narration is mixed forward. The music level is reduced to 80% of the initial score, with up to 68% additional attenuation during speech with a smoothed envelope, and effects remain below speech. The final mix is normalized to approximately -16 LUFS with a -1.5 dBTP ceiling. Measured loudness and peak results are included in `qa/audio-analysis.json`.
- `public/audio/voiceover.wav`, `music.wav`, `sfx.wav`, and `soundtrack.wav` preserve editable stems. Individual voice takes remain in `public/audio/takes/`.
- The composition loads the complete mixed soundtrack as one frame-aligned audio asset; the output must contain AAC stereo audio.

To replace the review voice, place recordings named after the IDs in `narration.json` into `public/audio/takes/`, then run the audio mix with `npm run audio:mix`. The script checks duration and reports any fitting applied. Listen to revised narration before publishing.


## Engaging delivery revision

The current voice is en-US-EmmaNeural: a cheerful, clear, conversational US-English AI narrator. The opening asks a short question; the reveal opens with ?Meet IARS!?; the CTA asks ?Ready to bring your school records together?? All 101 words fit at the voice?s normal rate and pitch. This avoids artificial pitch changes or speeding up the performance. Music remains quieter under speech and has room to rise between phrases. The narration is still AI-generated, as accepted by the user.

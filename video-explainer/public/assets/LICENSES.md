# Asset provenance

- `academic-seal-transparent.png`: copied from the application's transparent seal, created from the existing user-provided seal using built-in imagegen for background removal. The generation prompt is in `../../../artifacts/attendance-report/seal-edit-prompt.txt`.

- `academic-seal.jpeg`: copied without modification from the application's `public/academic-seal.jpeg`. Used as the existing user-provided product branding. No new ownership or institutional endorsement claim is made.
- `Outfit.ttf`: official Google Fonts `ofl/outfit/Outfit[wght].ttf`; SIL Open Font License, included in `Outfit-OFL.txt`.
- `Nunito.ttf`: official Google Fonts `ofl/nunito/Nunito[wght].ttf`; SIL Open Font License, included in `Nunito-OFL.txt`.
- QR graphic: generated from a non-credential demonstration string. It cannot be used to check in.
- UI graphics: editable React/SVG reconstruction based on the user's source, with illustrative data explicitly labeled.
- Music and sound effects: original procedural synthesis by `scripts/build-audio.py`; no third-party recordings or samples.
- Voice: en-US-EmmaNeural review narration generated with Microsoft Edge online TTS via edge-tts 7.2.8. The user authorized the available-voice review and subsequent audio improvement. Voice/provider metadata is recorded in qa/voice-provenance.json. This is a synthetic neural performance; no claim of ownership of the provider voice or a third-party commercial license is made.
- Reference screenshots under `qa/references` are research evidence only, excluded from the rendered composition.

# IARS — From QR to recorded

15 seconds · 3840 × 2160 · 60 fps · 900 frames. Frame ranges are inclusive.

## Product evidence and direction

IARS is the Institution Attendance and Records System, a school attendance application for students and authorized attendance officers. The single message is replacing manual attendance handling with the existing **scan → identity verification → Record** flow. This film depicts an online save, not offline server confirmation. No speed statistics or automatic identity verification are claimed.

Source evidence: `../views/LandingPage.tsx` (name, QR journey and login CTA), `../views/MayorScanner.tsx` (scanner, exact modal titles, Record/Waive actions and saved receipt), `../components/ui/Layout.tsx` (brand), and the existing `src/components/ProductUI.tsx` vector reconstruction. Student, event and status values are illustrative. The QR encodes a non-credential demo string. Production services are never contacted by the composition.

Brand: navy #002859, blue #0081C8, gold #FFD700 and green #00A859; locally bundled Outfit and Nunito fonts; the existing school seal. The live website address is checked in `qa/advertisement/preview-check.json`.

## Frame-accurate direction

| Frames | Time | Visual action and camera |
|---|---|---|
| 0–59 | 0–1 s | Immediate navy/gold hook. Large left-aligned “Still sorting attendance by hand?” reveals by line. Attendance sheets enter in depth on the right, with controlled rotation and stagger. The camera holds a wide, balanced composition. |
| 60–149 | 1–2.5 s | Paper stack settles; search label and clock land with slight overlapping motion. Gold underline draws beneath the question. Right-side parallax subtly advances while the headline stays stable. |
| 150–206 | 2.5–3.45 s | Readable hold. No new feature or competing headline. |
| 207–239 | 3.45–4 s | Papers contract toward the right-side focal point; headline leaves left. A gold circular wipe fills the frame at 239. |
| 240–339 | 4–5.667 s | Light product environment. “From QR to recorded.” reveals above a navy-sidebar scanner window. The window rises from a slight perspective tilt, then settles square to camera. Scan step becomes active. |
| 340–409 | 5.667–6.833 s | Real “Verify student identity” dialog replaces scanning state. The camera pushes in 6% toward the modal. “Verify identity” becomes active. |
| 410–518 | 6.833–8.65 s | Hold identity details and warning. Cursor enters and tracks to the real Record button. Verification remains an explicit officer action. |
| 519–533 | 8.65–8.9 s | Cursor compresses on Record, synchronized with the click. |
| 534–591 | 8.9–9.867 s | Dialog changes to “Attendance recorded.” Present receipt and green confirmation accent appear. Confirmation chime follows the state change. |
| 592–659 | 9.867–11 s | Product window pulls back and fades. A navy circular wipe at frames 634–659 restores the brand environment. |
| 660–741 | 11–12.367 s | School seal and IARS lockup settle, followed by “Make attendance simpler.” Gold login CTA and verified website appear. Camera gently pulls from 110% to 100%. |
| 742–899 | 12.367–15 s | Stable, readable closing card: Log in to IARS; rmcssg.vercel.app. Narration ends at 14.265 s. Music fades through the final 650 ms; image holds to the final frame. |

## Motion references

[Apple Motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion) informed purposeful feedback, continuity and restrained movement. [Linear brand guidance](https://linear.app/brand) informed disciplined identity presentation. These are design principles, not claims that third-party commercials were copied or exhaustively analyzed. The visual identity remains IARS.

## Editable source

`src/advertisement/Advertisement.tsx` owns the timeline and three separate audio stems. Each scene has its own file and registered Studio composition. The native 3840 × 2160 composition scales a consistent 1920-unit design coordinate system before rasterization, retaining sharp HTML/SVG edges at 4K. All motion is driven by frame indices; no CSS animations, timers, random UI motion or screen recording.

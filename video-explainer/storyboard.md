# IARS — Bring your school records together

60 seconds · 3840 × 2160 (4K UHD) · 60 fps · 3,600 frames. Revised review edition with normal-rate conversational US-English neural narration.

## Verified creative direction

IARS stands for **Institution Attendance and Records System**, as named in `metadata.json` and the public header. The repository folder and README also use RMC Attendance; the film follows the current public interface. It serves students, class attendance officers, student affairs/student government staff, and school administrators (`views/LandingPage.tsx`, `systemModules`).

The problem is coordinating school event attendance and the records and follow-up around it. Scattered lists are a visual metaphor, not a claim about any particular school's current practices. The film makes no measured efficiency, security, adoption, or outcome claim.

Brand: existing academic seal from `public/academic-seal.jpeg`; blue #0081C8, deep blue #002859, gold #FFD700, orange #FF8C00, green #00A859; Outfit headlines and Nunito interface text from `index.css` and `tailwind.config.cjs`.

Interfaces are selective animated reconstructions of verified source screens. All sample names, events, statuses, and report values are illustrative, marked on screen. No real student data, credentials, or functioning QR credentials are included.

## 00:00–00:08 — The problem (frames 0–239)

Open immediately on **?Who checked in??** against a pale blue-white stage. Five original blue/white message capsules accumulate beneath it: event lists, check-in questions, records and follow-up. At five seconds they clear downward as **?Where?s the record??** arrives. A gold line and the message ?Keeping them together should be simple? resolve the composition.

Motion: alternating side entrances, spring settling and capsule rotations, masked type, a short clearing move and a clean readable hold. This adapts the Workly opening with original school-attendance wording. Soft synthesized capsule ticks match entrances.

## 00:08–00:15 — Why it matters (frames 240–449)

Three separated panels show **Event lists**, **Check-ins**, and **Follow-up**. Their connectors stop short. A large centered message reads **“One event. Too many loose ends.”** Students and officers are named as the people who need clarity, not blamed for the problem.

The last second pulls the three panels inward into an ordered stack; the connecting gold line completes as the product arrives. Camera pulls back slightly to make room for the reveal. Soft tension and a rising transition accent.

## 00:15–00:25 — Product reveal (frames 450–749)

The real academic seal and **IARS** emerge above the complete expanded product name. The screen opens into a branded application shell showing the verified **Attendance Dashboard** title and filter/report structure. Selective UI detail stays large enough to understand.

Typography: **“School attendance. Brought together.”** Audience line: students · attendance officers · student affairs · administrators. Camera changes from a small angled panel below centered type into a larger straight-on dashboard at approximately 19?20 seconds. The headline clears before the expanded interface occupies its space. A blue spotlight, grid and luminous horizon provide depth. Music opens into a brighter progression; a restrained reveal chord lands at 15 seconds.

## 00:25–00:42 — Three actual workflows (frames 750–1259)

### 00:25–00:29 — Student pass

Cursor selects the student's **My QR** navigation item (label confirmed in `components/ui/Layout.tsx`). The **Student QR Passport** card opens. Its layout follows `views/StudentQR.tsx`: blue header, seal, student name/ID, academic badges, live QR and printed-card download control. A real QR graphic encodes only `IARS-VIDEO-DEMO-NOT-A-CREDENTIAL`. The live-pass explanation never implies printed passes also expire.

Headline: **“Open your current pass.”** Camera shifts from sidebar selection to the pass card.

### 00:29–00:36.5 — Officer verification

Show **Attendance recording** from `views/MayorScanner.tsx`. Cursor selects the real **Start** control. Scan brackets acquire the sample QR; the **Verify student identity** dialog appears. Hold **Identity check required** long enough to read. Cursor selects **Record** only after verification. Result changes to **Attendance recorded** and **Present**, matching the source modal.

Headline changes from **“Scan. Check identity.”** to **“Then record attendance.”** An event requiring a location check shows the source-supported location status. No guarantee of physical presence is claimed. Clicks align to Start and Record; confirmation chime aligns to the receipt.

### 00:36.5–00:42 — Review and report

Students' **Attendance & Sanction Records** shows the attendance ledger. Then reveal the officer **Attendance Dashboard**, with **Event Scope** and **Time Period** filters and the real **CSV** control (`views/AttendanceDashboard.tsx`). Cursor selects CSV; a small **CSV download started** notification appears, matching the source success text.

Headline: **“Review it. Report it.”** No fake one-click approval, instant synchronization promise, or invented export button.

## 00:42–00:52 — Benefits (frames 1260–1559)

A clean montage connects the pass, verification receipt, and ledger into a single composition. Three staggered outcome phrases fill the left: **Clearer check-ins. Organized records. Easier follow-up.** The right foreground highlights source-supported **Service hours** and **Excuse requests**, using neutral statuses and no invented quantitative benefit.

The final beat identifies the four audience roles and the fact that access depends on assigned duties. Camera: gentle lateral move; panels settle into an ordered composition. Music reaches its widest harmonic layer.

## 00:52–01:00 — Call to action (frames 1560–1799)

Center the seal, IARS, and **“Bring your school records together.”** Primary CTA: **Explore IARS**. Secondary line: **Log in with your school account.** These correspond to the public landing page and actual login. Student enrollment is not presented as open staff self-registration.

Only include the hosted address if public verification returns an IARS page; otherwise omit it. A browser check records the result in `qa/research.json`.

Final layout settles by 54 seconds and stays readable through the end. Original closing accent at 57 seconds; audio tail fades to silence at exactly 60 seconds. Do not fade the final CTA to black.

## Reference research

Accessed official product/reference pages on 2026-10-08: [Linear](https://linear.app/), [Linear's interface design notes](https://linear.app/now/behind-the-latest-design-refresh), [Stripe Payments](https://stripe.com/payments), [Notion](https://www.notion.com/product), [Framer](https://www.framer.com/), and [Framer's launch announcement](https://www.framer.com/blog/framer-3/).

Design principles adapted: restrained surfaces and hierarchy, product-led framing, large type, purposeful UI focus, and controlled depth. Browser captures and available embedded media are inspected separately; text access alone is not evidence of watching a launch video. None of these brands' assets are reused in the film.


## User-supplied motion references and revised audio

See `reference-analysis.md` for timestamped observations of Sovera, Workly and NeuraFlow. All three were inspected with 24 samples across their complete runtimes. Light/dark alternation, accumulating message capsules, layered UI depth, focused camera moves, gold accents and a blue horizon inform this revision. No reference footage/audio is used in the composition.

Twenty-four-frame slides/fades preserve the six scene origins and the exact 3,600-frame master. Feature scenes now use bright backgrounds with navy/blue typography. Pass, verification and reporting views receive restrained action-driven scaling, with cursor coordinates attached to the same transformed UI group.

The narrator is en-US-EmmaNeural at normal pitch/rate. The script wording is designed for a bright, conversational delivery; every final voice fitting ratio is 1.0000. Music is quieter and more deeply ducked during speech. The previous export is kept for comparison.


## Footer and quality revision

Illustrative-data wording remains unchanged, now placed in the bottom footer below the existing divider. It is 40 pixels from the bottom of the 1920 × 1080 design canvas and is separated from the UI, audience text and benefit cards.

The 4K export captures the source at double pixel density with lossless PNG frames and encodes H.264 using CRF 12, slow preset and BT.709 color. It keeps 60 fps, 3,600 frames and the same 60-second soundtrack.

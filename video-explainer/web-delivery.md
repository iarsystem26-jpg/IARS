# Homepage explainer

The public homepage embeds `components/ui/ExplainerVideo.tsx` below its introduction. The deployed assets live in `public/videos/` and are copied into `dist/videos/` by Vite:

- `iars-explainer-1080p.mp4`: 1920 × 1080, 60 fps, H.264 Main Level 4.2, AAC stereo.
- `iars-explainer-720p.mp4`: 1280 × 720, 30 fps, H.264 Constrained Baseline Level 3.1, AAC stereo, for smaller screens, data saving, and compatibility.
- `iars-explainer-poster.jpg`: a 1280 × 720 frame from the current master.
- `iars-explainer-en.vtt`: English captions converted from the measured narration's review subtitles. Sentence timing is approximate within each narration segment.

Both MP4s use 4:2:0 pixels and a front-loaded MP4 index (`faststart`). The original 4K master stays in `video-explainer/product-explainer-60s.mp4`.

Native video controls provide browser playback, sound, seeking, captions, and fullscreen where supported. `playsInline` permits inline iPhone playback. Playback starts on user interaction; `preload="none"` avoids downloading video bytes on the initial homepage load. The smaller version is initially selected for screens up to 640 CSS pixels or when the browser reports Save-Data. Visitors can choose HD; switching quality preserves the position and resumes an active video. An HD decoding/load error retries the compatibility file. Other errors show retry and direct-open controls.

The files are served from the same origin. Existing CSP permits them. MP4s stay outside the service-worker precache so installing the app does not download the films. Hosting must retain correct MIME types (`video/mp4` and `text/vtt`) and HTTP byte-range support for seeking and Safari playback. Vite's production preview is checked for byte-range responses.

Regenerate after updating the master:

```powershell
python -m pip install imageio-ffmpeg
python scripts/prepare-explainer-media.py
npm run build
```

Run the production-browser check with Chrome installed:

```powershell
npm run preview -- --host 127.0.0.1 --port 4177
node scripts/browser-explainer-check.mjs
```

Evidence is saved in `.explainer-browser-review.local/` (ignored by Git), including desktop, tablet, narrow-phone and dark-theme screenshots, playback, seeking, captions, quality switching, compatibility fallback, retry, MIME type, byte-range and service-worker checks. Browser viewport emulation does not certify physical iOS/Android hardware or every browser engine; the component uses portable web standards for those devices.

The production build and app TypeScript checks passed. The browser check passed in installed Chrome and Microsoft Edge at 1440-pixel desktop, 768-pixel tablet and 375-pixel phone widths, with an additional layout check at 320 pixels. All three playback sizes loaded 18 English caption cues, retained narration audio, and supported seeking. Quality switching, automatic compatibility fallback, retry, initial no-video-download behavior and HTTP 206 byte ranges passed. The existing installation popup is suppressed inside this focused automation so it does not cover the player controls. Screenshots were also reviewed in light and dark themes. Safari and physical mobile devices were not available in this environment.

Standards: [MDN video element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video), [WebKit inline video policy](https://webkit.org/blog/6784/new-video-policies-for-ios/).

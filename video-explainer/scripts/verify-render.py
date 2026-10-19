"""Inspect the actual MP4, decode every frame, measure audio, and save review sheets."""
import json, re, subprocess, hashlib
from pathlib import Path
from PIL import Image, ImageDraw
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parent.parent
QA=ROOT/'qa'
VIDEO=ROOT/'product-explainer-60s.mp4'
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
assert VIDEO.is_file() and VIDEO.stat().st_size>100000, 'Rendered MP4 is missing or incomplete'
run=subprocess.run([FFMPEG,'-hide_banner','-i',str(VIDEO),'-vf','blackdetect=d=0.05:pix_th=0.02','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-progress','pipe:1','-nostats','-f','null','NUL'],capture_output=True,text=True)
(QA/'decode-log.txt').write_text(run.stderr,encoding='utf-8')
(QA/'decode-progress.txt').write_text(run.stdout,encoding='utf-8')
assert run.returncode==0, 'Full decode failed'
duration=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',run.stderr)
seconds=int(duration[1])*3600+int(duration[2])*60+float(duration[3])
video_line=next(line for line in run.stderr.splitlines() if 'Stream #0:0' in line and 'Video:' in line)
audio_line=next(line for line in run.stderr.splitlines() if 'Audio: aac' in line)
frames=int(re.findall(r'^frame=(\d+)',run.stdout,re.M)[-1])
stats=json.loads(re.findall(r'\{\s*"input_i".*?\}',run.stderr,re.S)[-1])
checks={'mp4Exists':True,'containerDurationSeconds':seconds,'decodedFrames':frames,'resolution3840x2160':'3840x2160' in video_line,'fps60':bool(re.search(r'\b60 fps\b',video_line)),'h264':'Video: h264' in video_line,'aacStereo':'aac' in audio_line and 'stereo' in audio_line,'allFramesDecoded':frames==3600,'noBlackSegments':'black_start:' not in run.stderr,'loudnessLUFS':float(stats['input_i']),'truePeakDBTP':float(stats['input_tp']),'bytes':VIDEO.stat().st_size,'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest(),'videoStream':video_line.strip(),'audioStream':audio_line.strip()}
assert seconds==60 and frames==3600
assert checks['resolution3840x2160'] and checks['fps60'] and checks['h264'] and checks['aacStereo']
assert checks['noBlackSegments']
assert checks['truePeakDBTP']<0, 'Audio clips'
motion=subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-ss','1','-i',str(VIDEO),'-map','0:v:0','-an','-frames:v','4','-f','framemd5','-'],capture_output=True,text=True,check=True)
motion_hashes=[line.split(',')[-1].strip() for line in motion.stdout.splitlines() if line and not line.startswith('#')]
checks['consecutiveMotionFramesDiffer']=len(motion_hashes)==4 and len(set(motion_hashes))==4
(QA/'motion-frame-hashes.txt').write_text(motion.stdout,encoding='utf-8')
assert checks['consecutiveMotionFramesDiffer'], 'Moving frame interval contains repeated decoded frames'
(QA/'video-verification.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
decoded=QA/'decoded';decoded.mkdir(exist_ok=True)
subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-i',str(VIDEO),'-vf','fps=1,scale=480:270','-frames:v','60',str(decoded/'second-%02d.png')],check=True)
files=sorted(decoded.glob('second-*.png'))
for part in range(2):
    subset=files[part*30:(part+1)*30]
    sheet=Image.new('RGB',(1440,10*296),'#E9EEF5');draw=ImageDraw.Draw(sheet)
    for i,file in enumerate(subset):
        x=(i%3)*480;y=(i//3)*296
        sheet.paste(Image.open(file).convert('RGB'),(x,y));draw.text((x+12,y+274),f'{part*30+i:02d}:00 — decoded output',fill='#002859')
    sheet.save(QA/f'decoded-contact-{part+1}.jpg',quality=92)
subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-ss','54','-i',str(VIDEO),'-frames:v','1','-q:v','2',str(ROOT/'preview.jpg')],check=True)

audio=json.loads((QA/'audio-analysis.json').read_text())
assert all(s['start'] <= s['spokenEnd'] <= s['end'] for s in audio['voiceSegments']), 'Narration exceeds a scene window'
def stamp(sec):
    ms=round(sec*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
captions=[]
for segment in audio['voiceSegments']:
    # Sentence-level review subtitles. Within-segment timing is proportional,
    # not forced word alignment; editable source is the measured narration sheet.
    clauses=re.findall(r'[^.!?]+[.!?]?',segment['text'])
    words=sum(len(s.split()) for s in clauses);start=segment['start'];span=segment['spokenEnd']-start
    for clause in clauses:
        end=start+span*len(clause.split())/words
        text=clause.strip()
        if len(text)>85:
            tokens=text.split();pivot=len(tokens)//2;text=' '.join(tokens[:pivot])+'\n'+' '.join(tokens[pivot:])
        captions.append(f'{len(captions)+1}\n{stamp(start)} --> {stamp(end)}\n{text}\n');start=end
(ROOT/'product-explainer-60s.srt').write_text('\n'.join(captions),encoding='utf-8')
report=f'''# Verification report — IARS 60-second review edition

## Delivery and measured render checks

The output file `product-explainer-60s.mp4` exists ({checks['bytes']:,} bytes) and was decoded in full using FFmpeg. Metadata and decode evidence are preserved in `qa/video-verification.json`, `qa/decode-log.txt`, and `qa/decode-progress.txt`.

| Requirement | Verified result |
| --- | --- |
| Duration | {seconds:.3f} seconds |
| Resolution | 3840 × 2160 (4K UHD), landscape 16:9 |
| Frame rate | 60 fps |
| Frames | {frames:,} decoded successfully |
| Motion sampling | Four consecutive moving frames at 1 second have distinct decoded pixels |
| Video | H.264, 4:2:0, BT.709, CRF 12, slow preset, lossless PNG source captures |
| Audio | AAC stereo, 48 kHz, 320 kbps requested |
| Final audio loudness | {checks['loudnessLUFS']:.2f} LUFS |
| Final audio true peak | {checks['truePeakDBTP']:.2f} dBTP; below clipping |
| Black-frame detection | No black segments detected |
| Narration | All eight measured segments fit their assigned windows; {audio['wordCount']} words |
| Editing | Six separately registered scene timelines plus the master composition |

SHA-256: `{checks['sha256']}`

## Confirmed features and claims

| On-screen or narrated claim | Repository evidence |
| --- | --- |
| IARS means Institution Attendance and Records System | `metadata.json`; `components/ui/PublicHeader.tsx` |
| Serves students, attendance officers, student affairs, administrators | `views/LandingPage.tsx`, `systemModules`; role-specific navigation in `components/ui/Layout.tsx` |
| Students open My QR and the Student QR Passport | `components/ui/Layout.tsx`; `views/StudentQR.tsx` |
| Live QR passes are current/short-lived; printed ID has a separate mechanism | `views/StudentQR.tsx`, live and printed QR paths; film does not claim all passes expire |
| Officer selects Start, scans, verifies identity, then selects Record | `views/MayorScanner.tsx`, camera control and identity modal |
| Successful save shows Attendance recorded and status | `views/MayorScanner.tsx`, attendance receipt modal |
| Location checks depend on event configuration | `views/MayorScanner.tsx`; `views/LandingPage.tsx` feature text |
| Students review Attendance & Sanction Records | `views/StudentRecords.tsx`, attendance ledger and service/merit summaries |
| Authorized officers filter reports and export CSV | `views/AttendanceDashboard.tsx`, Event Scope, Time Period, handleExportCSV |
| School follow-up covers service hours and excuse requests | `views/StudentRecords.tsx`; `views/StudentEvents.tsx`; `views/OSSADashboard.tsx`; public feature descriptions |
| Access depends on assigned duties | `components/ui/Layout.tsx` role/permission navigation; public audience descriptions |
| Explore platform and log in with school account | Public landing page and Log In control; public site captured successfully at https://rmcssg.vercel.app |

The existing academic seal, blue/gold/green tokens, and Outfit/Nunito type families are reused. Names, event titles, counts, percentages, and sample rows are illustrative UI data, visibly labeled. They are not usage or performance statistics. The QR contains only a non-credential demo string. No live school records were created, modified, or exported to produce the film.

## Creative and visual checks

- Story follows problem → agitation → solution → three workflows → benefits → CTA at the requested origins 0, 8, 15, 25, 42, and 52 seconds.
- Master is 3,600 frames at 60 fps. Twenty-four-frame scene handoffs are accounted for; six authored segment lengths sum to 3,720 frames before five overlaps. Animation uses fractional positions on its authored time base, preserving the original scene timing while evaluating new positions at every output frame.
- The visual render omits browser audio extraction. Finalization attaches the existing 60-second WAV mix as AAC in a single encoding pass, with exact 60.00-second presentation duration and H.264 frames copied unchanged; `scripts/finalize-mp4.py` is part of the reproducible render command.
- Representative source-render frames from every scene and interaction are in `qa/stills/`. Full-output contact sheets sample every second in `qa/decoded-contact-1.jpg` and `qa/decoded-contact-2.jpg`.
- The illustrative-data note occupies a separate footer below the divider: 40 design pixels from the bottom, with a fixed 24-pixel line height. The UI and audience line remain above the divider.
- The HTML/SVG source is captured at double pixel density (3840 × 2160) with lossless PNG frames, then encoded using H.264 CRF 12 and the slow preset. This is a new high-resolution capture from source.
- Opening question appears on the first frame. Verification is shown before Record. The Event Scope menu is shown before selecting the sample event. Cursor clicks and audio cues share frame timings.
- Source-render review checked the Event Scope menu and transformed cursor targets; the dashboard hero, QR card, verification modal and CSV flow were inspected for readability before rendering.
- Final CTA settles by approximately 54 seconds and remains visible through the final frame. The site URL was checked against visible IARS landing-page content, not inferred from the repository name.
- Animation uses frame-derived interpolation and springs; no CSS keyframe animations, browser timers, nondeterministic randomness, or live backend dependencies in the composition.
- TypeScript and ESLint checks pass for the video source. Production dependency audit is saved in `qa/dependency-audit.json`.

## Research evidence

Official Linear, Stripe, Notion and Framer pages were accessed. Browser captures of Linear, Stripe, Framer and IARS are in `qa/references/`, with URL/status/text/media details in `qa/research.json`. Embedded Framer product-demo footage was inspected at 0, 2, 5 and 9 seconds. This is sampled motion/reference inspection, not a claim of watching every brand's complete launch film. In the revision, all three user-supplied videos (Sovera, Workly and NeuraFlow) were accessible and visually inspected with 24 frames each across their complete runtimes. Timestamped contact sheets are preserved in `qa/references/`, and `reference-analysis.md` maps observations to implemented changes. Reference assets and recordings are not included in the film.

## Review-edition limitations

1. Voiceover uses en-US-EmmaNeural through Microsoft Edge online TTS, replacing the earlier Rosa review voice. This is a synthetic US-English conversational neural performance. Every final take fits at its normal speaking rate, with fitting ratios of 1.0000; the {audio['wordCount']}-word script leaves natural pauses. Editable takes and measured timing remain available. A human listening pass is needed to approve the subjective performance.
2. Product UI is a source-based selective reconstruction for readable motion design, not a recording of live authenticated sessions. Illustrative data is labeled. Brand seal provenance is the existing user-provided application asset; its artwork names Rizal Memorial Colleges.
3. Original music and effects were synthesized for this project. Audio integrity, loudness, scene timing and clipping were checked mechanically; a human listening pass is still useful for final taste and narrator approval.
4. Optional SRT timing is sentence-proportional within measured voice segments, not word-forced alignment. The film's required soundtrack is already embedded; subtitles remain separately editable.

All six requested deliverables are present. The synthetic narrator and sampled reference-analysis scope remain explicit. The previous 1080p 60 fps export is retained as product-explainer-1080p-before-footer-fix.mp4 for comparison.
'''
(ROOT/'verification-report.md').write_text(report,encoding='utf-8')
print(json.dumps(checks,indent=2))

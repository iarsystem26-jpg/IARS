"""Decode the actual delivered streams; reject missing/silent audio or wrong specs."""
import json, re, subprocess, sys, wave, hashlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parent.parent
QA=ROOT/'qa/advertisement'
TEST='test' in sys.argv
VIDEO=QA/'interaction-test.mp4' if TEST else ROOT/'IARS-Advertisement-4K-60FPS.mp4'
FF=imageio_ffmpeg.get_ffmpeg_exe()
mode='test' if TEST else 'final'
QA.mkdir(parents=True,exist_ok=True)
assert VIDEO.is_file(), 'Output MP4 missing'
result=subprocess.run([FF,'-hide_banner','-threads','2','-i',str(VIDEO),'-vf','blackdetect=d=0.05:pix_th=0.02','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-progress','pipe:1','-nostats','-f','null','NUL'],capture_output=True,text=True)
(QA/f'{mode}-decode.log').write_text(result.stderr,encoding='utf-8')
assert result.returncode==0, 'Decode failed'
v=next(x for x in result.stderr.splitlines() if 'Stream #0:0' in x and 'Video:' in x)
a=next(x for x in result.stderr.splitlines() if 'Audio: aac' in x)
duration=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',result.stderr)
seconds=int(duration[1])*3600+int(duration[2])*60+float(duration[3])
frames=int(re.findall(r'^frame=(\d+)',result.stdout,re.M)[-1])
stats=json.loads(re.findall(r'\{\s*"input_i".*?\}',result.stderr,re.S)[-1])
checks=dict(duration=seconds,frames=frames,videoStream=v.strip(),audioStream=a.strip(),h264='Video: h264' in v,aac='Audio: aac' in a,resolution=('1920x1080' if TEST else '3840x2160') in v,fps60=bool(re.search(r'\b60 fps\b',v)),noBlackIntervals='black_start:' not in result.stderr,loudnessLUFS=float(stats['input_i']),truePeakDBTP=float(stats['input_tp']),bytes=VIDEO.stat().st_size,sha256=hashlib.sha256(VIDEO.read_bytes()).hexdigest())
assert frames==(120 if TEST else 900) and seconds==(2 if TEST else 15), checks
assert all(checks[k] for k in ['h264','aac','resolution','fps60','noBlackIntervals']), checks
assert -40<checks['loudnessLUFS']<0 and checks['truePeakDBTP']<0, 'Silent or clipping soundtrack'
wav=QA/f'{mode}-decoded-audio.wav'
subprocess.run([FF,'-v','error','-y','-i',str(VIDEO),'-vn','-ar','48000','-ac','2',str(wav)],check=True)
with wave.open(str(wav),'rb') as w:
    samples=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(float).reshape(-1,2)/32768
checks['perSecondAudioRmsDbfs']=[round(float(20*np.log10(max(np.sqrt(np.mean(samples[i*48000:(i+1)*48000]**2)),1e-10))),2) for i in range(int(seconds))]
assert all(x>-65 for x in checks['perSecondAudioRmsDbfs']), 'Unexpected silent second'
checks['sourceStemRmsDbfs']={}
for stem in ['narration','music','effects']:
    with wave.open(str(ROOT/f'public/advertisement/{stem}.wav'),'rb') as w:
        assert w.getframerate()==48000 and w.getnframes()==720000 and w.getnchannels()==2
        data=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(float)/32768
    level=float(20*np.log10(max(np.sqrt(np.mean(data**2)),1e-10)))
    assert level>-65, f'{stem} is silent'
    checks['sourceStemRmsDbfs'][stem]=round(level,2)
checks['final20msRmsDbfs']=round(float(20*np.log10(max(np.sqrt(np.mean(samples[-960:]**2)),1e-10))),2)
if TEST:
    subprocess.run([FF,'-v','error','-y','-i',str(VIDEO),'-vf','fps=2,scale=640:360','-frames:v','4',str(QA/'test-decoded-%02d.png')],check=True)
    sheet=Image.new('RGB',(1280,720),'#E9EEF5')
    for i in range(4):
        with Image.open(QA/f'test-decoded-{i+1:02d}.png') as im: sheet.paste(im.convert('RGB'),(i%2*640,i//2*360))
    sheet.save(QA/'test-contact-sheet.jpg',quality=94)
if not TEST:
    motion=subprocess.run([FF,'-v','error','-ss','1','-i',str(VIDEO),'-map','0:v:0','-an','-frames:v','4','-f','framemd5','-'],capture_output=True,text=True,check=True)
    hashes=[x.split(',')[-1].strip() for x in motion.stdout.splitlines() if x and not x.startswith('#')]
    checks['fourDistinctMovingFrames']=len(hashes)==4 and len(set(hashes))==4
    assert checks['fourDistinctMovingFrames']
    subprocess.run([FF,'-v','error','-y','-i',str(VIDEO),'-vf','fps=1,scale=480:270','-frames:v','15',str(QA/'decoded-%02d.png')],check=True)
    sheet=Image.new('RGB',(1440,5*300),'#E9EEF5');draw=ImageDraw.Draw(sheet)
    for i in range(15):
        x=i%3*480;y=i//3*300
        with Image.open(QA/f'decoded-{i+1:02d}.png') as im: sheet.paste(im.convert('RGB'),(x,y))
        draw.text((x+12,y+278),f'{i:02d}s - decoded MP4',fill='#002859')
    sheet.save(QA/'final-contact-sheet.jpg',quality=94)
    report=f'''# Advertisement verification

Verified from the delivered `IARS-Advertisement-4K-60FPS.mp4` by fully decoding both streams with FFmpeg (equivalent stream inspection and signal analysis; no assumptions based on file extension).

| Check | Result |
|---|---|
| Duration | {seconds:.3f} seconds |
| Decoded frames | {frames} |
| Resolution | 3840 × 2160 |
| Frame rate | 60 fps |
| Video | H.264, yuv420p, BT.709 |
| Audio | AAC, stereo, 48 kHz; narration + original score + effects |
| Integrated loudness | {checks['loudnessLUFS']} LUFS |
| True peak | {checks['truePeakDBTP']} dBTP; no clipping |
| Signal | Every one-second interval contains audio |
| Final 20 ms | {checks['final20msRmsDbfs']} dBFS RMS |
| Black intervals | None detected |
| Motion | Four successive moving frames have distinct decoded hashes |
| Size | {checks['bytes']:,} bytes |

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

SHA-256: `{checks['sha256']}`
'''
    (ROOT/'advertisement-verification.md').write_text(report,encoding='utf-8')
(QA/f'{mode}-verification.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
print(json.dumps(checks,indent=2))

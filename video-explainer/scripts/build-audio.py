"""Build original score, effects, scene-fitted speech and a verified 60s mix."""
import json, math, subprocess, wave, re
from pathlib import Path
import numpy as np
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/audio'
QA = ROOT / 'qa'
OUT.mkdir(parents=True, exist_ok=True)
QA.mkdir(exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
N = 60 * SR
rng = np.random.default_rng(731)
segments = json.loads((ROOT / 'narration.json').read_text())
provenance = json.loads((QA/'voice-provenance.json').read_text(encoding='utf-8-sig')) if (QA/'voice-provenance.json').exists() else {'voice':'Microsoft Zira Desktop en-US','provider':'Windows System.Speech'}

def command(args):
    return subprocess.run([FFMPEG, '-hide_banner', '-y', *args], capture_output=True, check=True)

def write(file, data):
    if data.ndim == 1: data = np.column_stack((data, data))
    with wave.open(str(file), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(data, -1, 1) * 32767).astype('<i2').tobytes())

def tone(note, duration, kind='pad'):
    t = np.arange(round(duration*SR)) / SR
    hz = 440 * 2**((note-69)/12)
    if kind=='pad':
        v = (np.sin(2*np.pi*hz*t)+.25*np.sin(2*np.pi*hz*2.002*t)+.16*np.sin(2*np.pi*hz*.998*t))/1.41
        env=np.minimum(t/.35,1)*np.minimum((duration-t)/.65,1)
    else:
        v=(np.sin(2*np.pi*hz*t)+.20*np.sin(2*np.pi*hz*2*t)+.06*np.sin(2*np.pi*hz*3*t))/1.26
        env=(1-np.exp(-t*150))*np.exp(-t*4.6)*np.minimum((duration-t)/.12,1)
    return v*env

def place(dest, sample, seconds, gain=1, pan=0):
    start=round(seconds*SR); end=min(N,start+len(sample)); count=end-start
    if count <= 0: return
    if sample.ndim==1:
        dest[start:end,0]+=sample[:count]*gain*math.sqrt((1-pan)/2)
        dest[start:end,1]+=sample[:count]*gain*math.sqrt((1+pan)/2)
    else: dest[start:end]+=sample[:count]*gain

voice=np.zeros((N,2),np.float32)
speech_activity=np.zeros(N,np.float32)
measured=[]
for seg in segments:
    source=OUT/'takes'/f"{seg['id']}.wav"
    with wave.open(str(source),'rb') as w:
        duration=w.getnframes()/w.getframerate()
    window=seg['end']-seg['start']
    # Fit speech with pitch preserved. Leave a small safety tail.
    speed=max(1.0,duration/(window-.12))
    fitted=OUT/'takes'/f"{seg['id']}-fitted.wav"
    command(['-i',str(source),'-af',f'atempo={speed:.6f},afade=t=in:d=0.012,afade=t=out:st={max(0,duration/speed-.04):.4f}:d=0.04','-ar',str(SR),'-ac','2',str(fitted)])
    with wave.open(str(fitted),'rb') as w:
        raw=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32).reshape(-1,2)/32768
    rms=np.sqrt(np.mean(raw**2)); raw*=.13/max(rms,.001)
    place(voice,raw,seg['start'])
    begin=round(seg['start']*SR); end=min(N,begin+len(raw))
    speech_activity[max(0,begin-round(.13*SR)):min(N,end+round(.20*SR))]=1
    measured.append({**seg,'sourceDuration':round(duration,4),'speedApplied':round(speed,4),'spokenEnd':round(seg['start']+len(raw)/SR,4),'voice':provenance['voice']})
write(OUT/'voiceover.wav',voice)

music=np.zeros((N,2),np.float32)
chords=[[50,57,60,65],[46,53,58,62],[48,55,60,64],[50,57,60,65]]
bright=[[53,60,65,69],[48,55,60,64],[50,57,62,65],[46,53,58,65]]
for bar in range(24):
    start=bar*2.5
    notes=(chords if start<15 else bright)[bar%4]
    gain=.020 if start<15 else .028 if start<42 else .034
    for i,note in enumerate(notes):
        place(music,tone(note,3.1),start,gain,(-.6+i*.4))
    if start>=15:
        place(music,tone(notes[0]-12,2.3),start,.032)
    for step in range(8):
        sec=start+step*.3125
        if sec>=57: continue
        note=notes[[0,2,1,3,2,1,3,2][step]]+12
        place(music,tone(note,.95,'pluck'),sec,.020 if start<15 else .029,(-.45 if step%2 else .45))
        if 25<=sec<52:
            t=np.arange(round(.18*SR))/SR
            kick=np.sin(2*np.pi*(43*t+1.3*(1-np.exp(-t*30))))*np.exp(-t*22)
            if step%2==0: place(music,kick,sec,.035)
            ht=np.arange(round(.06*SR))/SR
            noise=rng.normal(0,1,len(ht)); noise=np.concatenate(([0],np.diff(noise)))
            place(music,noise*np.exp(-ht*90),sec,.0035,(-.7 if step%2 else .7))
for note in [53,60,65,69,72]:place(music,tone(note,3),57,.026,(note-65)/20)
t=np.arange(N)/SR
music*=np.minimum(t/1.0,1)[:,None]*np.minimum((60-t)/2.5,1)[:,None]
write(OUT/'music.wav',music)

sfx=np.zeros((N,2),np.float32)
def click():
    t=np.arange(round(.065*SR))/SR
    return (np.sin(2*np.pi*1350*t)*.6+rng.normal(0,.15,len(t)))*np.exp(-t*90)
def whoosh():
    t=np.arange(round(.65*SR))/SR
    noise=rng.normal(0,1,len(t)); smooth=np.convolve(noise,np.ones(24)/24,mode='same')
    return smooth*np.sin(np.pi*t/.65)**2
for sec in [.7,1.5,2.3,3.1,4.2,5.4,25.8,29.9,34.4,38.5,39.1,39.8]:place(sfx,click(),sec,.030)
for sec in [26.1,31.7]:place(sfx,tone(81,.28,'pluck'),sec,.033)
for sec in [34.7,40.1]:
    place(sfx,tone(76,.48,'pluck'),sec,.05)
    place(sfx,tone(81,.7,'pluck'),sec+.12,.036)
for sec in [14.55,24.8,36.65,41.7,51.75]:place(sfx,whoosh(),sec,.065)
for sec in [15,52]:
    for note in [53,65,72,77]:place(sfx,tone(note,1.7,'pluck'),sec,.028)
write(OUT/'sfx.wav',sfx)
# Smooth ducking avoids abrupt volume changes.
duck=np.convolve(speech_activity[::480],np.ones(25)/25,mode='same')
duck=np.interp(np.arange(N),np.arange(len(duck))*480,duck)
mixed=voice+music*.80*(1-.68*duck[:,None])+sfx*.85
write(OUT/'mix-pre.wav',mixed)
first=command(['-i',str(OUT/'mix-pre.wav'),'-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','NUL'])
stats=json.loads(re.findall(r'\{\s*"input_i".*?\}',first.stderr.decode(errors='replace'),re.S)[-1])
filter=f"loudnorm=I=-16:TP=-1.5:LRA=8:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
command(['-i',str(OUT/'mix-pre.wav'),'-af',filter,'-ar',str(SR),'-ac','2',str(OUT/'soundtrack.wav')])
verify=command(['-i',str(OUT/'soundtrack.wav'),'-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','NUL'])
finalstats=json.loads(re.findall(r'\{\s*"input_i".*?\}',verify.stderr.decode(errors='replace'),re.S)[-1])
with wave.open(str(OUT/'soundtrack.wav'),'rb') as w:
    assert w.getnframes()==N and w.getframerate()==SR and w.getnchannels()==2
analysis={'durationSeconds':60,'sampleRate':SR,'channels':2,'voiceSegments':measured,'mixLoudnessLUFS':float(finalstats['input_i']),'mixTruePeakDBTP':float(finalstats['input_tp']),'wordCount':sum(len(s['text'].split()) for s in segments),'music':'Original procedural electronic score','sfx':'Original procedural synthesis'}
(QA/'audio-analysis.json').write_text(json.dumps(analysis,indent=2))
lines=['# Time-coded narration — IARS','',f"{analysis['wordCount']} spoken words. Review voice: {provenance['voice']} via {provenance['provider']}. IARS is pronounced ‘eye ars’. Exact spoken ends below are measured from fitted WAVs; each declared slot includes its intentional pause.",'','| Start | Spoken end | Scene end | Exact spoken words |','| --- | --- | --- | --- |']
for s in measured:lines.append(f"| {s['start']:.2f} s | {s['spokenEnd']:.2f} s | {s['end']:.2f} s | {s['text']} |")
lines+=['','Visual actions and sound effects for every line are mapped in `storyboard.md` and `audio-cues.md`.','', f"Conversational neural narration ({provenance['voice']}) generated at normal rate and pitch. Editable takes and exact fitting ratios are preserved in the audio analysis."]
(ROOT/'narration-script.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps(analysis,indent=2))

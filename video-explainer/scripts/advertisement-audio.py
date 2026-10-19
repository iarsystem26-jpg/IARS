"""Original score/effects and three normal-rate neural narration takes for the ad."""
import asyncio, json, subprocess, wave
from pathlib import Path
import numpy as np
import edge_tts
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/advertisement'
OUT.mkdir(parents=True, exist_ok=True)
SR = 48000
N = SR * 15
FF = imageio_ffmpeg.get_ffmpeg_exe()
TAKES = [
    ('problem', .35, 3.8, 'Still sorting attendance by hand?'),
    ('solution', 4.25, 10.8, 'With IARS, scan the student QR, verify their identity, and record attendance.'),
    ('cta', 11.45, 14.6, 'Make attendance simpler. Log in to IARS.'),
]

def write(name, data):
    with wave.open(str(OUT / (name + '.wav')), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(data, -1, 1) * 32767).astype('<i2').tobytes())

def add(dst, signal, when, pan=0):
    start = round(when * SR)
    length = min(len(signal), len(dst) - start)
    dst[start:start+length, 0] += signal[:length] * (1 - pan * .35)
    dst[start:start+length, 1] += signal[:length] * (1 + pan * .35)

async def main():
    voice = np.zeros((N, 2)); music = voice.copy(); effects = voice.copy()
    provenance = []
    for name, start, end, text in TAKES:
        mp3 = OUT / f'{name}.mp3'
        spoken = text.replace('IARS', 'eye ars').replace('QR', 'Q R')
        if not mp3.exists():
            await edge_tts.Communicate(spoken, 'en-US-EmmaNeural', rate='+0%', pitch='+0Hz').save(str(mp3))
        wav = OUT / f'{name}.wav'
        subprocess.run([FF, '-v', 'error', '-y', '-i', str(mp3), '-af', 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB,areverse', '-ar', str(SR), '-ac', '1', str(wav)], check=True)
        with wave.open(str(wav), 'rb') as w:
            samples = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768
        duration = len(samples) / SR
        if duration > end-start:
            raise RuntimeError(f'{name} take is {duration:.3f}s, longer than its {end-start}s window; revise script, do not accelerate.')
        samples *= .60 / max(np.max(np.abs(samples)), .01)
        add(voice, samples, start)
        provenance.append(dict(id=name, start=start, end=start+duration, duration=duration, text=text, rate='+0%', voice='en-US-EmmaNeural'))
        print(json.dumps(provenance[-1]), flush=True)
    # Original deterministic electronic score. Suspended opening resolves to D major.
    chords = [(0, 4, [146.83, 220, 261.63]), (4, 7.5, [146.83, 185, 220]), (7.5, 11, [110, 146.83, 185]), (11, 15, [146.83, 185, 220, 293.66])]
    for start, end, notes in chords:
        t = np.arange(round((end-start)*SR))/SR
        env = np.minimum(t/.5, 1) * np.minimum((end-start-t)/.9, 1)
        for j, hz in enumerate(notes):
            tone = (np.sin(2*np.pi*hz*t) + .24*np.sin(2*np.pi*2*hz*t)) * env * .028
            add(music, tone, start, (j-1)*.5)
    for k, at in enumerate(np.arange(.15, 14.2, .5)):
        t = np.arange(int(.42*SR))/SR
        hz = [293.66, 440, 369.99, 587.33][k%4] if at >= 4 else [293.66, 440, 523.25, 440][k%4]
        tone = np.sin(2*np.pi*hz*t) * np.exp(-t*14) * np.minimum(t/.008, 1) * .035
        add(music, tone, at, (-1)**k * .65)
        if k%2 == 0:
            kick = np.sin(2*np.pi*(48*t+1.6*(1-np.exp(-t*35))))*np.exp(-t*18)*.06
            add(music, kick, at)
    rng = np.random.default_rng(73)
    for at in [.05, .45, .95, 1.45, 2.0, 8.65]:
        t = np.arange(int(.09*SR))/SR
        add(effects, (rng.normal(0, .09, len(t))+np.sin(2*np.pi*1700*t)*.06)*np.exp(-t*75), at)
    for at in [3.65, 10.65]:
        t = np.arange(int(.65*SR))/SR
        noise = rng.normal(0, 1, len(t)); noise = np.convolve(noise, np.ones(16)/16, mode='same')
        add(effects, noise*np.sin(np.pi*t/.65)**2*.19, at)
    for at, notes in [(8.9, [659.25, 880]), (11.25, [293.66, 440, 587.33])]:
        for j, hz in enumerate(notes):
            t = np.arange(int(.9*SR))/SR
            add(effects, np.sin(2*np.pi*hz*t)*np.exp(-t*6)*np.minimum(t/.006,1)*.055, at+j*.08)
    # Duck beneath the measured narration, preserving a quiet music tail.
    duck = np.ones(N)
    for take in provenance:
        a=max(0, int((take['start']-.1)*SR)); b=min(N,int((take['end']+.15)*SR))
        duck[a:b] = .52
    duck = np.convolve(duck, np.ones(4800)/4800, mode='same')
    music *= duck[:, None]
    fade = np.minimum(np.arange(N)/SR/.12, 1)*np.minimum((15-np.arange(N)/SR)/.65,1)
    music *= fade[:,None]; effects *= fade[:,None]
    mix = voice + music + effects
    write('narration', voice); write('music', music); write('effects', effects); write('mix', mix)
    report = dict(provider='Microsoft Edge online neural TTS via edge-tts; existing project voice workflow', takes=provenance, music='Original procedural synthesis; no third-party samples', effects='Original deterministic synthesis', peak_dbfs=float(20*np.log10(np.max(np.abs(mix)))), rms_dbfs=float(20*np.log10(np.sqrt(np.mean(mix**2)))))
    (OUT/'audio-report.json').write_text(json.dumps(report, indent=2))

asyncio.run(main())

"""Generate editable review narration using Microsoft Edge online neural TTS."""
import asyncio, json, subprocess, wave
from pathlib import Path
import edge_tts
import imageio_ffmpeg
import sys

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/audio/takes'
VOICE = 'en-US-EmmaNeural'

async def main():
    segments = json.loads((ROOT/'narration.json').read_text(encoding='utf-8'))
    measurements = []
    for seg in segments:
        if len(sys.argv)>1 and seg['id'] not in sys.argv[1:]:
            continue
        text = seg['text'].replace('IARS', 'eye ars').replace('QR', 'Q R')
        path = OUT / f"{seg['id']}-neural.mp3"
        await edge_tts.Communicate(text, VOICE, rate='+0%', pitch='+0Hz').save(str(path))
        wav = OUT / f"{seg['id']}.wav"
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y', '-i', str(path), '-af', 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB,areverse', '-ar', '48000', '-ac', '2', str(wav)], check=True)
        with wave.open(str(wav), 'rb') as w:
            seconds = w.getnframes()/w.getframerate()
        item = {'id':seg['id'], 'duration':round(seconds,4), 'window':round(seg['end']-seg['start'],4)}
        measurements.append(item)
        print(json.dumps(item), flush=True)
    provenance = {'voice':VOICE, 'provider':'Microsoft Edge online neural text-to-speech', 'rate':'+0%', 'pitch':'+0Hz', 'edition':'Review', 'takes':measurements}
    (ROOT/'qa/voice-provenance.json').write_text(json.dumps(provenance,indent=2),encoding='utf-8')

asyncio.run(main())

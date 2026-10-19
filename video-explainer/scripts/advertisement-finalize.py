"""Set exact presentation duration, copying video and encoding the lossless mix once."""
from pathlib import Path
import subprocess, re, os, sys
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parent.parent
TEST='test' in sys.argv
source=ROOT/'qa/advertisement/interaction-test.mp4' if TEST else ROOT/'IARS-Advertisement-4K-60FPS.mp4'
target=source.with_suffix('.finalized.mp4')
seconds=2 if TEST else 15
start=7.5 if TEST else 0
ff=imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ff,'-hide_banner','-loglevel','error','-y','-i',str(source),'-ss',str(start),'-i',str(ROOT/'public/advertisement/mix.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-af',f'atrim=duration={seconds},asetpts=PTS-STARTPTS','-t',str(seconds),'-movflags','+faststart',str(target)],check=True)
info=subprocess.run([ff,'-hide_banner','-i',str(target)],capture_output=True,text=True)
d=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',info.stderr)
assert d and int(d[1])*3600+int(d[2])*60+float(d[3])==seconds,info.stderr
os.replace(target,source)
print(f'Exact presentation: {seconds}.00 seconds; video copied; AAC encoded from original mix.')

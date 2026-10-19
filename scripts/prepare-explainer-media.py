"""Create homepage media from the 4K master. Requires imageio-ffmpeg."""
import re
import subprocess
from pathlib import Path
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / 'video-explainer/product-explainer-60s.mp4'
OUTPUT = ROOT / 'public/videos'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
assert MASTER.is_file(), 'Render the explainer master first.'
OUTPUT.mkdir(parents=True, exist_ok=True)

for name, width, height, fps, profile, level, rate in [
    ('1080p', 1920, 1080, 60, 'main', '4.2', '8M'),
    ('720p', 1280, 720, 30, 'baseline', '3.1', '4M'),
]:
    target = OUTPUT / f'iars-explainer-{name}.mp4'
    print(f'Preparing {name}...', flush=True)
    subprocess.run([
        FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(MASTER),
        '-map', '0:v:0', '-map', '0:a:0',
        '-vf', f'scale={width}:{height}:flags=lanczos,fps={fps},setsar=1',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-profile:v', profile, '-level:v', level, '-pix_fmt', 'yuv420p',
        '-maxrate', rate, '-bufsize', '16M', '-g', str(fps * 2), '-threads', '4',
        '-c:a', 'copy', '-movflags', '+faststart', str(target),
    ], check=True)
    print(f'{target.name}: {target.stat().st_size:,} bytes', flush=True)

subprocess.run([
    FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-ss', '27.833333',
    '-i', str(MASTER), '-vf', 'scale=1280:720:flags=lanczos', '-frames:v', '1',
    '-q:v', '3', str(OUTPUT / 'iars-explainer-poster.jpg'),
], check=True)
srt = (ROOT / 'video-explainer/product-explainer-60s.srt').read_text(encoding='utf-8')
vtt = re.sub(r'(\d{2}:\d{2}:\d{2}),(\d{3})', r'\1.\2', srt)
(OUTPUT / 'iars-explainer-en.vtt').write_text('WEBVTT\n\n' + vtt, encoding='utf-8')
print('Poster and English captions ready.', flush=True)

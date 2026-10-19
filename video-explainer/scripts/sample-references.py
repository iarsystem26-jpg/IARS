import json, subprocess
from pathlib import Path
from PIL import Image, ImageDraw
import imageio_ffmpeg

root = Path(__file__).resolve().parent.parent
out = root / 'qa/references'
for id in ['o7Jxo0F3ZcE', 'YMWbH7xrTHk', 'aSte18D2_YE']:
    info = json.loads((out / f'{id}.info.json').read_text(encoding='utf-8'))
    duration = info['duration']
    times = [round(i * (duration - 1) / 23, 2) for i in range(24)]
    sheet = Image.new('RGB', (1440, 8*294), '#ecf0f4')
    draw = ImageDraw.Draw(sheet)
    for i,t in enumerate(times):
        frame = out / f'{id}-{i:02d}.png'
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-loglevel', 'error', '-y', '-ss', str(t), '-i', str(out/f'{id}.mp4'), '-frames:v', '1', '-vf', 'scale=480:270', str(frame)], check=True)
        x,y=(i%3)*480,(i//3)*294
        sheet.paste(Image.open(frame).convert('RGB'),(x,y))
        draw.text((x+8,y+273),f'{t:.2f}s',fill='#002859')
    sheet.save(out/f'{id}-contact.jpg',quality=92)
    print(json.dumps({'id':id,'title':info['title'],'channel':info.get('channel'),'duration':duration,'sampleTimes':times}))

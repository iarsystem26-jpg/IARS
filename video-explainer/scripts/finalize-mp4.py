"""Remove AAC encoder padding from presentation duration; preserve H.264 frames."""
from pathlib import Path
import subprocess, re, os, json
import imageio_ffmpeg
root=Path(__file__).resolve().parent.parent
source=root/'product-explainer-60s.mp4'
soundtrack=root/'public/audio/soundtrack.wav'
target=root/'product-explainer-60s.finalized.mp4'
assert source.is_file()
assert soundtrack.is_file()
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
result=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(source),'-i',str(soundtrack),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-af','atrim=duration=60,asetpts=PTS-STARTPTS','-t','60','-movflags','+faststart',str(target)],capture_output=True,text=True,check=True)
info=subprocess.run([ffmpeg,'-hide_banner','-i',str(target)],capture_output=True,text=True)
duration=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',info.stderr)
assert duration and int(duration[1])*3600+int(duration[2])*60+float(duration[3])==60,info.stderr
assert target.stat().st_size>100000
os.replace(target,source)
render_result=root/'qa/render-result.json'
if render_result.is_file():
    report=json.loads(render_result.read_text())
    report['rawRenderBytes']=report['bytes']
    report['bytes']=source.stat().st_size
    report['containerDurationSeconds']=60
    render_result.write_text(json.dumps(report,indent=2))
print('Finalized container to exactly 60.00 seconds; H.264 frames copied without re-encoding.')

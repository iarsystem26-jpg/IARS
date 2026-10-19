import { useEffect, useRef, useState } from 'react';
import { ExternalLink, PlayCircle } from 'lucide-react';
import CustomSelect from './CustomSelect';
import { defaultHomepageVideo, homepageVideos, loadHomepageVideo } from '../../lib/homepageVideos';

type Quality = 'hd' | 'compact';
const mediaRoot = `${import.meta.env.BASE_URL}videos/`;
const sources: Record<Quality, string> = {
  hd: `${mediaRoot}iars-explainer-1080p.mp4`,
  compact: `${mediaRoot}iars-explainer-720p.mp4`,
};

function initialQuality(): Quality {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData || window.matchMedia('(max-width: 640px)').matches ? 'compact' : 'hd';
}

export default function ExplainerVideo() {
  const [selection, setSelection] = useState(defaultHomepageVideo);
  useEffect(() => {
    let active = true;
    void loadHomepageVideo().then(value => {
      if (!active) return;
      setSelection(homepageVideos.find(video => video.id === value.video_id) || defaultHomepageVideo);
      if (value.video_id === 'videos/iars-explainer-720p.mp4') setQuality('compact');
    }).catch(() => { /* Keep the existing explainer available if settings cannot load. */ });
    return () => { active = false; };
  }, []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const position = useRef(0);
  const resume = useRef(false);
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [loadMetadata, setLoadMetadata] = useState(false);
  const [failed, setFailed] = useState(false);

  const changeQuality = (next: Quality) => {
    if (next === quality) return;
    const video = videoRef.current;
    position.current = video?.currentTime || 0;
    resume.current = !!video && !video.paused && !video.ended;
    setLoadMetadata(true);
    setFailed(false);
    setQuality(next);
  };

  const restorePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (position.current > 0) video.currentTime = Math.min(position.current, video.duration);
    position.current = 0;
    if (resume.current) void video.play().catch(() => { /* Native controls remain available if a browser requires another tap. */ });
    resume.current = false;
  };

  const handleError = () => {
    // Retry with the lower-profile file when a device cannot decode the HD file.
    if (selection.explainer && quality === 'hd') {
      changeQuality('compact');
      resume.current = true;
    } else {
      setFailed(true);
    }
  };

  return (
    <section id="explainer" aria-labelledby="explainer-heading" className="mx-auto mt-12 max-w-5xl scroll-mt-28">
      <div className="mb-6 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-900/5 px-4 py-2 text-xs font-bold text-brand-900 dark:bg-white/10 dark:text-gold-400">
          <PlayCircle size={16} aria-hidden="true" /> An introduction to IARS
        </div>
        <h2 id="explainer-heading" className="text-2xl font-black tracking-tight text-brand-900 dark:text-white sm:text-3xl">See IARS in action</h2>
        <p id="explainer-description" className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          From your student QR pass to attendance and school records, see how it all comes together.
        </p>
      </div>
      <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-3xl">
        <video
          ref={videoRef}
          key={selection.id}
          src={selection.explainer ? sources[quality] : selection.url}
          poster={selection.explainer ? `${mediaRoot}iars-explainer-poster.jpg` : undefined}
          controls
          playsInline
          preload={loadMetadata ? 'metadata' : 'none'}
          width={1920}
          height={1080}
          aria-label="IARS product explainer"
          aria-describedby="explainer-description"
          className="block aspect-video h-auto w-full bg-brand-950 object-contain"
          onLoadedMetadata={restorePlayback}
          onError={event => { if (event.target === event.currentTarget) handleError(); }}
        >
          {selection.explainer && <track kind="captions" src={`${mediaRoot}iars-explainer-en.vtt`} srcLang="en" label="English" />}
          Your browser does not support embedded video. <a href={selection.explainer ? sources.compact : selection.url}>Open the IARS explainer.</a>
        </video>
        <figcaption className="flex flex-col gap-4 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-slate-600 dark:text-slate-300">{selection.explainer ? '60 seconds · English narration and captions' : selection.label}</span>
          <div className="flex flex-wrap items-center gap-4">
            {selection.explainer && <CustomSelect
              label="Video quality"
              value={quality}
              onChange={value => changeQuality(value as Quality)}
              options={[
                { value: 'hd', label: 'HD (1080p)' },
                { value: 'compact', label: 'Data saver (720p)' },
              ]}
              className="w-52 max-w-full"
            />}
            <a href={selection.explainer ? sources[quality] : selection.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg py-2 text-xs font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900 dark:text-gold-400 dark:hover:text-gold-300">
              Open video <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </figcaption>
        {failed && <div role="alert" className="border-t border-slate-200 px-4 py-4 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200 sm:px-6">
          <p>The video couldn’t load. Try again or use the “Open video” link.</p>
          <button type="button" onClick={() => { setFailed(false); videoRef.current?.load(); void videoRef.current?.play().catch(() => setFailed(true)); }} className="mt-3 min-h-11 rounded-lg bg-brand-900 px-4 py-2 font-bold text-white dark:bg-gold-500 dark:text-brand-950">Try again</button>
        </div>}
      </figure>
    </section>
  );
}

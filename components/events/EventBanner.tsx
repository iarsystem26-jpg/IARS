import { useState } from 'react';
import { driveImageCandidates } from '../../lib/googleDrive';

export default function EventBanner({ src, alt, background = false }: { src: string; alt: string; background?: boolean }) {
  return <BannerImage key={src} src={src} alt={alt} background={background} />;
}

function BannerImage({ src, alt, background }: { src: string; alt: string; background: boolean }) {
  const candidates = src.startsWith('data:') || src.startsWith('blob:') ? [src] : driveImageCandidates(src);
  const [index, setIndex] = useState(0);
  if (!candidates[index]) return background ? null : <p className="mb-4 text-sm text-slate-500">Banner unavailable</p>;
  return <img src={candidates[index]} alt={alt} referrerPolicy="no-referrer" onError={() => setIndex(value => value + 1)} className={background ? 'pointer-events-none absolute inset-0 h-full w-full object-cover object-center' : 'mb-4 aspect-[8/3] w-full rounded-xl object-cover'} />;
}

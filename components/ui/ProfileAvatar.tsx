import { ImgHTMLAttributes, useEffect, useState } from 'react';
import { documentUrl } from '../../lib/backend';
import { driveImageCandidates } from '../../lib/googleDrive';

export const defaultProfileImage = '/iars-icon.png';

export default function ProfileAvatar({ src, alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [url, setUrl] = useState(defaultProfileImage);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl(defaultProfileImage);
    setCandidates([]);
    setCandidateIndex(0);
    const source = src?.trim();
    // Older demo profiles used random portraits. They are not uploaded account photos.
    const demoPhoto = source && (/^https?:\/\/(?:i\.)?pravatar\.cc\//i.test(source)
      || /^https?:\/\/images\.unsplash\.com\/photo-1573496359142-b8d87734a5a2(?:\?|$)/i.test(source));
    if (source && source !== '/avatar-placeholder.svg' && source !== defaultProfileImage && !demoPhoto) void documentUrl(source).then(value => {
      if (!active) return;
      const next = value && value.startsWith('http') ? driveImageCandidates(value) : [value];
      setCandidates(next);
      setUrl(next[0] || defaultProfileImage);
    }).catch(() => console.warn('[ProfileAvatar] Unable to resolve the image.'));
    return () => { active = false; };
  }, [src]);
  const handleError = () => {
    const nextIndex = candidateIndex + 1;
    if (nextIndex < candidates.length) {
      setCandidateIndex(nextIndex);
      setUrl(candidates[nextIndex]);
      return;
    }
    // Signed document URLs carry credentials; never log them or send diagnostic requests.
    console.warn('[ProfileAvatar] Unable to display the image. Using the placeholder.');
    setUrl(defaultProfileImage);
  };
  return <img {...props} src={url} alt={alt} referrerPolicy={props.referrerPolicy || 'no-referrer'} onError={handleError} />;
}

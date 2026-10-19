import { ImgHTMLAttributes, useEffect, useState } from 'react';
import { documentUrl } from '../../lib/backend';
import { driveImageCandidates } from '../../lib/googleDrive';

export default function ProfileAvatar({ src, alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [url, setUrl] = useState('/avatar-placeholder.svg');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl('/avatar-placeholder.svg');
    setCandidates([]);
    setCandidateIndex(0);
    if (src) void documentUrl(src).then(value => {
      if (!active) return;
      const next = value && value.startsWith('http') ? driveImageCandidates(value) : [value];
      setCandidates(next);
      setUrl(next[0] || '/avatar-placeholder.svg');
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
    setUrl('/avatar-placeholder.svg');
  };
  return <img {...props} src={url} alt={alt} referrerPolicy={props.referrerPolicy || 'no-referrer'} onError={handleError} />;
}

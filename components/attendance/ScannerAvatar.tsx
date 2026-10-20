import React, { useEffect, useState } from 'react';
import ProfileAvatar, { defaultProfileImage } from '../ui/ProfileAvatar';
import { cachedScannerPhoto, scannerPhoto } from '../../lib/scannerPhotos';
import type { OfflineRoster } from '../../lib/offlineAttendance';

export default function ScannerAvatar({ roster, uid, src, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { roster?: OfflineRoster; uid: string }) {
  const [photo, setPhoto] = useState<string | undefined>(() => roster && src ? cachedScannerPhoto(roster.actorUid, uid, src) : undefined);
  useEffect(() => {
    let active = true;
    setPhoto(roster && src ? cachedScannerPhoto(roster.actorUid, uid, src) : undefined);
    if (roster && src) void scannerPhoto(roster, uid, src, () => active).then(data => { if (active) setPhoto(data); }).catch(() => {});
    return () => { active = false; };
  }, [roster?.id, roster?.actorUid, uid, src]);
  return photo || roster ? <img {...props} src={photo || defaultProfileImage} /> : <ProfileAvatar {...props} src={navigator.onLine ? src : undefined} />;
}

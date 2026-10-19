import { requireConfiguration, supabase } from './supabase';

export type HomepageVideo = { id: string; label: string; url: string; explainer: boolean };
const renders = import.meta.glob('../video-explainer/*.mp4', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const homepageVideos: HomepageVideo[] = [
  { id: 'videos/iars-explainer-1080p.mp4', label: 'IARS explainer (1080p)', url: `${import.meta.env.BASE_URL}videos/iars-explainer-1080p.mp4`, explainer: true },
  { id: 'videos/iars-explainer-720p.mp4', label: 'IARS explainer (720p)', url: `${import.meta.env.BASE_URL}videos/iars-explainer-720p.mp4`, explainer: true },
  ...Object.entries(renders).map(([path, url]) => ({ id: path.replace('../', ''), label: path.split('/').pop()!.replace('.mp4', '').replace(/[-_]/g, ' '), url, explainer: false })),
];
export const defaultHomepageVideo = homepageVideos[0];
export type HomepageVideoSetting = { video_id: string; updated_at: string };

export async function loadHomepageVideo(): Promise<HomepageVideoSetting> {
  requireConfiguration();
  const { data, error } = await supabase.from('rmc_homepage_video').select('video_id,updated_at').eq('id', 'homepage').single();
  if (error) throw error;
  return data;
}

export async function saveHomepageVideo(videoId: string, version: string): Promise<HomepageVideoSetting> {
  requireConfiguration();
  if (!homepageVideos.some(video => video.id === videoId)) throw new Error('Choose an available video.');
  const { data, error } = await supabase.from('rmc_homepage_video').update({ video_id: videoId }).eq('id', 'homepage').eq('updated_at', version).select('video_id,updated_at').maybeSingle();
  if (error) throw new Error('Unable to save the video. Check your connection and admin access, then try again.');
  if (!data) throw new Error('The selection changed or your admin access expired. Reload before saving again.');
  return data;
}

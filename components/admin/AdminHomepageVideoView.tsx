import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { useEffect, useState } from 'react';
import { Surface } from '../ui/Page';
import CustomSelect from '../ui/CustomSelect';
import Button from '../ui/Button';
import { homepageVideos, HomepageVideoSetting, loadHomepageVideo, saveHomepageVideo } from '../../lib/homepageVideos';

export default function AdminHomepageVideoView() {
  const [saved, setSaved] = useState<HomepageVideoSetting | null>(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const load = async () => {
    setLoading(true); setError(''); setMessage('');
    try { const value = await loadHomepageVideo(); setSaved(value); setSelected(value.video_id); }
    catch { setError('Unable to load the saved video. Check your connection and reload.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const video = homepageVideos.find(item => item.id === selected);
  return <Surface className="space-y-5 p-6 sm:p-8">
    <div><h2 className="text-xl font-bold">Homepage Video</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Choose a repository video, preview it, then save to update the homepage for all visitors.</p></div>
    {loading && <p role="status">Loading saved video…</p>}
    {error && <ErrorNotice error={error} operation="Admin Homepage Video View"></ErrorNotice>}
    {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
    {!loading && saved && <form className="space-y-5" onSubmit={async event => {
      event.preventDefault(); setSaving(true); setError(''); setMessage('');
      try { const value = await saveHomepageVideo(selected, saved.updated_at); setSaved(value); setMessage('Homepage video saved. Visitors will see it when they open the homepage.'); }
      catch (cause) { setError(errorMessage(cause)); }
      finally { setSaving(false); }
    }}>
      <CustomSelect label="Available videos" ariaLabel="Available videos" value={selected} disabled={saving} onChange={value => { setSelected(value as string); setPreviewFailed(false); setMessage(''); }} options={[
        ...(!video ? [{ value: selected, label: 'Saved video is unavailable — choose a replacement' }] : []),
        ...homepageVideos.map(item => ({ value: item.id, label: item.label })),
      ]} />
      {video && <div className="space-y-2"><video key={video.id} src={video.url} controls playsInline preload="metadata" aria-label="Homepage video preview" onError={() => setPreviewFailed(true)} className="aspect-video w-full rounded-2xl bg-brand-950" />
        {previewFailed && <ErrorNotice error="The preview could not load. Try another video." />}
        <p className="break-all text-xs text-slate-500">{video.id}</p>
      </div>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" fullWidth={false} loading={saving} disabled={!video || previewFailed || selected === saved.video_id}>Save homepage video</Button>
        <Button variant="secondary" fullWidth={false} disabled={saving || selected === saved.video_id} onClick={() => { setSelected(saved.video_id); setPreviewFailed(false); setMessage(''); }}>Cancel changes</Button>
      </div>
    </form>}
    {!loading && <button type="button" disabled={saving} onClick={() => { setPreviewFailed(false); void load(); }} className="text-sm font-semibold underline underline-offset-4">Reload saved selection</button>}
  </Surface>;
}

import { useState } from 'react';
import Button from './Button';
import { Modal } from './Modal';
import { Surface } from './Page';
import { usePwaInstall } from './PwaStatus';

export default function InstallAppSettings() {
  const { available, installed, installing, installApp } = usePwaInstall();
  const [instructions, setInstructions] = useState(false);
  return <Surface className="space-y-3 p-4 sm:p-6">
    <h2 className="font-bold">IARS on your device</h2>
    {installed ? <p role="status" className="text-sm">You’re using the installed app.</p> : <>
      <p className="text-sm text-slate-600 dark:text-slate-300">Add IARS to your home screen for quick access. Prepare attendance rosters online before using the scanner offline.</p>
      <Button variant="secondary" disabled={installing} onClick={() => available ? void installApp() : setInstructions(true)}>{installing ? 'Installing…' : 'Install IARS'}</Button>
    </>}
    <Modal open={instructions} onClose={() => setInstructions(false)} title="Install IARS" size="sm">
      <div className="space-y-4">
        <div><h3 className="font-semibold">iPhone or iPad</h3><p className="mt-1 text-sm">Open IARS in Safari. Tap Share, then Add to Home Screen (check More if needed). Enable Open as Web App if shown, then tap Add.</p></div>
        <div><h3 className="font-semibold">Android or computer</h3><p className="mt-1 text-sm">Open your browser’s menu and look for Install app or Add to Home screen. If the option is missing, try Chrome or Edge and visit IARS online.</p></div>
        <p className="text-sm text-slate-600 dark:text-slate-300">If already installed, open IARS from its home screen icon.</p>
      </div>
    </Modal>
  </Surface>;
}

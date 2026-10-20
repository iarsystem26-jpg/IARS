
import React from 'react';
import ReactDOM from 'react-dom/client';
import { applyEducationalUnitBranding } from './lib/educationalUnit';
import { initializeInstitution } from './lib/institutionRuntime';

applyEducationalUnitBranding();

window.addEventListener('error', event => console.error('[App] uncaught error', event.error || event.message));
window.addEventListener('unhandledrejection', event => console.error('[App] unhandled promise rejection', event.reason));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// Check the actual deployment before mounting a possibly cached workspace.
void initializeInstitution().then(async () => {
  applyEducationalUnitBranding();
  const { installDiagnostics } = await import('./lib/diagnostics');
  installDiagnostics();
  const [{ default: App }, { checkAppUpdates, isAppRefreshing, watchAppUpdates }] = await Promise.all([import('./App'), import('./lib/appUpdates')]);
  await checkAppUpdates().catch(() => {});
  if (isAppRefreshing()) return;
  watchAppUpdates();
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}).catch(error => {
  // A failed institution lookup must never fall back to another institution's backend.
  root.render(<main className="mx-auto max-w-lg p-8"><h1 className="text-xl font-bold">Unable to open institution</h1><p role="alert" className="mt-4">{error instanceof Error ? error.message : 'Please try again.'}</p><button className="mt-4 underline" onClick={() => location.reload()}>Try again</button></main>);
});

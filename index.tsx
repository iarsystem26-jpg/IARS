
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installDiagnostics } from './lib/diagnostics';
import { checkAppUpdates, isAppRefreshing, watchAppUpdates } from './lib/appUpdates';

installDiagnostics();

window.addEventListener('error', event => console.error('[App] uncaught error', event.error || event.message));
window.addEventListener('unhandledrejection', event => console.error('[App] unhandled promise rejection', event.reason));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// Check the actual deployment before mounting a possibly cached workspace.
void checkAppUpdates().catch(() => {}).then(() => {
  if (isAppRefreshing()) return;
  watchAppUpdates();
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

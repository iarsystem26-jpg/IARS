import React from 'react';
import { useLocation } from 'react-router-dom';
import Button from './Button';

class PageErrorBoundary extends React.Component<{ children: React.ReactNode; recoveryKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[App] page failed to load', error, info.componentStack);
  }

  componentDidUpdate(previousProps: Readonly<{ children: React.ReactNode; recoveryKey: string }>) {
    if (this.state.error && previousProps.recoveryKey !== this.props.recoveryKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const failedImport = /dynamically imported module|module script|loading chunk|chunkloaderror/i.test(this.state.error.message);
    return <main role="alert" className="mx-auto max-w-xl space-y-4 px-4 py-12 text-slate-800 dark:text-slate-100">
      <h1 className="text-2xl font-bold">{failedImport ? 'This page could not be downloaded' : 'This page could not be displayed'}</h1>
      <p>{failedImport ? 'Check your connection and reload to get the latest page files.' : 'Reload the page to try again.'}</p>
      <Button fullWidth={false} onClick={() => window.location.reload()}>Reload page</Button>
    </main>;
  }
}

export default function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const recoveryKey = location.pathname + location.search;
  // Reset failures on navigation without remounting the healthy workspace.
  return <PageErrorBoundary recoveryKey={recoveryKey}>{children}</PageErrorBoundary>;
}

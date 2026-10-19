import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PwaStatus from './PwaStatus';
import InstallAppSettings from './InstallAppSettings';

const worker = vi.hoisted(() => ({ needRefresh: false, update: vi.fn(), dismiss: vi.fn(), onRegisteredSW: undefined as undefined | ((url: string, registration?: ServiceWorkerRegistration) => void) }));
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: (options: { onRegisteredSW: typeof worker.onRegisteredSW }) => {
  worker.onRegisteredSW = options.onRegisteredSW;
  return { needRefresh: [worker.needRefresh, worker.dismiss], updateServiceWorker: worker.update };
} }));
beforeEach(() => {
  worker.needRefresh = false; worker.update.mockReset(); worker.dismiss.mockReset(); worker.onRegisteredSW = undefined;
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

async function registerWorker(update = vi.fn().mockResolvedValue(undefined), installing: ServiceWorker | null = null) {
  await act(async () => worker.onRegisteredSW?.('/sw.js', { update, installing } as unknown as ServiceWorkerRegistration));
  return update;
}

it('checks after registration and every five minutes without applying an update', async () => {
  vi.useFakeTimers();
  render(<PwaStatus />);
  const check = await registerWorker();
  expect(check).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTime(5 * 60 * 1000 - 1));
  expect(check).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTime(1));
  expect(check).toHaveBeenCalledTimes(2);
  expect(worker.update).not.toHaveBeenCalled();
});

it('checks when the window regains focus, the tab becomes visible, or internet returns', async () => {
  render(<PwaStatus />);
  const check = await registerWorker();
  check.mockClear();
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(check).toHaveBeenCalledTimes(1);
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('hidden');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(check).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(check).toHaveBeenCalledTimes(2);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await act(async () => window.dispatchEvent(new Event('offline')));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(check).toHaveBeenCalledTimes(3);
});

it('skips background checks while offline or hidden and resumes on return', async () => {
  vi.useFakeTimers();
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  render(<PwaStatus />);
  const check = await registerWorker();
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(5 * 60 * 1000);
  });
  expect(check).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  visibility.mockReturnValue('hidden');
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(5 * 60 * 1000);
  });
  expect(check).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(check).toHaveBeenCalledOnce();
});

it('does not overlap pending checks and retries after a failed check', async () => {
  let rejectCheck!: (reason: Error) => void;
  const check = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { rejectCheck = reject; }))
    .mockResolvedValue(undefined);
  render(<PwaStatus />);
  await registerWorker(check);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
  });
  expect(check).toHaveBeenCalledOnce();
  await act(async () => rejectCheck(new Error('Network unavailable')));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(check).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(worker.update).not.toHaveBeenCalled();
});

it('waits until a worker finishes installing before checking again', async () => {
  render(<PwaStatus />);
  const registration = { update: vi.fn().mockResolvedValue(undefined), installing: {} as ServiceWorker | null };
  await act(async () => worker.onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration));
  expect(registration.update).not.toHaveBeenCalled();
  registration.installing = null;
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(registration.update).toHaveBeenCalledOnce();
});

it('removes the update timer and event listeners when unmounted', async () => {
  vi.useFakeTimers();
  const { unmount } = render(<PwaStatus />);
  const check = await registerWorker();
  check.mockClear();
  unmount();
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10 * 60 * 1000);
  });
  expect(check).not.toHaveBeenCalled();
});

it('handles an unavailable service worker registration', async () => {
  vi.useFakeTimers();
  render(<PwaStatus />);
  await act(async () => worker.onRegisteredSW?.('/sw.js', undefined));
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(5 * 60 * 1000);
  });
  expect(worker.update).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('App status')).toBeNull();
});

it('explains offline restrictions and clears them after reconnecting', () => {
  render(<PwaStatus />);
  expect(screen.queryByLabelText('App status')).toBeNull();
  act(() => window.dispatchEvent(new Event('offline')));
  expect(screen.getByRole('status')).toHaveTextContent('Prepared attendance rosters can be used offline');
  expect(screen.getByRole('status')).toHaveTextContent('pending until synced');
  act(() => window.dispatchEvent(new Event('online')));
  expect(screen.queryByLabelText('App status')).toBeNull();
});

it('only applies an update after an explicit click', async () => {
  worker.needRefresh = true;
  render(<PwaStatus />);
  expect(worker.update).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Save your work');
  fireEvent.click(screen.getByRole('button', { name: 'Later' }));
  expect(worker.dismiss).toHaveBeenCalledWith(false);
  expect(worker.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload to update' }));
  await waitFor(() => expect(worker.update).toHaveBeenCalledWith(true));
});

it('offers browser installation and waits for the user to accept it', async () => {
  render(<PwaStatus />);
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  act(() => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(screen.getByRole('complementary', { name: 'Install IARS' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body).not.toHaveStyle({ overflow: 'hidden' });
  expect(prompt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Install IARS' }));
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Install IARS' })).toBeNull());
});

it('dismisses the install notification after twelve seconds without prompting the browser', () => {
  vi.useFakeTimers();
  render(<PwaStatus />);
  const prompt = vi.fn();
  act(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }) })));
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '12');
  act(() => vi.advanceTimersByTime(12000));
  expect(screen.queryByRole('complementary', { name: 'Install IARS' })).toBeNull();
  expect(prompt).not.toHaveBeenCalled();
});

it('keeps native installation available in profile settings after the notification closes', async () => {
  vi.useFakeTimers();
  render(<PwaStatus><InstallAppSettings /></PwaStatus>);
  const prompt = vi.fn().mockResolvedValue(undefined);
  act(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })));
  act(() => vi.advanceTimersByTime(12000));
  expect(screen.queryByRole('complementary', { name: 'Install IARS' })).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Install IARS' })));
  expect(prompt).toHaveBeenCalledOnce();
});

it('provides manual installation instructions when the browser has no install prompt', () => {
  render(<PwaStatus><InstallAppSettings /></PwaStatus>);
  fireEvent.click(screen.getByRole('button', { name: 'Install IARS' }));
  expect(screen.getByRole('dialog', { name: 'Install IARS' })).toHaveTextContent('Add to Home Screen');
  expect(screen.getByRole('dialog')).toHaveTextContent('Open as Web App');
});

it('removes install controls when the browser confirms installation', () => {
  render(<PwaStatus><InstallAppSettings /></PwaStatus>);
  act(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) })));
  act(() => window.dispatchEvent(new Event('appinstalled')));
  expect(screen.queryByRole('button', { name: 'Install IARS' })).toBeNull();
  expect(screen.getByText('You’re using the installed app.')).toBeInTheDocument();
});

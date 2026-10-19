import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ documentUrl: vi.fn() }));
vi.mock('../../lib/backend', () => ({ documentUrl: api.documentUrl }));
vi.mock('../../lib/googleDrive', () => ({ driveImageCandidates: (value: string) => [value] }));
import ProfileAvatar from './ProfileAvatar';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('falls back without logging signed image credentials or issuing diagnostic requests', async () => {
  const secretUrl = 'https://test.supabase.co/storage/v1/object/sign/photo?token=secret-signed-token';
  api.documentUrl.mockResolvedValue(secretUrl);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  render(<ProfileAvatar src="storage://private-owner/photo/image.png" alt="Profile" />);
  const image = screen.getByRole('img', { name: 'Profile' });
  await waitFor(() => expect(image).toHaveAttribute('src', secretUrl));
  fireEvent.error(image);
  expect(image).toHaveAttribute('src', '/avatar-placeholder.svg');
  expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-signed-token');
  expect(error).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
it('keeps URL-resolution failures free of document credentials', async () => {
  api.documentUrl.mockRejectedValue(new Error('signed-token-in-backend-error'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<ProfileAvatar src="storage://private/photo/image.png" alt="Profile" />);
  await waitFor(() => expect(warn).toHaveBeenCalledOnce());
  expect(JSON.stringify(warn.mock.calls)).not.toContain('signed-token-in-backend-error');
  expect(screen.getByRole('img')).toHaveAttribute('src', '/avatar-placeholder.svg');
});

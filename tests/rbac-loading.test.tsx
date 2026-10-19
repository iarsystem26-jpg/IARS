import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ requireConfiguration: () => {}, supabase: { rpc: api.rpc } }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: { uid: 'admin' } }) }));

import { appData, refreshData, resetData } from '../lib/backend';
import { DEFAULT_CORE_ROLES } from '../lib/accessControl';
import { AdminRBACRoleView } from '../components/admin/AdminRBACRoleView';
import { RoleAssignment } from '../components/admin/RoleAssignment';

beforeEach(() => { resetData('admin'); vi.clearAllMocks(); });
afterEach(() => { cleanup(); resetData(); });

it('shows asynchronously loaded roles and assignment options without remounting', async () => {
  render(<><RoleAssignment /><AdminRBACRoleView /></>);
  expect(screen.queryByText('SSG Officer')).not.toBeInTheDocument();
  expect(screen.getByText('Loading roles…')).toBeInTheDocument();
  expect(screen.queryByText(/No custom roles created yet/)).not.toBeInTheDocument();
  const custom = { id: 'custom', name: 'Guidance Officer', description: 'Guidance', isPositionOnly: true, permissions: [], isBuiltIn: false };
  const data = {
    roles: { ...DEFAULT_CORE_ROLES, custom }, nodes: [], sanctions: [], attendance: [],
    profiles: [], events: [], applications: [], excuses: [], settings: {}, audit: [],
  };
  api.rpc.mockResolvedValue({ data, error: null });
  await act(async () => { await refreshData(); });
  expect(api.rpc).toHaveBeenCalledWith('rmc_snapshot');
  expect(screen.getByRole('button', { name: 'Edit role SSG Officer' })).toBeInTheDocument();
  expect(screen.getByText('Guidance Officer')).toBeInTheDocument();
  expect(screen.queryByText('Loading roles…')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Role or position' }));
  expect(screen.getByRole('option', { name: 'SSG Officer' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Guidance Officer (position)' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Role or position' }));

  // A fresh snapshot replaces the role maps, including edits made elsewhere.
  api.rpc.mockResolvedValue({ data: { ...data, roles: { ...DEFAULT_CORE_ROLES, custom: { ...custom, name: 'Updated Guidance Officer' } } }, error: null });
  await act(async () => { await refreshData(); });
  expect(screen.queryByText('Guidance Officer')).not.toBeInTheDocument();
  expect(screen.getByText('Updated Guidance Officer')).toBeInTheDocument();
  act(() => resetData());
  expect(appData.getCoreRoles()).toEqual({});
  expect(screen.queryByRole('button', { name: 'Edit role SSG Officer' })).not.toBeInTheDocument();
  expect(screen.queryByText('Updated Guidance Officer')).not.toBeInTheDocument();
});

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { mockData } from './fixtures/demoBackend';
import { hasPermission } from '../lib/accessControl';
import { AdminRBACRoleView } from '../components/admin/AdminRBACRoleView';

vi.mock('../lib/backend', async () => {
  const m = await import('./fixtures/demoBackend');
  // Production getters return stable references; the localStorage fixture parses
  // fresh objects, so match the store's useSyncExternalStore contract here.
  const stable = <T,>(read: () => T) => {
    let cached: T;
    let serialized: string | undefined;
    return () => {
      const value = read();
      const next = JSON.stringify(value);
      if (next !== serialized) { cached = value; serialized = next; }
      return cached;
    };
  };
  return {
    appData: { ...m.mockData, getCoreRoles: stable(m.mockData.getCoreRoles), getCustomRoles: stable(m.mockData.getCustomRoles) },
    appAuth: m.mockAuth,
    documentUrl: async (p: string) => p,
    subscribeData: (callback: () => void) => {
      window.addEventListener('rmc_data_update', callback);
      return () => window.removeEventListener('rmc_data_update', callback);
    },
  };
});

describe('Admin RBAC Role Editing and Permission Enforcement', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('rmc_mock_session', 'mock_uid_admin');
  });

  it('allows admins to view and edit built-in core roles', () => {
    render(<AdminRBACRoleView actorName="System Admin" />);

    // Built-in core system roles section should exist
    expect(screen.getByText(/Core System Roles \(Built-in\)/i)).toBeInTheDocument();

    // Check that core system roles have edit buttons
    const editRoleButtons = screen.getAllByRole('button', { name: /Edit role/i });
    expect(editRoleButtons.length).toBeGreaterThanOrEqual(6);

    // Edit OSSA Administrator role
    const ossaEditButton = screen.getByRole('button', { name: /Edit role OSSA Administrator/i });
    fireEvent.click(ossaEditButton);

    // Modal should open
    expect(screen.getByText(/Edit System Core Role/i)).toBeInTheDocument();

    // Submit changes
    const submitButton = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(submitButton);
  });

  it('updates permissions for core system roles dynamically in hasPermission', () => {
    const initialCore = mockData.getCoreRoles();
    expect(initialCore.ssg.permissions).toContain('events.manage');
    expect(hasPermission('ssg', 'events.manage')).toBe(true);

    // Admin edits SSG role to remove events.manage
    mockData.updateCoreRole('ssg', {
      ...initialCore.ssg,
      permissions: initialCore.ssg.permissions.filter(p => p !== 'events.manage')
    });

    // Permission check should now return false for ssg
    expect(hasPermission('ssg', 'events.manage')).toBe(false);
  });

  it('shows the SSG workflow defaults and lets ADMIN toggle both rules', () => {
    render(<AdminRBACRoleView actorName="System Admin" />);
    fireEvent.click(screen.getByRole('button', { name: /Edit role SSG Officer/i }));
    const units = screen.getByRole('checkbox', { name: 'Create Directory Units' });
    const approval = screen.getByRole('checkbox', { name: 'Require OSSA Approval' });
    expect(units).not.toBeChecked();
    expect(approval).toBeChecked();
    fireEvent.click(units);
    fireEvent.click(approval);
    expect(units).toBeChecked();
    expect(approval).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    expect(mockData.getCoreRoles().ssg.permissions).toContain('directory.create_units');
    expect(mockData.getCoreRoles().ssg.permissions).not.toContain('events.require_ossa_approval');
  });
  it('lets ADMIN grant and revoke calendar management independently for OSSA Staff', async () => {
    render(<AdminRBACRoleView actorName="System Admin" />);
    fireEvent.click(screen.getByRole('button', { name: /Edit role OSSA Staff/i }));
    expect(screen.getByRole('checkbox', { name: 'View Calendar' })).toBeChecked();
    const manage = screen.getByRole('checkbox', { name: 'Manage Holidays & Suspensions' });
    const school = screen.getByRole('checkbox', { name: 'Manage School-wide Suspensions' });
    expect(manage).not.toBeChecked(); expect(school).not.toBeChecked();
    fireEvent.click(manage);
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    expect(mockData.getCoreRoles().ossa_staff.permissions).toContain('calendar.manage_closures');
    expect(mockData.getCoreRoles().ossa_staff.permissions).not.toContain('calendar.manage_schoolwide');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Edit role OSSA Staff/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Manage Holidays & Suspensions' }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    expect(mockData.getCoreRoles().ossa_staff.permissions).not.toContain('calendar.manage_closures');
  });
});

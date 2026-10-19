import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ManagedAccountsTable from '../components/admin/ManagedAccountsTable';
import { UserProfile } from '../types';
import { changeField as change } from './ui-select';

afterEach(cleanup);
const accounts = Array.from({ length: 23 }, (_, index) => ({ uid: `id-${index}`, name: `Person ${index + 1}`, username: `user${index}`, email: `user${index}@school.test`, student_id: `RMC-${index}`, role: index % 2 ? 'ssg' : 'ossa', school_data: { department: 'Engineering' } } as UserProfile));
const access = Object.fromEntries(accounts.map((account, index) => [account.uid, { last_sign_in_at: index % 3 ? '2026-09-28T10:00:00Z' : null }]));
const setup = (props = {}) => render(<ManagedAccountsTable accounts={accounts} access={access} loading={false} accessError="" onRefresh={vi.fn()} onSelect={vi.fn()} {...props} />);

describe('Managed accounts table', () => {
  it('paginates without losing or duplicating accounts, and resets when page size changes', () => {
    setup();
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Person 11')).toBeInTheDocument();
    expect(screen.queryByText('Person 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('status')).toHaveTextContent('21–23 of 23');
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    change('Rows per page', '5');
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(6);
  });

  it('combines search tokens across fields, ignores accents and recognizes OSSA aliases', () => {
    setup({ accounts: [{ ...accounts[0], name: 'José Santos' }] });
    change('Search managed accounts', '  engineering OSSA jose RMC-0  ');
    expect(screen.getByText('José Santos')).toBeInTheDocument();
    change('Search managed accounts', 'jose missing');
    expect(screen.getByText('No accounts match your search and filters.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 of 0');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('José Santos')).toBeInTheDocument();
  });

  it('combines role and activity filters and returns to the first page', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    change('Role', 'ossa'); change('Sign-in activity', 'never');
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1–4 of 4 accounts (23 total)');
    expect(screen.getByText('Person 1')).toBeInTheDocument();
    expect(screen.queryByText('Person 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Person 3')).not.toBeInTheDocument();
  });

  it('keeps unavailable activity distinct from accounts that never signed in', () => {
    const refresh = vi.fn();
    setup({ access: {}, accessError: 'Connection failed.', onRefresh: refresh });
    expect(screen.getByRole('alert')).toHaveTextContent('SYS-001');
    change('Sign-in activity', 'never');
    expect(screen.getByRole('status')).toHaveTextContent('0 of 0');
    change('Sign-in activity', 'unknown');
    expect(screen.getByRole('status')).toHaveTextContent('1–10 of 23');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh access status' }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('sorts by recent sign-in and opens the correct row after filtering', () => {
    const select = vi.fn();
    setup({ onSelect: select, access: { 'id-0': { last_sign_in_at: '2026-09-27T10:00:00Z' }, 'id-22': { last_sign_in_at: '2026-09-28T10:00:00Z' } } });
    change('Sort by', 'recent');
    expect(within(screen.getAllByRole('row')[1]).getByText('Person 23')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View profile for Person 23' }));
    expect(select).toHaveBeenCalledWith(accounts[22]);
  });

  it('clamps the page when the underlying account list shrinks', () => {
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    view.rerender(<ManagedAccountsTable accounts={accounts.slice(0, 2)} access={access} loading={false} accessError="" onRefresh={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1–2 of 2');
  });
});

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SchoolNode } from '../../types';
import { EventRecipientPicker } from './EventRecipientPicker';

afterEach(cleanup);
it('offers non-admin roles and combines staff with the student audience', () => {
  const changed = vi.fn(); render(<Harness changed={changed} initial={['All Students']} />);
  fireEvent.click(screen.getByRole('button', { name: /^Recipient type/ }));
  expect(screen.getByRole('option', { name: 'All OSSA Administrators' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'All OSSA Staff' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Admin.*System|System.*Admin/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'All OSSA Staff' }));
  fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));
  expect(changed).toHaveBeenLastCalledWith(['All Students', 'role:ossa_staff']);
  expect(screen.getByRole('status')).toHaveTextContent('All OSSA Staff');
  expect(screen.getByRole('button', { name: /add recipient/i })).toBeDisabled();
  choose(/^Recipient type/, 'All Students');
  fireEvent.click(screen.getByRole('button', { name: 'Remove All Students' }));
  fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));
  expect(changed).toHaveBeenLastCalledWith(['role:ossa_staff', 'All Students']);
});
const roots: SchoolNode[] = [
  { id: 'general', name: 'General', type: 'education_unit', children: [
    { id: 'computing', name: 'Computing', type: 'college', children: [{ id: 'it', name: 'IT', type: 'program' }] },
    { id: 'hidden', name: 'Archived', type: 'college', metadata: { archived: true } },
    { id: 'disabled', name: 'Not for events', type: 'college', metadata: { selectableForEvents: false } },
  ] },
  { id: 'standalone', name: 'Standalone', type: 'education_unit' },
];
const choose = (label: RegExp, option: string) => {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};
function Harness({ changed = vi.fn(), initial = [] }: { changed?: (groups: string[]) => void; initial?: string[] }) {
  const [selected, setSelected] = useState(initial);
  return <EventRecipientPicker roots={roots} selected={selected} onChange={groups => { setSelected(groups); changed(groups); }} />;
}
it('adds a general unit without requiring a child, then adds another recipient', () => {
  const changed = vi.fn(); render(<Harness changed={changed} initial={['All Students']} />);
  expect(screen.getByRole('button', { name: /add recipient/i })).toBeDisabled();
  choose(/^Education Unit/, 'General');
  expect(screen.getByRole('button', { name: /^College/ })).toHaveTextContent('All of General');
  fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));
  expect(changed).toHaveBeenLastCalledWith(['node:general']);
  choose(/^Education Unit/, 'Standalone');
  fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));
  expect(changed).toHaveBeenLastCalledWith(['node:general', 'node:standalone']);
  expect(screen.getByRole('status')).toHaveTextContent('2 recipients added');
  fireEvent.click(screen.getByRole('button', { name: 'Remove General' }));
  expect(changed).toHaveBeenLastCalledWith(['node:standalone']);
});
it('uses the most specific selection, prevents duplicates, and can return to the parent', () => {
  const changed = vi.fn(); render(<Harness changed={changed} />);
  choose(/^Education Unit/, 'General'); choose(/^College/, 'Computing'); choose(/^Degree Program/, 'IT');
  fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));
  expect(changed).toHaveBeenLastCalledWith(['node:it']);
  expect(screen.getByRole('status')).toHaveTextContent('General / Computing / IT');
  choose(/^Education Unit/, 'General'); choose(/^College/, 'Computing'); choose(/^Degree Program/, 'IT');
  expect(screen.getByRole('button', { name: /add recipient/i })).toBeDisabled();
  choose(/^Degree Program/, 'All of Computing');
  fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));
  expect(changed).toHaveBeenLastCalledWith(['node:it', 'node:computing']);
});
it('excludes archived and disabled units and clears descendants after switching branches', () => {
  render(<Harness />);
  choose(/^Education Unit/, 'General');
  fireEvent.click(screen.getByRole('button', { name: /^College/ }));
  expect(screen.queryByRole('option', { name: 'Archived' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Not for events' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Computing' }));
  choose(/^Education Unit/, 'Standalone');
  expect(screen.queryByRole('button', { name: /^College/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Degree Program/ })).not.toBeInTheDocument();
});
it('renders saved recipients and keeps all-students selection exclusive', () => {
  const changed = vi.fn(); render(<Harness initial={['node:it', 'Legacy group']} changed={changed} />);
  expect(within(screen.getByRole('status')).getByText('General / Computing / IT')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Legacy group');
  choose(/^Recipient type/, 'All Students');
  fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));
  expect(changed).toHaveBeenLastCalledWith(['All Students']);
});

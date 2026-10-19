import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssignedUnitPicker from './AssignedUnitPicker';
import { SchoolNode } from '../../types';

afterEach(cleanup);
const roots: SchoolNode[] = [
  { id: 'general', name: 'General', type: 'education_unit', children: [
    { id: 'college', name: 'Computing', type: 'college', children: [{ id: 'program', name: 'IT', type: 'program' }] },
    { id: 'hidden', name: 'Archived', type: 'college', metadata: { archived: true } },
  ] },
  { id: 'standalone', name: 'Standalone', type: 'education_unit' },
];
function Harness({ onChange = vi.fn(), value: initial = '' }: { onChange?: (value: string) => void; value?: string }) {
  const [value, setValue] = useState(initial);
  return <AssignedUnitPicker roots={roots} value={value} onChange={id => { setValue(id); onChange(id); }} />;
}
const choose = (label: RegExp, name: string) => {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(screen.getByRole('option', { name }));
};
describe('Assigned unit hierarchy', () => {
  it('reveals only the next level and assigns the deepest selected unit', () => {
    const changed = vi.fn(); render(<Harness onChange={changed} />);
    expect(screen.queryByRole('button', { name: /^College/ })).toBeNull();
    choose(/^Education Unit/i, 'General');
    expect(changed).toHaveBeenLastCalledWith('general');
    expect(screen.queryByRole('button', { name: /^Degree Program/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^College/ }));
    expect(screen.queryByRole('option', { name: 'Archived' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Computing' }));
    choose(/^Degree Program/, 'IT');
    expect(changed).toHaveBeenLastCalledWith('program');
    expect(screen.getByLabelText('Selected academic path')).toHaveTextContent('General / Computing / IT');
    expect(screen.getByText(/no sub-units/)).toBeInTheDocument();
  });
  it('can return to the parent assignment and clears descendants when changing branches', () => {
    const changed = vi.fn(); render(<Harness value="program" onChange={changed} />);
    choose(/^College/, 'All of General');
    expect(changed).toHaveBeenLastCalledWith('general');
    expect(screen.queryByRole('button', { name: /^Degree Program/ })).toBeNull();
    choose(/^Education Unit/i, 'Standalone');
    expect(changed).toHaveBeenLastCalledWith('standalone');
    expect(screen.queryByRole('button', { name: /^College/ })).toBeNull();
    expect(screen.getByLabelText('Selected academic path')).toHaveTextContent('Standalone');
    expect(screen.getByText(/no sub-units/)).toBeInTheDocument();
  });
});


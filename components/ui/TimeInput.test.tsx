import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DateTimeInput, TimeInput } from './TimeInput';

afterEach(cleanup);
it('converts AM/PM input to the stored 24-hour wall time', () => {
  function Example() {
    const [value, setValue] = useState('00:08');
    return <><TimeInput aria-label="Start" value={value} onChange={e => setValue(e.target.value)} /><output>{value}</output></>;
  }
  render(<Example />);
  expect(screen.getByRole('combobox', { name: 'Start hour' })).toHaveValue('12');
  fireEvent.change(screen.getByRole('combobox', { name: 'Start AM/PM' }), { target: { value: 'PM' } });
  expect(screen.getByRole('status')).toHaveTextContent('12:08');
  fireEvent.change(screen.getByRole('combobox', { name: 'Start hour' }), { target: { value: '5' } });
  expect(screen.getByRole('status')).toHaveTextContent('17:08');
});
it('preserves the date while changing the Manila clock time', () => {
  function Example() {
    const [value, setValue] = useState('2026-10-03T17:05');
    return <><DateTimeInput aria-label="Event" value={value} onChange={e => setValue(e.target.value)} /><output>{value}</output></>;
  }
  render(<Example />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Event time (Manila) AM/PM' }), { target: { value: 'AM' } });
  expect(screen.getByRole('status')).toHaveTextContent('2026-10-03T05:05');
});

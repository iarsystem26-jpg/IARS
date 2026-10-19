import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DropdownPanel } from './DropdownPanel';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('makes closing results inert immediately and removes them after the CSS duration', () => {
  vi.useFakeTimers();
  const panel = (open: boolean) => <DropdownPanel open={open} style={{ transitionDuration: '160ms' }}><button role="option">Result</button></DropdownPanel>;
  const view = render(panel(true));
  view.rerender(panel(false));
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  expect(screen.getByRole('option', { hidden: true }).parentElement).toHaveAttribute('inert');
  act(() => vi.advanceTimersByTime(159));
  expect(screen.getByText('Result')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText('Result')).not.toBeInTheDocument();
});

it('cancels pending removal when the menu reopens during its exit', () => {
  vi.useFakeTimers();
  const panel = (open: boolean) => <DropdownPanel open={open} style={{ transitionDuration: '0.16s' }}><button role="option">Result</button></DropdownPanel>;
  const view = render(panel(true));
  view.rerender(panel(false));
  act(() => vi.advanceTimersByTime(80));
  view.rerender(panel(true));
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('option')).toBeInTheDocument();
  expect(screen.getByRole('option').parentElement).not.toHaveAttribute('inert');
});

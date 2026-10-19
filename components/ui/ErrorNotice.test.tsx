import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ErrorNotice from './ErrorNotice';

afterEach(cleanup);
it('shows a developer label, code and red-outline ownership for a missing function', () => {
  render(<ErrorNotice error={{ code: 'PGRST202' }} operation="Request certificate" />);
  expect(screen.getByRole('alert')).toHaveAttribute('data-owner', 'developer');
  expect(screen.getByText('Developer fix needed')).toBeInTheDocument();
  expect(screen.getByText('SYS-002')).toBeInTheDocument();
  expect(screen.getByText('Request certificate')).toBeInTheDocument();
});
it('keeps permission problems distinct and retains retry controls', () => {
  render(<ErrorNotice error={{ status: 403 }}><button>Refresh account</button></ErrorNotice>);
  expect(screen.getByRole('alert')).toHaveAttribute('data-owner', 'school');
  expect(screen.getByRole('button', { name: 'Refresh account' })).toBeInTheDocument();
});

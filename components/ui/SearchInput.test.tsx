import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import SearchInput from './SearchInput';

afterEach(cleanup);

it('uses the normalized search styling and clears a controlled value', async () => {
  const user = userEvent.setup();

  function Harness() {
    const [value, setValue] = useState('student');
    return <SearchInput ariaLabel="Search members" onChange={setValue} placeholder="Search name or ID" value={value} />;
  }

  render(<Harness />);

  const input = screen.getByRole('searchbox', { name: /search members/i });
  expect(input).toHaveClass('app-search-input');
  await user.click(screen.getByRole('button', { name: /clear search members/i }));
  expect(input).toHaveValue('');
  expect(input).toHaveFocus();
});

it('renders a consistent visible label when supplied', () => {
  render(<SearchInput ariaLabel="Search sanctions" label="Search students" onChange={() => undefined} value="" />);

  expect(screen.getByText('Search students')).toHaveClass('app-field-label');
  expect(screen.getByRole('searchbox', { name: /search sanctions/i })).toHaveAttribute('type', 'search');
});

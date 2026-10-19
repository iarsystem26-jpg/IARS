import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '../components/ThemeContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';

describe('global UI baseline', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the theme control keyboard operable with an accessible state label', async () => {
    const user = userEvent.setup();

    render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(ThemeToggle),
      ),
    );

    const toggle = screen.getByRole('button', { name: /current theme: system theme/i });
    await user.tab();
    expect(toggle).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(toggle).toHaveAccessibleName(/current theme: light mode/i);
  });
});

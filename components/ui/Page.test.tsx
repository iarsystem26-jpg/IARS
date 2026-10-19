import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Page, PageHeader, Surface } from './Page';

it('renders the shared page hierarchy', () => {
  render(
    <Page>
      <PageHeader eyebrow="Student" title="Attendance" description="Current term" />
      <Surface aria-label="Records">Rows</Surface>
    </Page>,
  );

  expect(screen.getByRole('heading', { name: 'Attendance' })).toBeVisible();
  expect(screen.getByLabelText('Records')).toHaveClass('app-surface');
});

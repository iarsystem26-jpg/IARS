import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import CustomSelect from './CustomSelect';

afterEach(cleanup);

it('closes only the select when Escape is pressed inside a surrounding dialog', async () => {
  const user = userEvent.setup();
  const parentKeyDown = vi.fn();
  render(<div onKeyDown={parentKeyDown}><CustomSelect label="Status" value="" onChange={() => undefined}
    options={[{ value: 'ready', label: 'Ready' }, { value: '', label: 'Not configured' }]} /></div>);
  await user.click(screen.getByRole('button', { name: /status.*not configured/i }));
  expect(screen.getByRole('option', { name: 'Not configured' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(parentKeyDown).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /status.*not configured/i })).toHaveFocus();
});

it('selects and clears every supplied option without imposing caller-specific sentinel values', async () => {
  const user = userEvent.setup();

  function ControlledSelect() {
    const [value, setValue] = useState<string[]>([]);
    return (
      <CustomSelect
        label="Regions"
        multi
        onChange={(nextValue) => setValue(nextValue as string[])}
        options={[
          { value: 'north', label: 'North Campus' },
          { value: 'south', label: 'South Campus' },
        ]}
        placeholder="Choose regions"
        value={value}
      />
    );
  }

  render(<ControlledSelect />);

  const trigger = screen.getByRole('button', { name: /regions.*choose regions/i });
  await user.click(trigger);
  const options = screen.getByRole('listbox', { name: /regions options/i });
  const selectAll = within(options).getByRole('option', { name: /select all/i });

  await user.click(selectAll);
  expect(trigger).toHaveAccessibleName(/regions.*all selected/i);
  expect(within(options).getByRole('option', { name: /north campus/i })).toHaveAttribute('aria-selected', 'true');
  expect(within(options).getByRole('option', { name: /south campus/i })).toHaveAttribute('aria-selected', 'true');

  await user.click(selectAll);
  expect(trigger).toHaveAccessibleName(/regions.*choose regions/i);
  expect(within(options).getByRole('option', { name: /north campus/i })).toHaveAttribute('aria-selected', 'false');
  expect(within(options).getByRole('option', { name: /south campus/i })).toHaveAttribute('aria-selected', 'false');
});

it('supports listbox arrow navigation, selection, Escape, and trigger focus restoration', async () => {
  const user = userEvent.setup();

  function ControlledSelect() {
    const [value, setValue] = useState('');
    return (
      <CustomSelect
        label="Campus"
        onChange={(nextValue) => setValue(nextValue as string)}
        options={[
          { value: 'north', label: 'North Campus' },
          { value: 'south', label: 'South Campus' },
          { value: 'west', label: 'West Campus' },
        ]}
        value={value}
      />
    );
  }

  render(<ControlledSelect />);

  const trigger = screen.getByRole('button', { name: /campus.*select/i });
  trigger.focus();
  await user.keyboard('{ArrowDown}');

  const listbox = screen.getByRole('listbox', { name: /campus options/i });
  const north = within(listbox).getByRole('option', { name: /north campus/i });
  const south = within(listbox).getByRole('option', { name: /south campus/i });
  expect(north).toHaveFocus();

  await user.keyboard('{ArrowDown}{Enter}');
  expect(trigger).toHaveAccessibleName(/campus.*south campus/i);
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('listbox', { name: /campus options/i })).not.toBeInTheDocument();

  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('option', { name: /south campus/i })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('listbox', { name: /campus options/i })).not.toBeInTheDocument();
});

it('gives searchable listbox controls accessible names and keyboard access to results', async () => {
  const user = userEvent.setup();
  render(
    <CustomSelect
      label="Campus"
      onChange={() => undefined}
      options={[
        { value: 'north', label: 'North Campus' },
        { value: 'south', label: 'South Campus' },
      ]}
      searchable
      value=""
    />,
  );

  await user.click(screen.getByRole('button', { name: /campus.*select/i }));
  const search = screen.getByRole('textbox', { name: /search campus options/i });
  await user.click(search);
  await user.type(search, 'south');
  expect(screen.getByRole('button', { name: /clear campus options search/i })).toBeInTheDocument();

  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('option', { name: /south campus/i })).toHaveFocus();
});

it('keeps normal tab order inside the widget and dismisses only when focus leaves it', async () => {
  const user = userEvent.setup();
  render(
    <>
      <button type="button">Before select</button>
      <CustomSelect
        label="Campus"
        onChange={() => undefined}
        options={[
          { value: 'north', label: 'North Campus' },
          { value: 'south', label: 'South Campus' },
        ]}
        searchable
        value=""
      />
      <button type="button">After select</button>
    </>,
  );

  const trigger = screen.getByRole('button', { name: /campus.*select/i });
  await user.click(trigger);
  const north = screen.getByRole('option', { name: /north campus/i });
  const search = screen.getByRole('textbox', { name: /search campus options/i });
  expect(north).toHaveFocus();

  await user.tab({ shift: true });
  expect(search).toHaveFocus();
  expect(screen.getByRole('listbox', { name: /campus options/i })).toBeInTheDocument();

  await user.tab();
  expect(north).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: /after select/i })).toHaveFocus();
  expect(screen.queryByRole('listbox', { name: /campus options/i })).not.toBeInTheDocument();

  await user.click(trigger);
  await user.tab({ shift: true });
  expect(screen.getByRole('textbox', { name: /search campus options/i })).toHaveFocus();
  await user.tab({ shift: true });
  expect(trigger).toHaveFocus();
  expect(screen.getByRole('listbox', { name: /campus options/i })).toBeInTheDocument();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: /before select/i })).toHaveFocus();
  expect(screen.queryByRole('listbox', { name: /campus options/i })).not.toBeInTheDocument();
});

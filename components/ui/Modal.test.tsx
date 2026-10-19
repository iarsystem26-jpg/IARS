import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Modal } from './Modal';

afterEach(cleanup);

it('labels the dialog, locks scrolling, and closes on Escape', async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  render(<Modal open onClose={onClose} title="Event details">Body</Modal>);

  expect(screen.getByRole('dialog', { name: 'Event details' })).toBeVisible();
  expect(document.body).toHaveClass('app-scroll-lock');
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
});

it('does not backdrop-close a protected dialog', async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  render(
    <Modal open onClose={onClose} title="Delete record" closeOnBackdrop={false}>
      Body
    </Modal>,
  );

  await user.click(screen.getByTestId('modal-backdrop'));
  expect(onClose).not.toHaveBeenCalled();
});

it('keeps keyboard focus inside the dialog', async () => {
  const user = userEvent.setup();

  render(
    <>
      <button id="outside-action" type="button">Outside action</button>
      <Modal open onClose={vi.fn()} title="Event details">
        <button type="button">Continue</button>
      </Modal>
    </>,
  );

  const close = screen.getByRole('button', { name: 'Close dialog' });
  const continueButton = screen.getByRole('button', { name: 'Continue' });
  const outsideAction = document.querySelector<HTMLButtonElement>('#outside-action');

  expect(close).toHaveFocus();
  await user.tab({ shift: true });
  expect(continueButton).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
  expect(outsideAction).not.toHaveFocus();
});

it('skips controls inside hidden content when wrapping focus backwards', async () => {
  const user = userEvent.setup();

  render(
    <Modal open onClose={vi.fn()} title="Enrollment">
      <button type="button">Continue to enrollment</button>
      <div style={{ display: 'none' }}>
        <button type="button">Hidden legacy action</button>
      </div>
    </Modal>,
  );

  const close = screen.getByRole('button', { name: 'Close dialog' });
  expect(close).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'Continue to enrollment' })).toHaveFocus();
});

it('closes only the topmost modal when Escape is pressed', async () => {
  const user = userEvent.setup();
  const onOuterClose = vi.fn();

  function StackedModals() {
    const [innerOpen, setInnerOpen] = useState(true);

    return (
      <Modal open onClose={onOuterClose} title="Outer dialog">
        <Modal open={innerOpen} onClose={() => setInnerOpen(false)} title="Inner dialog">
          Inner content
        </Modal>
      </Modal>
    );
  }

  render(<StackedModals />);

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Inner dialog' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Outer dialog' })).toBeVisible();
  expect(onOuterClose).not.toHaveBeenCalled();
});

it('treats a newly opened modal as topmost even when it mounted earlier', async () => {
  const user = userEvent.setup();
  const onBClose = vi.fn();

  function DeferredStackedModals() {
    const [aOpen, setAOpen] = useState(false);
    const [bOpen, setBOpen] = useState(true);

    return (
      <>
        <Modal open={aOpen} onClose={() => setAOpen(false)} title="Dialog A">
          A content
        </Modal>
        <Modal open={bOpen} onClose={() => { onBClose(); setBOpen(false); }} title="Dialog B">
          <button type="button" onClick={() => setAOpen(true)}>Open dialog A</button>
        </Modal>
      </>
    );
  }

  render(<DeferredStackedModals />);

  await user.click(screen.getByRole('button', { name: 'Open dialog A' }));
  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog', { name: 'Dialog A' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Dialog B' })).toBeVisible();
  expect(onBClose).not.toHaveBeenCalled();
});

it('cleans up nested reopen cycles and restores focus after the last dialog closes', () => {
  function ModalCycle({ outerOpen, innerOpen }: { outerOpen: boolean; innerOpen: boolean }) {
    return (
      <>
        <button type="button">Open dialogs</button>
        <Modal open={outerOpen} onClose={vi.fn()} title="Outer dialog">
          <button type="button">Open inner dialog</button>
          <Modal open={innerOpen} onClose={vi.fn()} title="Inner dialog">
            Inner content
          </Modal>
        </Modal>
      </>
    );
  }

  const view = render(<ModalCycle outerOpen={false} innerOpen={false} />);
  const trigger = screen.getByRole('button', { name: 'Open dialogs' });
  trigger.focus();

  view.rerender(<ModalCycle outerOpen innerOpen={false} />);
  view.rerender(<ModalCycle outerOpen innerOpen />);
  expect(document.body).toHaveClass('app-scroll-lock');

  view.rerender(<ModalCycle outerOpen innerOpen={false} />);
  expect(document.body).toHaveClass('app-scroll-lock');
  view.rerender(<ModalCycle outerOpen={false} innerOpen={false} />);
  expect(document.body).not.toHaveClass('app-scroll-lock');
  expect(trigger).toHaveFocus();

  view.rerender(<ModalCycle outerOpen innerOpen={false} />);
  expect(document.body).toHaveClass('app-scroll-lock');
  view.unmount();
  expect(document.body).not.toHaveClass('app-scroll-lock');
});

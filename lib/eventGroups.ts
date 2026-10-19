import { AppEvent } from '../types';

export function eventDisplayTitle(event: AppEvent, events: AppEvent[] = []) {
  const parent = events.find(item => item.id === event.parentEventId);
  const title = parent?.title || event.parentEventTitle;
  return title ? `${title} / ${event.title}` : event.title;
}

export function attendanceWindowTitle(event: AppEvent | undefined, slot: string) {
  const id = slot.slice(slot.indexOf(':') + 1);
  return event?.attendanceWindows?.find(window => window.id === id)?.label || '';
}

/** Render each general event once, with its specific events nested inside it. */
export function eventSectionRoots(events: AppEvent[]) {
  const groups = new Set(events.filter(event => event.isGeneralEvent).map(event => event.id));
  return events.filter(event => !event.parentEventId || !groups.has(event.parentEventId));
}

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GeofenceMap } from './GeofenceMap';

const leafletState = vi.hoisted(() => ({
  handlers: {} as Record<string, (event: { latlng: { lat: number; lng: number } }) => void>,
  setView: vi.fn(),
}));

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({ kind: 'marker-icon' })),
  },
}));

vi.mock('react-leaflet', () => ({
  Circle: () => null,
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  TileLayer: () => null,
  useMap: () => ({ getZoom: () => 17, setView: leafletState.setView }),
  useMapEvents: (handlers: typeof leafletState.handlers) => {
    leafletState.handlers = handlers;
    return null;
  },
}));

beforeEach(() => {
  leafletState.handlers = {};
  leafletState.setView.mockReset();
});

afterEach(cleanup);

it('uses the coordinates from a touch on the map as the selected geofence center', () => {
  const onChange = vi.fn();
  render(<GeofenceMap value={{ lat: 7.0736, lng: 125.6126, radius: 100 }} onChange={onChange} />);

  act(() => leafletState.handlers.touchend({ latlng: { lat: 7.08123, lng: 125.61987 } }));

  expect(onChange).toHaveBeenCalledWith({ lat: 7.08123, lng: 125.61987, radius: 100 });
});

it('announces the currently selected map coordinates', () => {
  const view = render(<GeofenceMap value={{ lat: 7.08123, lng: 125.61987, radius: 100 }} onChange={vi.fn()} />);

  expect(view.getByRole('status', { name: /selected geofence location/i }))
    .toHaveTextContent('7.081230, 125.619870');
});

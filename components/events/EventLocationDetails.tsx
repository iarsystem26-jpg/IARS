import React from 'react';
import { AppEvent } from '../../types';
import { GeofenceMap } from './GeofenceMap';

export default function EventLocationDetails({ event }: { event: AppEvent }) {
  const point = event.location;
  const enabled = event.geofenceEnabled !== false && point?.radius_meters > 0;
  return <section className="space-y-3" aria-label="Location and geofencing">
    <h3 className="font-bold">Location and geofencing</h3>
    <p>{event.venue || 'No location name provided.'}</p>
    {enabled ? <>
      <p>Attendance must be scanned within <strong>{point.radius_meters} meters</strong> of the marked location.</p>
      <GeofenceMap value={{ lat: point.lat, lng: point.lng, radius: point.radius_meters }} />
      <p className="text-sm">Coordinates: {point.lat.toFixed(6)}, {point.lng.toFixed(6)}</p>
      <a className="inline-block min-h-11 py-3 font-semibold underline" href={`https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`} target="_blank" rel="noreferrer">Open location in Maps</a>
    </> : <p className="text-sm text-slate-500">Geofencing is disabled. Scanning is not restricted to a location.</p>}
  </section>;
}

import React, { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface GeofencePoint {
  lat: number;
  lng: number;
  radius: number;
}

interface GeofenceMapProps {
  value: GeofencePoint;
  onChange?: (point: GeofencePoint) => void;
  position?: { latitude: number; longitude: number; accuracy: number } | null;
}

const MapInteraction: React.FC<GeofenceMapProps> = ({ value, onChange, position }) => {
  const map = useMap();
  const selectLocation = (event: L.LeafletMouseEvent) => {
    onChange?.({ ...value, lat: event.latlng.lat, lng: event.latlng.lng });
  };

  useMapEvents({
    click: selectLocation,
    touchend: selectLocation,
  } as any);

  useEffect(() => {
    map.setView([value.lat, value.lng], map.getZoom(), { animate: false });
  }, [map, value.lat, value.lng]);

  return null;
};

export const GeofenceMap: React.FC<GeofenceMapProps> = ({ value, onChange, position }) => {
  const markerIcon = useMemo(() => L.divIcon({
    className: '',
    html: '<span class="block h-5 w-5 rounded-full border-4 border-white bg-emerald-500 shadow-lg"></span>',
    iconAnchor: [10, 10],
    iconSize: [20, 20],
  }), []);

  return (
    <div aria-label="Event geofence map" className="relative h-80 min-h-72 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner dark:border-slate-700 dark:bg-slate-900" role="region">
      <MapContainer center={[value.lat, value.lng]} className="h-full w-full" scrollWheelZoom zoom={17}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle center={[value.lat, value.lng]} interactive={false} pathOptions={{ color: '#0081c8', fillColor: '#0081c8', fillOpacity: 0.18, weight: 2 }} radius={value.radius} />
        <Marker
          draggable={Boolean(onChange)}
          eventHandlers={{
            dragend(event) {
              const point = event.target.getLatLng();
              onChange?.({ ...value, lat: point.lat, lng: point.lng });
            },
          }}
          icon={markerIcon}
          position={[value.lat, value.lng]}
        />
        {onChange && <MapInteraction onChange={onChange} value={value} />}
        {position && <Circle center={[position.latitude, position.longitude]} radius={Math.max(position.accuracy, 3)} pathOptions={{ color: '#16a34a', fillOpacity: 0.4 }} />}
      </MapContainer>
      <div aria-label="Selected geofence location" className="pointer-events-none absolute bottom-7 left-3 right-3 z-[500] rounded-lg bg-white/95 px-3 py-2 text-[11px] font-bold text-brand-900 shadow-md backdrop-blur dark:bg-slate-900/95 dark:text-white" role="status">
        <span className="block">{onChange ? 'Tap the map or drag the marker to set the center.' : position ? 'Event attendance boundary; green shows your GPS position.' : 'The marker shows the event center. The blue circle is the attendance boundary.'}</span>
        <span className="mt-0.5 block font-semibold text-slate-600 dark:text-slate-300">{value.lat.toFixed(6)}, {value.lng.toFixed(6)}</span>
      </div>
    </div>
  );
};

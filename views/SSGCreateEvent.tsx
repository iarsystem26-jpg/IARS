import React from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import ActivityForm from '../components/events/ActivityForm';
import { appData } from '../lib/backend';

export default function SSGCreateEvent() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  useAuth();
  const event = eventId ? appData.getEvents().find(item => item.id === eventId) : undefined;
  if (event?.organizationId) return <Navigate replace to={`/organizations/${event.organizationId}/events/${eventId}/edit`} />;
  // Preserve bookmarked ceremony links from the former combined form.
  if (event?.kind === 'flag_ceremony') return <Navigate replace to={`/ssg/ceremonies/${eventId}/edit`} />;
  if (!eventId && searchParams.get('kind') === 'flag_ceremony') return <Navigate replace to="/ssg/ceremonies/create" />;
  return <ActivityForm key={eventId || 'create-event'} purpose="event" />;
}

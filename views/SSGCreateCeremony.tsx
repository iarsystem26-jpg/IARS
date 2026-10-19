import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import ActivityForm from '../components/events/ActivityForm';
import { appData } from '../lib/backend';

export default function SSGCreateCeremony() {
  const { eventId } = useParams();
  useAuth();
  const event = eventId ? appData.getEvents().find(item => item.id === eventId) : undefined;
  if (event && event.kind !== 'flag_ceremony') return <Navigate replace to={`/ssg/events/${eventId}/edit`} />;
  return <ActivityForm key={eventId || 'create-ceremony'} purpose="ceremony" />;
}

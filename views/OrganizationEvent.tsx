import { useParams } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import ActivityForm from '../components/events/ActivityForm';
import { appData } from '../lib/backend';
import { canManageOrganization } from '../lib/organizations';
import { Page } from '../components/ui/Page';

export default function OrganizationEvent() {
  const { organizationId, eventId } = useParams();
  const { profile } = useAuth();
  const organization = appData.getOrganizations().find(o => o.id === organizationId);
  if (!organization || !canManageOrganization(profile, organization)) return <Page><p>Organization management access is required.</p></Page>;
  if (eventId && !appData.getEvents().some(e => e.id === eventId && e.organizationId === organizationId)) return <Page><p>This event is unavailable.</p></Page>;
  return <ActivityForm key={eventId || organizationId} purpose="event" organization={organization} />;
}

import { educationalUnit } from './educationalUnit';
import { runtimeInstitution } from './institutionRuntime';

export const legalLinks = [
  { path: '/privacy-policy', title: 'Privacy Policy' },
  { path: '/data-deletion', title: 'Data Deletion' },
  { path: '/data-privacy-agreement', title: 'Data Privacy Act Agreement' },
  { path: '/terms-of-service', title: 'Terms of Service' },
] as const;

// Use verified institutional details; never invent a controller or privacy contact.
export const privacyContact = {
  school: runtimeInstitution?.legalName || import.meta.env.VITE_SCHOOL_LEGAL_NAME?.trim() || educationalUnit.name,
  email: runtimeInstitution?.privacyEmail || import.meta.env.VITE_PRIVACY_EMAIL?.trim() || '',
  office: runtimeInstitution?.address || import.meta.env.VITE_PRIVACY_OFFICE?.trim() || 'your school administration office',
};

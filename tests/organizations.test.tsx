import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Organizations from '../views/Organizations';
import OrganizationEvent from '../views/OrganizationEvent';
import { DirectoryNodeModal } from '../components/academic/DirectoryNodeModal';
import OrganizationForm from '../components/academic/OrganizationForm';
import HierarchyOrganizations from '../components/academic/HierarchyOrganizations';
import type { Organization } from '../types';

const state = vi.hoisted(() => ({
  auth: { profile: { uid: 'student', name: 'Student', role: 'student', school_data: { academic_assignment: { terminalGroupId: 'section' } } }, revision: 0, loading: false },
  organizations: [] as any[], members: [] as any[], events: [] as any[], sanctions: [] as any[],
  command: vi.fn(), people: vi.fn(), publicItems: vi.fn(), upload: vi.fn(),
}));
vi.mock('../components/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../components/ui/ProfileAvatar', () => ({ default: ({ alt, src, ...props }: any) => <img alt={alt} src={src} {...props} /> }));
vi.mock('../components/events/GeofenceMap', () => ({ GeofenceMap: () => <div /> }));
vi.mock('../lib/googleDrive', () => ({ createDriveImage: state.upload, deleteDriveImage: vi.fn(), validateProfileImage: vi.fn() }));
vi.mock('../lib/backend', () => ({ appData: {
  getOrganizations: () => state.organizations, getOrganizationMemberships: () => state.members,
  getOrganizationSanctions: () => state.sanctions, getEvents: () => state.events,
  getPublicOrganizations: state.publicItems, getOrganizationPeople: state.people, organizationCommand: state.command,
  getSchoolStructure: () => [{ id: 'school', name: 'School', type: 'school', children: [{ id: 'section', name: 'Section', type: 'section' }] }],
  getUserDetail: (uid: string) => ({ profile: { photo_url: `https://example.com/${uid}.png` } }),
  getAttendanceLogs: () => ({}), isUserScopeFrozen: () => false,
} }));
const organization: Organization = { id: 'club', name: 'Science Club', description: 'Explore science together', logo_url: 'https://lh3.googleusercontent.com/d/test=w4000', node_id: 'school', visible: true, joining: 'approval', key_required: true, head_ids: ['head'], created_at: '' };
beforeAll(() => {
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:organization-logo');
    static revokeObjectURL = vi.fn();
  });
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); state.auth.profile.uid = 'student'; state.auth.profile.role = 'student';
  state.organizations = [{ ...organization }]; state.members = []; state.events = []; state.sanctions = [];
  state.command.mockResolvedValue('club'); state.people.mockResolvedValue([{ uid: 'student', name: 'Student', student_id: 'S001', role: 'student', can_add: true }]); state.publicItems.mockResolvedValue([organization]);
});
afterEach(cleanup);
function mount(path = '/organizations') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/organizations" element={<Organizations />} />
    <Route path="/organizations/public" element={<Organizations publicDirectory />} />
    <Route path="/organizations/:organizationId" element={<Organizations />} />
    <Route path="/organizations/:organizationId/events/create" element={<OrganizationEvent />} />
  </Routes></MemoryRouter>);
}
it('submits a keyed application and keeps membership administration away from students', async () => {
  mount();
  expect(screen.queryByRole('button', { name: 'Establish organization' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Apply to join' }));
  expect(screen.getByRole('button', { name: 'Submit application' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Join key'), { target: { value: 'club-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
  await waitFor(() => expect(state.command).toHaveBeenCalledWith('join', { organizationId: 'club', key: 'club-key' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Application submitted');
});
it('heads can review applications but cannot approve sanctions', async () => {
  state.auth.profile.uid = 'head';
  state.members = [{ organization_id: 'club', student_id: 'student', status: 'pending', created_at: '2026-10-01' }];
  state.sanctions = [{ id: 'request', organization_id: 'club', student_id: 'student', status: 'pending', hours: 1, reason: 'Organization violation' }];
  mount('/organizations/club');
  await screen.findByText('Student', { selector: 'p.font-medium' });
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  await waitFor(() => expect(state.command).toHaveBeenCalledWith('reviewMember', { organizationId: 'club', studentId: 'student', status: 'approved' }));
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
});
it('OSAS can review a sanction request with notes', async () => {
  state.auth.profile.role = 'ossa';
  state.sanctions = [{ id: 'request', organization_id: 'club', student_id: 'student', status: 'pending', hours: 1, reason: 'Organization violation' }];
  mount('/organizations/club');
  fireEvent.change(screen.getByLabelText('Review notes for request'), { target: { value: 'Evidence checked' } });
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(state.command).toHaveBeenCalledWith('reviewSanction', { organizationId: 'club', requestId: 'request', status: 'approved', notes: 'Evidence checked' }));
});
it('uses the public discovery API without showing management controls', async () => {
  mount('/organizations/public');
  expect(await screen.findByText('Science Club')).toBeInTheDocument();
  expect(state.publicItems).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: /Manage organization|Apply to join|Establish/ })).not.toBeInTheDocument();
});
it('requires organization management access for the event route', () => {
  mount('/organizations/club/events/create');
  expect(screen.getByText('Organization management access is required.')).toBeInTheDocument();
});
it('heads get organization recipients and merit creation without general event privileges', () => {
  state.auth.profile.uid = 'head';
  mount('/organizations/club/events/create');
  expect(screen.getByText(/Current approved members of/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Activity type'));
  expect(screen.getByRole('option', { name: /Merit activity/ })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Cleaning Service/ })).not.toBeInTheDocument();
});
it('saves an uploaded logo through the existing image service', async () => {
  state.auth.profile.role = 'admin';
  state.upload.mockResolvedValue({ id: 'image-id', url: 'https://lh3.googleusercontent.com/d/image-id=w4000' });
  const close = vi.fn();
  render(<OrganizationForm profile={state.auth.profile as any} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Science Club' } });
  fireEvent.change(screen.getByLabelText(/Organization logo/), { target: { files: [new File(['image'], 'logo.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Save organization' }));
  await waitFor(() => expect(state.command).toHaveBeenCalledWith('create', expect.objectContaining({ name: 'Science Club', logo_url: 'https://lh3.googleusercontent.com/d/image-id=w4000' })));
  expect(state.upload).toHaveBeenCalledWith(expect.any(File), 'Science Club', expect.stringMatching(/^organization-/));
  expect(close).toHaveBeenCalledOnce();
});

it('keeps organizations attached to the selected hierarchy unit distinct from other scopes', () => {
  state.organizations = [organization, { ...organization, id: 'general', name: 'General Club', node_id: null }, { ...organization, id: 'class', name: 'Class Club', node_id: 'section' }];
  render(<HierarchyOrganizations profile={state.auth.profile as any} unit={{ id: 'school', name: 'School', type: 'school' }} onChanged={() => {}} />);
  expect(screen.getByText('Science Club')).toBeInTheDocument();
  expect(screen.queryByText('General Club')).not.toBeInTheDocument();
  expect(screen.queryByText('Class Club')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add organization' })).not.toBeInTheDocument();
});

it('creates directly in the selected unit without assigning an out-of-unit administrator as head', async () => {
  state.auth.profile.role = 'admin';
  state.upload.mockResolvedValue({ id: 'image-id', url: 'https://lh3.googleusercontent.com/d/image-id=w4000' });
  const changed = vi.fn();
  render(<OrganizationForm profile={state.auth.profile as any} initialNodeId="school" lockScope onClose={changed} />);
  expect(screen.getByLabelText('Organization unit')).toBeDisabled();
  expect(screen.getByLabelText('Organization unit')).toHaveTextContent('School');
  fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'New Club' } });
  fireEvent.change(screen.getByLabelText(/Organization logo/), { target: { files: [new File(['image'], 'logo.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Save organization' }));
  await waitFor(() => expect(state.command).toHaveBeenCalledWith('create', expect.objectContaining({ node_id: 'school', head_ids: [] })));
  expect(changed).toHaveBeenCalledOnce();
});

it('offers school-wide organizations separately at the hierarchy root', () => {
  state.organizations = [organization, { ...organization, id: 'general', name: 'General Club', node_id: null }];
  render(<HierarchyOrganizations profile={state.auth.profile as any} unit={null} onChanged={() => {}} />);
  expect(screen.getByText('General Club')).toBeInTheDocument();
  expect(screen.queryByText('Science Club')).not.toBeInTheDocument();
  expect(screen.getByText('School-wide organizations across all academic units.')).toBeInTheDocument();
});


it('offers organization creation in the educational unit type selector and preserves the entered name', () => {
  const create = vi.fn();
  render(<DirectoryNodeModal open parent={{ id: 'school', name: 'School', type: 'school' }} onClose={() => {}} onSave={vi.fn()} onCreateOrganization={create} />);
  fireEvent.change(screen.getByLabelText('Unit designation'), { target: { value: 'Science Club' } });
  fireEvent.click(screen.getByLabelText('Semantic type'));
  fireEvent.click(screen.getByRole('option', { name: 'Organization' }));
  expect(create).toHaveBeenCalledWith('Science Club');
});

it('does not render an empty organization panel or a separate add action', () => {
  state.organizations = [];
  const { container } = render(<HierarchyOrganizations profile={state.auth.profile as any} unit={null} onChanged={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});


it('previews a selected logo and releases it when removed', async () => {
  render(<OrganizationForm profile={state.auth.profile as any} onClose={() => {}} />);
  expect(screen.getByRole('button', { name: 'Choose image' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Organization logo'), { target: { files: [new File(['image'], 'club.png', { type: 'image/png' })] } });
  expect(await screen.findByAltText('Selected organization logo preview')).toHaveAttribute('src', 'blob:organization-logo');
  expect(screen.getByText('club.png')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected image' }));
  expect(screen.queryByAltText('Selected organization logo preview')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:organization-logo');
});

it('finds organization heads by student ID and shows their profile pictures', async () => {
  state.auth.profile.role = 'admin';
  state.people.mockResolvedValue([
    { uid: 'student', name: 'Alex Rivera', student_id: '2024-00123A' },
    { uid: 'other', name: 'Other Student', student_id: '2024-00999A' },
  ]);
  render(<OrganizationForm initialNodeId="school" profile={state.auth.profile as any} onClose={() => {}} />);
  fireEvent.click(screen.getByLabelText('Organization heads'));
  await screen.findByRole('option', { name: /Alex Rivera/ });
  fireEvent.change(screen.getByLabelText('Search Organization heads options'), { target: { value: '00123' } });
  const person = screen.getByRole('option', { name: /Alex Rivera/ });
  expect(person).toHaveTextContent('2024-00123A');
  expect(person.querySelector('img')).toHaveAttribute('src', 'https://example.com/student.png');
  expect(screen.queryByRole('option', { name: /Other Student/ })).not.toBeInTheDocument();
  fireEvent.click(person);
  expect(person).toHaveAttribute('aria-selected', 'true');
});

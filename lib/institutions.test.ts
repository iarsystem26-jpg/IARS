import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstitutionSetup } from './institutionBranding';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: mocks }));
vi.mock('./googleDrive', () => ({ validateProfileImage: vi.fn() }));
import { createInstitution } from './institutions';

const setup: InstitutionSetup = { name: 'North Academy', shortName: 'NA', slug: 'north-academy', legalName: 'North Inc.', address: 'Davao', supportEmail: 'support@example.com', privacyEmail: 'privacy@example.com', adminName: 'Owner', adminEmail: 'owner@example.com', adminUsername: 'owner', logoUrl: '', primaryColor: '#0066ff', accentColor: '#00b88a', theme: 'standard', appearance: 'system' };
describe('institution credential handoff', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: 'job-id', error: null }); });
  it('submits a manual password separately from public configuration', async () => {
    await createInstitution(setup, undefined, undefined, 'ManualPassword12!');
    expect(mocks.rpc).toHaveBeenCalledWith('rmc_create_institution', { setup_config: setup, initial_password: 'ManualPassword12!' });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('blocks weak passwords before writing a setup request', async () => {
    await expect(createInstitution(setup, undefined, undefined, 'weak')).rejects.toThrow('every requirement');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('reports duplicate IDs and backend failures without treating them as success', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505' } });
    await expect(createInstitution(setup)).rejects.toThrow('already in use');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    await expect(createInstitution(setup)).rejects.toThrow('credentials migration');
  });
});

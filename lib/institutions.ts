import { generatePassword, isValidPassword } from './passwordPolicy';
import { supabase } from './supabase';
import { InstitutionSetup, validateInstitutionSetup } from './institutionBranding';
import { validateProfileImage } from './googleDrive';

export interface InstitutionRecord {
  id: string; slug: string; config: InstitutionSetup;
  status: 'queued' | 'creating' | 'migrating' | 'configuring' | 'verifying' | 'active' | 'failed';
  stage: string; project_ref: string | null; error: string | null; bootstrap_url: string | null; admin_email_queued_at?: string | null;
}
export async function loadInstitutions(): Promise<InstitutionRecord[]> {
  const { data, error } = await supabase.from('rmc_institutions').select('id,slug,config,status,stage,project_ref,error,bootstrap_url,admin_email_queued_at').order('created_at', { ascending: false });
  if (error) throw new Error('Institution setup is unavailable. Apply the institution registry migration and start its provisioning worker.');
  return data || [];
}
export async function createInstitution(setup: InstitutionSetup, logo?: File, existingId?: string, initialPassword = generatePassword()) {
  validateInstitutionSetup(setup);
  if (!existingId && !isValidPassword(initialPassword)) throw new Error('Choose a password that meets every requirement.');
  let path: string | undefined;
  let queued = false;
  try {
    let logoUrl = existingId ? setup.logoUrl : '';
    if (logo) {
      validateProfileImage(logo);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in again before creating an institution.');
      const extension = logo.type === 'image/jpeg' ? 'jpg' : logo.type === 'image/webp' ? 'webp' : 'png';
      path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await supabase.storage.from('institution-logos').upload(path, logo, { contentType: logo.type, upsert: false });
      if (uploaded.error) throw new Error('Logo upload failed. Your institution has not been created. Try again.');
      logoUrl = supabase.storage.from('institution-logos').getPublicUrl(path).data.publicUrl;
    }
    const payload = { slug: setup.slug, config: { ...setup, logoUrl } };
    const { error, data } = existingId
      ? await supabase.from('rmc_institutions').update({ config: payload.config, status: 'queued' }).eq('id', existingId).in('status', ['active','failed']).select('id')
      : await supabase.rpc('rmc_create_institution', { setup_config: payload.config, initial_password: initialPassword });
    if (error?.code === 'PGRST202') throw new Error('Apply the institution administrator credentials migration and restart the provisioning worker before creating an institution.');
    if (error) throw new Error(error.code === '23505' ? 'This institution ID is already in use. Choose another.' : 'Institution setup could not be saved. Check your administrator access and backend setup.');
    if (!data || (Array.isArray(data) && !data.length)) throw new Error('Institution setup is already running. Wait for it to finish before editing.');
    queued = true;
  } finally {
    if (path && !queued) await supabase.storage.from('institution-logos').remove([path]).catch(() => {});
  }
}
export async function retryInstitution(id: string) {
  const { error } = await supabase.from('rmc_institutions').update({ status: 'queued' }).eq('id', id).eq('status', 'failed');
  if (error) throw new Error('Could not retry institution setup.');
}

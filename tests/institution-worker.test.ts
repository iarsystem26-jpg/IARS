import { describe, expect, it } from 'vitest';
import { migrationBody, publicBranding, sqlLiteral, institutionWelcomeEmail } from '../scripts/institution-worker.mjs';
import { enqueueEmails, decryptEmail } from '../supabase/functions/_shared/emailQueue';
describe('institution provisioning boundaries', () => {
  it('removes contacts for administrator access from public branding', () => {
    expect(publicBranding({ slug: 'north', name: 'North', adminName: 'Owner', adminEmail: 'private@example.com', adminUsername: 'owner', password: 'private', adminPassword: 'private', initial_password: 'private' }, 'https://example.com/logo.png'))
      .toEqual({ slug: 'north', name: 'North', logoUrl: 'https://example.com/logo.png' });
  });
  it('escapes welcome credentials and puts them in the encrypted, deduplicated mail queue', async () => {
    const message = institutionWelcomeEmail({ name: 'North <Academy>', shortName: 'NA', adminName: 'Owner', adminEmail: 'OWNER@example.com', adminUsername: 'owner' }, 'https://example.com/?institution=north', 'Initial<Password12&', 'https://example.com/logo.png');
    expect(message.to).toBe('owner@example.com');
    expect(message.text).toContain('Initial<Password12&');
    expect(message.html).toContain('Initial&lt;Password12&amp;');
    expect(message.html).not.toContain('North <Academy>');
    let queued: any;
    const admin = { from: (table: string) => {
      expect(table).toBe('rmc_auth_email_queue');
      return { upsert: async (rows: any, options: any) => {
        queued = rows;
        expect(options).toEqual({ onConflict: 'event_key', ignoreDuplicates: true });
        return { error: null };
      } };
    } };
    const key = btoa('a'.repeat(32));
    await enqueueEmails(admin, [message], 'institution-welcome:job-id', key);
    expect(queued[0].event_key).toBe('institution-welcome:job-id:0');
    expect(queued[0].payload).not.toContain('Initial<Password12&');
    expect(await decryptEmail(queued[0].payload, key)).toEqual(message);
  });
  it('escapes setup values and keeps function transaction blocks intact', () => {
    expect(sqlLiteral("School's" )).toBe("'School''s'");
    expect(migrationBody('begin;\ncreate function x() returns void as $$ begin return; end $$ language plpgsql;\ncommit;'))
      .toContain('$$ begin return; end $$');
    expect(migrationBody('begin;\nselect 1;\ncommit;')).not.toMatch(/^begin;|commit;/m);
    expect(migrationBody('\uFEFF-- migration\nselect 1;')).toBe('-- migration\nselect 1;');
  });
  it('hardens optional platform helpers only when they exist on a fresh project', () => {
    expect(migrationBody('revoke execute on function public.rls_auto_enable() from public,anon,authenticated;')).toContain("to_regprocedure('public.rls_auto_enable()') is not null");
    expect(migrationBody('revoke execute on function public.required_app_function() from public;')).toBe('revoke execute on function public.required_app_function() from public;');
  });
});

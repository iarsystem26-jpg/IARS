import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { readJson, responseHeaders as cors } from '../_shared/http.ts';
import { rateLimit } from '../_shared/rateLimit.ts';

const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const limited = await rateLimit(admin, req, 'accounts');
  if (limited) return limited;
  const token = req.headers.get('Authorization')?.replace(/^Bearer /i, '');
  if (!token) return respond({ error: 'Sign in first.' }, 401);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return respond({ error: 'Invalid session.' }, 401);
  const actorLimited = await rateLimit(admin, req, 'accounts', user.id);
  if (actorLimited) return actorLimited;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  try {
    const { action, data } = await readJson(req, 1024 * 1024);
    if (action === 'access') {
      const { error: permissionError } = await caller.rpc('rmc_assert_manage_accounts');
      if (permissionError) throw permissionError;
      const users: Array<{ id: string; last_sign_in_at?: string | null; created_at?: string }> = [];
      let page = 1;
      while (true) {
        const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (result.error) throw result.error;
        users.push(...(result.data.users || []).map((item) => ({ id: item.id, last_sign_in_at: item.last_sign_in_at, created_at: item.created_at })));
        if (!result.data.users || result.data.users.length < 1000) break;
        page += 1;
      }
      return respond({ users });
    }
    if (action === 'reset_password') {
      if (typeof data?.uid !== 'string' || typeof data?.password !== 'string' || data.password.length < 12 || data.password.length > 1024) throw new Error('Passwords must contain between 12 and 1024 characters.');
      const { error: permissionError } = await caller.rpc('rmc_change_account_password', { target: data.uid });
      if (permissionError) throw permissionError;
      const { error } = await admin.auth.admin.updateUserById(data.uid, { password: data.password });
      if (error) throw error;
      return respond({ ok: true });
    }
    if (action === 'deactivate') {
      // Deactivation immediately revokes database access, including unexpired JWTs.
      const { error } = await caller.rpc('rmc_deactivate_account', { target: data.uid });
      if (error) throw error;
      const { error: banError } = await admin.auth.admin.updateUserById(data.uid, { ban_duration: '876000h' });
      if (banError) throw banError;
      return respond({ ok: true });
    }
    if (action !== 'create' || !Array.isArray(data?.members) || data.members.length < 1 || data.members.length > 100) throw new Error('Provide between 1 and 100 accounts.');
    const members = [];
    for (const member of data.members) {
      if (!member || typeof member !== 'object' || (member.password !== undefined && (typeof member.password !== 'string' || member.password.length < 12 || member.password.length > 1024))) throw new Error('Temporary passwords must contain between 12 and 1024 characters.');
      const { data: profile, error } = await caller.rpc('rmc_reserve_account', { person: member.profile });
      if (error) throw error;
      members.push({ ...member, profile });
    }
    const accounts = [];
    for (const member of members) {
      // CSV imports use an unguessable password. A password recovery email can be
      // requested by the account owner; provisioning itself never sends email.
      const password = member.password || crypto.randomUUID() + crypto.randomUUID();
      const { data: account, error } = await admin.auth.admin.createUser({
        email: member.profile.email.trim().toLowerCase(), password, email_confirm: true,
        user_metadata: { profile: member.profile },
        app_metadata: { rmc_provisioned: true, provisioned_by: user.id },
      });
      if (error || !account.user) throw error || new Error('Account creation failed.');
      created.push(account.user.id);
      accounts.push({ uid: account.user.id, profile: member.profile });
    }
    const { error } = await caller.rpc('rmc_provision_complete', { accounts });
    if (error) throw error;
    return respond({ ids: created });
  } catch (error) {
    // Profiles are committed as a single transaction. Remove only Auth users
    // created by this request if any stage before that commit fails.
    for (const id of created) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(id);
      if (cleanupError) console.error('Provisioning cleanup required', id, cleanupError.message);
    }
    return respond({ error: error instanceof Error ? error.message : (error as { message?: string })?.message || 'Account operation failed.' }, 400);
  }
});

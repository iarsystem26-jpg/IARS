import { toast } from './toast';

function requestLabel(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const path = url.pathname;
  const method = init?.method || (input instanceof Request ? input.method : 'GET');
  if (path.includes('/auth/')) {
    if (path.includes('/token')) return url.searchParams.get('grant_type') === 'refresh_token' ? 'Keeping you signed in' : 'Sign in';
    if (path.includes('/factors')) return 'Checking your security code';
    if (path.includes('/logout')) return 'Sign out';
    if (path.includes('/recover')) return 'Password recovery';
    if (path.includes('/signup')) return 'Register account';
    return 'Checking your account';
  }
  if (path.includes('/storage/')) return method === 'GET' ? 'Opening your file' : 'Saving your file';
  // Never show query strings, credentials, or record IDs.
  const name = path.includes('/rpc/') || path.includes('/functions/') ? path.split('/').pop() : path.split('/rest/v1/')[1]?.split('/')[0];
  const labels: Record<string, string> = {
    rmc_snapshot: 'Updating your information', rmc_nodes: 'Loading school information',
    rmc_clearance: 'Checking clearance certificates', rmc_verify_clearance: 'Verifying clearance certificate',
    rmc_profiles: 'Loading profiles', rmc_command: 'Saving your changes',
    'rmc-accounts': 'Updating account details', 'rmc-login': 'Signing you in',
    rmc_organization_command: 'Updating organization details', rmc_organization_people: 'Loading members',
    rmc_public_organizations: 'Loading organizations', rmc_record_attendance: 'Recording attendance',
    rmc_get_print_qr: 'Getting your QR code', rmc_issue_qr: 'Getting your QR code',
    rmc_refresh_print_qr: 'Updating your QR code', rmc_resolve_qr: 'Checking the QR code',
    rmc_lookup_enrollment: 'Checking your application', rmc_validate_enrollment: 'Checking enrollment details',
    rmc_admission_update: 'Updating your application', rmc_review_admission: 'Saving the application review',
    rmc_review_event: 'Saving the event review', rmc_create_ceremonies: 'Scheduling ceremonies',
    rmc_extend_service: 'Updating service dates', rmc_set_class_schedule: 'Saving the class schedule',
    rmc_update_core_role: 'Saving role permissions', rmc_clear_section_security_key: 'Updating enrollment settings',
  };
  return labels[name || ''] || (method === 'GET' || method === 'HEAD' ? 'Loading your information' : 'Working on your request');
}

/** Shared by every Supabase client, including temporary verification clients. */
export const backendFetch: typeof fetch = async (input, init) => {
  // Diagnostics report failures in their own UI; recording them again would loop.
  const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (requestUrl.pathname === '/rest/v1/rmc_client_errors') return fetch(input, { ...init, cache: 'no-store' });
  // The account table owns the loading/error feedback for this read-only call.
  if (requestUrl.pathname.endsWith('/functions/v1/rmc-accounts') && typeof init?.body === 'string') {
    let action: unknown;
    try { action = JSON.parse(init.body).action; } catch { /* Let the server validate malformed bodies. */ }
    if (action === 'access') return fetch(input, { ...init, cache: 'no-store' });
  }
  const progress = toast.start(requestLabel(input, init), ['Working on it', 'Getting your updates', 'Finishing up'], true);
  try {
    const response = await fetch(input, { ...init, cache: 'no-store' });
    progress.step(1);
    // A clone preserves the SDK's normal body parsing and error semantics.
    const text = await response.clone().text();
    progress.step(2);
    let payload: any;
    if (response.headers.get('content-type')?.includes('json') && text) payload = JSON.parse(text);
    if (!response.ok || payload?.error || payload?.success === false) {
      progress.fail({ status: response.status, code: payload?.code, message: typeof payload?.error === 'string' ? payload.error : payload?.message });
    } else progress.complete();
    return response;
  } catch (error) { progress.fail(error); throw error; }
};

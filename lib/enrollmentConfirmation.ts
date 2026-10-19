import { supabase } from './supabase';

export type EnrollmentConfirmationSettings = {
  mode: 'required' | 'bypass' | 'google_only';
  email_kind: 'supabase' | 'custom';
  instructions: string;
  image_url: string;
  email_subject: string;
  email_body: string;
};
export const defaultConfirmationSettings: EnrollmentConfirmationSettings = {
  mode: 'required', email_kind: 'supabase',
  instructions: 'Open the confirmation email in your inbox. Check Spam or Junk if it is missing. Select Confirm your mail, then return here and check confirmation. If the link has expired, request a new email.',
  image_url: '', email_subject: 'Confirm your IARS enrollment email',
  email_body: 'Thank you for enrolling in IARS. Confirm your email address using the link below, then return to enrollment to continue your application.',
};
export async function loadConfirmationSettings(): Promise<EnrollmentConfirmationSettings> {
  const { data, error } = await supabase.from('rmc_enrollment_confirmation').select('mode,email_kind,instructions,image_url,email_subject,email_body').eq('id', 1).single();
  if (error) throw error;
  return data;
}

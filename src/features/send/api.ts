import { toAppError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

export interface SendSettings {
  email_subject: string | null;
  email_message: string | null;
  expires_at: string | null;
  reminder_first_after_days: number | null;
  reminder_repeat_every_days: number | null;
  require_email_otp: boolean;
  allow_decline: boolean;
}

export async function fetchSendSettings(documentId: string): Promise<SendSettings> {
  const { data, error } = await supabase
    .from('documents')
    .select(
      'email_subject, email_message, expires_at, reminder_first_after_days, reminder_repeat_every_days, require_email_otp, allow_decline',
    )
    .eq('id', documentId)
    .single();
  if (error) throw toAppError(error);
  return data;
}

/** "Save draft": keeps the review settings on the draft (columns the owner may update while draft). */
export async function saveSendSettings(documentId: string, settings: SendSettings): Promise<void> {
  const { error } = await supabase.from('documents').update(settings).eq('id', documentId);
  if (error) throw toAppError(error);
}

export interface SendResult {
  document_id: string;
  status: 'in_progress';
  notified: number;
  failed: string[];
}

export function sendDocument(documentId: string, settings: SendSettings): Promise<SendResult> {
  return invokeFunction('send-document', { document_id: documentId, ...settings });
}

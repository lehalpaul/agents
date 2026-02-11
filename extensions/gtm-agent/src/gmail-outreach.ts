import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Gmail outreach via gog CLI (same pattern as existing OpenClaw Gmail integration).
// Requires gog CLI installed and authenticated for the configured gmail account.

export type OutreachEmail = {
  to: string;
  subject: string;
  body: string;
  gmailAccount: string;
};

export type SendResult = {
  success: boolean;
  error?: string;
};

/**
 * Send an email via `gog gmail send`.
 * Includes an unsubscribe footer automatically.
 */
export async function sendEmail(email: OutreachEmail): Promise<SendResult> {
  const bodyWithUnsubscribe = `${email.body}\n\n---\nTo unsubscribe from future emails, reply with "unsubscribe".`;

  try {
    await execFileAsync("gog", [
      "gmail",
      "send",
      "--account",
      email.gmailAccount,
      "--to",
      email.to,
      "--subject",
      email.subject,
      "--body",
      bodyWithUnsubscribe,
    ]);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Personalize a template string with prospect data.
 * Replaces {{key}} placeholders with values from the data object.
 */
export function personalizeTemplate(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// Sequence step to follow-up delay mapping (business days)
const SEQUENCE_FOLLOWUP_DAYS: Record<string, number> = {
  initial: 3,
  "follow-up-1": 5,
  "follow-up-2": 7,
  "follow-up-3": 14,
};

/**
 * Calculate the next follow-up date based on sequence step.
 */
export function nextFollowupDate(sequenceStep: string): string {
  const days = SEQUENCE_FOLLOWUP_DAYS[sequenceStep] ?? 7;
  const date = new Date();
  // Skip weekends naively: add calendar days, adjusting for weekends
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return date.toISOString().split("T")[0];
}

import { Type } from "@sinclair/typebox";
import type { GtmConfig } from "../config.js";
import { nextFollowupDate, sendEmail } from "../gmail-outreach.js";
import { NotionCrm } from "../notion-crm.js";

export function createSendOutreachTool(getConfig: () => GtmConfig) {
  return {
    name: "gtm_send_outreach",
    description:
      "Send an outreach email to an approved prospect and log in CRM. " +
      "REQUIRES human approval: prospects must be approved first via gtm_approve_prospects. " +
      "Rejects if consent_status is 'none' or opt_out is true. " +
      "Uses gog CLI to send via Gmail.",
    parameters: Type.Object({
      contactPageId: Type.String({ description: "Notion page ID of the contact" }),
      subject: Type.String({ description: "Email subject line" }),
      body: Type.String({ description: "Email body (plain text)" }),
      sequenceStep: Type.Optional(
        Type.String({
          description:
            "Sequence step: 'initial', 'follow-up-1', 'follow-up-2', 'follow-up-3' (default: 'initial')",
        }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const cfg = getConfig();
      if (!cfg.gmailAccount) {
        throw new Error("gtm-agent: gmailAccount not configured in plugin config");
      }

      const crm = new NotionCrm(cfg);
      // oxlint-disable-next-line typescript/no-explicit-any
      const p = params as any;
      const contactPageId = p.contactPageId as string;
      const subject = p.subject as string;
      const body = p.body as string;
      const sequenceStep = (p.sequenceStep as string) ?? "initial";

      // Fetch contact directly by page ID and check compliance
      const contact = await crm.getContactByPageId(contactPageId);
      if (!crm.canContact(contact)) {
        throw new Error(
          `Cannot contact ${contact.name}: consent_status=${contact.consentStatus}, opt_out=${contact.optOut}. ` +
            "Approve the prospect first using gtm_approve_prospects.",
        );
      }
      if (!contact.email) {
        throw new Error(`Contact ${contact.name} has no email address`);
      }

      // Send email
      const result = await sendEmail({
        to: contact.email,
        subject,
        body,
        gmailAccount: cfg.gmailAccount,
      });

      if (!result.success) {
        throw new Error(`Failed to send email: ${result.error}`);
      }

      // Log activity
      const today = new Date().toISOString().split("T")[0];
      const followUp = nextFollowupDate(sequenceStep);

      await crm.logActivity({
        summary: `Email sent to ${contact.name}: "${subject}" (${sequenceStep})`,
        type: "Email",
        date: today,
        followUpDate: followUp,
        contactPageId: contact.pageId,
      });

      // Update contact
      await crm.updateContact(contactPageId, {
        lastContacted: today,
        nextFollowup: followUp,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "sent",
                to: contact.email,
                subject,
                sequenceStep,
                nextFollowup: followUp,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

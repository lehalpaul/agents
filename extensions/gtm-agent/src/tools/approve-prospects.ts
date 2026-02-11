import { Type } from "@sinclair/typebox";
import type { GtmConfig } from "../config.js";
import { NotionCrm } from "../notion-crm.js";

export function createApproveProspectsTool(getConfig: () => GtmConfig) {
  return {
    name: "gtm_approve_prospects",
    description:
      "Review and approve prospects for outreach. Lists prospects with consent_status=none. " +
      "Approve them (sets consent to 'implied' under CASL business contact exemption) " +
      "or mark as opt-out. Only approved prospects can receive outreach.",
    parameters: Type.Object({
      action: Type.String({
        description:
          "Action to take: 'list' to show pending prospects, " +
          "'approve' to approve specific contacts, " +
          "'opt_out' to mark contacts as opted out",
      }),
      contactPageIds: Type.Optional(
        Type.Array(Type.String({ description: "Contact page IDs to approve or opt out" })),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const cfg = getConfig();
      const crm = new NotionCrm(cfg);
      // oxlint-disable-next-line typescript/no-explicit-any
      const action = (params as any).action as string;
      // oxlint-disable-next-line typescript/no-explicit-any
      const contactPageIds = ((params as any).contactPageIds ?? []) as string[];

      if (action === "list") {
        const contacts = await crm.queryContacts({
          and: [
            { property: "Consent Status", select: { equals: "none" } },
            { property: "Opt Out", checkbox: { equals: false } },
          ],
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  pendingCount: contacts.length,
                  prospects: contacts.map((c) => ({
                    pageId: c.pageId,
                    name: c.name,
                    company: c.company,
                    role: c.role,
                    email: c.email,
                    source: c.source,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === "approve") {
        if (contactPageIds.length === 0) {
          return { content: [{ type: "text", text: "No contact page IDs provided to approve." }] };
        }
        let approved = 0;
        for (const pageId of contactPageIds) {
          await crm.updateContact(pageId, { consentStatus: "implied" });
          approved += 1;
        }
        return {
          content: [
            {
              type: "text",
              text: `Approved ${approved} contacts for outreach (consent_status set to 'implied').`,
            },
          ],
        };
      }

      if (action === "opt_out") {
        if (contactPageIds.length === 0) {
          return { content: [{ type: "text", text: "No contact page IDs provided to opt out." }] };
        }
        let optedOut = 0;
        for (const pageId of contactPageIds) {
          await crm.updateContact(pageId, { optOut: true });
          optedOut += 1;
        }
        return {
          content: [
            {
              type: "text",
              text: `Marked ${optedOut} contacts as opted out. They will not receive outreach.`,
            },
          ],
        };
      }

      return {
        content: [
          { type: "text", text: `Unknown action: ${action}. Use 'list', 'approve', or 'opt_out'.` },
        ],
      };
    },
  };
}

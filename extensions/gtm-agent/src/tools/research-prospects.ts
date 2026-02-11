import { Type } from "@sinclair/typebox";
import type { GtmConfig } from "../config.js";
import { NotionCrm } from "../notion-crm.js";

export function createResearchProspectsTool(getConfig: () => GtmConfig) {
  return {
    name: "gtm_save_prospects",
    description:
      "Save researched prospects to the CRM. Use web_search first to find prospects, " +
      "then call this tool with structured results. Deduplicates by email/company. " +
      "Auto-approved: no human gate for research + CRM save. " +
      "Prospects start with consent_status=none and must be approved before outreach.",
    parameters: Type.Object({
      prospects: Type.Array(
        Type.Object({
          name: Type.String({ description: "Full name of the prospect" }),
          company: Type.String({ description: "Company name" }),
          role: Type.String({ description: "Job title or role" }),
          email: Type.Optional(Type.String({ description: "Email address" })),
          linkedin: Type.Optional(Type.String({ description: "LinkedIn profile URL" })),
          x: Type.Optional(Type.String({ description: "X/Twitter handle or URL" })),
          website: Type.Optional(Type.String({ description: "Company or personal website" })),
          notes: Type.Optional(Type.String({ description: "Research notes" })),
          source: Type.String({ description: "Where this prospect was found" }),
        }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const cfg = getConfig();
      const crm = new NotionCrm(cfg);
      // oxlint-disable-next-line typescript/no-explicit-any
      const prospects = (params as any).prospects as Array<{
        name: string;
        company: string;
        role: string;
        email?: string;
        linkedin?: string;
        x?: string;
        website?: string;
        notes?: string;
        source: string;
      }>;

      const results: Array<{
        name: string;
        company: string;
        status: string;
        contactPageId?: string;
      }> = [];

      for (const prospect of prospects) {
        // Dedup by email first, then by company+name
        let existing = prospect.email ? await crm.findContactByEmail(prospect.email) : undefined;
        if (!existing) {
          const byCompany = await crm.findContactByCompany(prospect.company);
          existing = byCompany.find((c) => c.name.toLowerCase() === prospect.name.toLowerCase());
        }

        if (existing) {
          results.push({
            name: prospect.name,
            company: prospect.company,
            status: "duplicate_skipped",
            contactPageId: existing.pageId,
          });
          continue;
        }

        // Create contact with consent_status=none
        const contact = await crm.createContact({
          name: prospect.name,
          email: prospect.email,
          company: prospect.company,
          role: prospect.role,
          source: prospect.source,
          consentStatus: "none",
          linkedin: prospect.linkedin,
          x: prospect.x,
          website: prospect.website,
          notes: prospect.notes,
        });

        // Create deal at Lead stage
        const deal = await crm.createDeal({
          dealName: `${prospect.company} - Outbound`,
          company: prospect.company,
          stage: "Lead",
          contactPageId: contact.pageId,
        });

        // Log research activity
        await crm.logActivity({
          summary: `Prospect researched: ${prospect.name} at ${prospect.company} (${prospect.source})`,
          type: "Note",
          contactPageId: contact.pageId,
          dealPageId: deal.pageId,
        });

        results.push({
          name: prospect.name,
          company: prospect.company,
          status: "created",
          contactPageId: contact.pageId,
        });
      }

      const created = results.filter((r) => r.status === "created").length;
      const skipped = results.filter((r) => r.status === "duplicate_skipped").length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                summary: `Saved ${created} new prospects, skipped ${skipped} duplicates`,
                results,
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

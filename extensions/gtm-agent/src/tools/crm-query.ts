import { Type } from "@sinclair/typebox";
import type { GtmConfig } from "../config.js";
import { NotionCrm } from "../notion-crm.js";

export function createCrmQueryTool(getConfig: () => GtmConfig) {
  return {
    name: "gtm_crm_query",
    description:
      "Query the CRM pipeline. Search contacts by company/role/consent, " +
      "query deals by stage/value, or get a full pipeline summary.",
    parameters: Type.Object({
      query: Type.String({
        description: "Query type: 'contacts', 'deals', 'pipeline_summary'",
      }),
      company: Type.Optional(Type.String({ description: "Filter contacts/deals by company name" })),
      stage: Type.Optional(Type.String({ description: "Filter deals by stage" })),
      consentStatus: Type.Optional(
        Type.String({ description: "Filter contacts by consent status" }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const cfg = getConfig();
      const crm = new NotionCrm(cfg);
      // oxlint-disable-next-line typescript/no-explicit-any
      const p = params as any;
      const query = p.query as string;

      if (query === "pipeline_summary") {
        const summary = await crm.pipelineSummary();
        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }

      if (query === "contacts") {
        let filter: Record<string, unknown> | undefined;
        if (p.company) {
          filter = { property: "Company", rich_text: { contains: p.company } };
        } else if (p.consentStatus) {
          filter = { property: "Consent Status", select: { equals: p.consentStatus } };
        }
        const contacts = await crm.queryContacts(filter);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  count: contacts.length,
                  contacts: contacts.map((c) => ({
                    pageId: c.pageId,
                    name: c.name,
                    company: c.company,
                    role: c.role,
                    email: c.email,
                    consentStatus: c.consentStatus,
                    optOut: c.optOut,
                    lastContacted: c.lastContacted,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (query === "deals") {
        let filter: Record<string, unknown> | undefined;
        if (p.stage) {
          filter = { property: "Stage", select: { equals: p.stage } };
        } else if (p.company) {
          filter = { property: "Company", rich_text: { contains: p.company } };
        }
        const deals = await crm.queryDeals(filter);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  count: deals.length,
                  deals: deals.map((d) => ({
                    pageId: d.pageId,
                    dealName: d.dealName,
                    company: d.company,
                    value: d.value,
                    stage: d.stage,
                    closeDate: d.closeDate,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Unknown query type: ${query}. Use 'contacts', 'deals', or 'pipeline_summary'.`,
          },
        ],
      };
    },
  };
}

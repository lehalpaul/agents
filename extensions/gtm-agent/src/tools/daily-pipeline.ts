import { Type } from "@sinclair/typebox";
import type { GtmConfig } from "../config.js";
import { NotionCrm } from "../notion-crm.js";

export function createDailyPipelineTool(getConfig: () => GtmConfig) {
  return {
    name: "gtm_daily_pipeline",
    description:
      "Orchestrate the daily GTM cycle. Returns a structured summary of the pipeline state " +
      "and recommended actions. Does NOT auto-execute outreach — it reports what the agent " +
      "should do next using the other GTM tools. " +
      "Steps: check pipeline, find approved prospects needing outreach, identify follow-ups due, " +
      "summarize LinkedIn/X engagement opportunities.",
    parameters: Type.Object({
      dryRun: Type.Optional(
        Type.Boolean({ description: "If true, only report what would be done (default: false)" }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const cfg = getConfig();
      const crm = new NotionCrm(cfg);
      // oxlint-disable-next-line typescript/no-explicit-any
      const dryRun = (params as any).dryRun === true;
      const today = new Date().toISOString().split("T")[0];

      // 1. Pipeline summary
      const summary = await crm.pipelineSummary();

      // 2. Approved prospects needing initial outreach
      const approvedContacts = await crm.queryContacts({
        and: [
          { property: "Consent Status", select: { does_not_equal: "none" } },
          { property: "Opt Out", checkbox: { equals: false } },
        ],
      });

      const needsInitialOutreach = approvedContacts.filter((c) => !c.lastContacted);

      // 3. Follow-ups due today or overdue
      const followUpsDue = approvedContacts.filter(
        (c) => c.nextFollowup && c.nextFollowup <= today,
      );

      // 4. Prospects with LinkedIn/X URLs (for social engagement)
      const allContacts = await crm.queryContacts();
      const linkedInTargets = allContacts.filter((c) => crm.canContact(c) && !!c.linkedin);
      const xTargets = allContacts.filter((c) => crm.canContact(c) && !!c.x);

      const report = {
        date: today,
        dryRun,
        pipelineSummary: summary,
        actions: {
          initialOutreach: {
            count: needsInitialOutreach.length,
            limit: cfg.dailyEmailLimit,
            contacts: needsInitialOutreach.slice(0, cfg.dailyEmailLimit).map((c) => ({
              pageId: c.pageId,
              name: c.name,
              company: c.company,
              email: c.email,
            })),
          },
          followUps: {
            count: followUpsDue.length,
            contacts: followUpsDue.map((c) => ({
              pageId: c.pageId,
              name: c.name,
              company: c.company,
              email: c.email,
              nextFollowup: c.nextFollowup,
            })),
          },
          socialEngagement: {
            linkedInAvailable: linkedInTargets.length,
            linkedInLimit: cfg.dailyLinkedInLimit,
            xAvailable: xTargets.length,
            xLimit: cfg.dailyXLimit,
          },
          pendingApprovals: summary.pendingApprovals,
        },
        instructions: [
          summary.pendingApprovals > 0
            ? `Review and approve ${summary.pendingApprovals} pending prospects using gtm_approve_prospects`
            : null,
          needsInitialOutreach.length > 0
            ? `Send initial outreach to ${Math.min(needsInitialOutreach.length, cfg.dailyEmailLimit)} approved prospects using gtm_send_outreach`
            : null,
          followUpsDue.length > 0
            ? `Send ${followUpsDue.length} follow-up emails using gtm_send_outreach with appropriate sequenceStep`
            : null,
          "Use gtm_linkedin to search for and connect with prospects on LinkedIn",
          "Use gtm_x_engage to find and engage with prospects on X",
        ].filter(Boolean),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      };
    },
  };
}

import crypto from "node:crypto";
import type { OpenClawPluginCliContext } from "../../../src/plugins/types.js";

const GTM_CRON_JOB_NAME = "gtm-daily-pipeline";

type CronStoreMod = {
  loadCronStore: (
    path: string,
  ) => Promise<{ version: number; jobs: Array<Record<string, unknown>> }>;
  saveCronStore: (
    path: string,
    store: { version: number; jobs: Array<Record<string, unknown>> },
  ) => Promise<void>;
  resolveCronStorePath: (storePath?: string) => string;
};

async function loadCronStoreMod(): Promise<CronStoreMod> {
  try {
    return (await import("../../../src/cron/store.js")) as unknown as CronStoreMod;
  } catch {
    return (await import("../../../cron/store.js")) as unknown as CronStoreMod;
  }
}

/**
 * Register the `openclaw gtm` CLI subcommand group.
 *
 * Commands:
 *   openclaw gtm setup   - Create a daily 9 AM PT weekday cron job (idempotent)
 *   openclaw gtm status  - Show pipeline stats
 *   openclaw gtm run     - Manual trigger of daily pipeline
 */
export function registerGtmCli(ctx: OpenClawPluginCliContext): void {
  const gtm = ctx.program.command("gtm").description("Go-To-Market automation commands");

  gtm
    .command("setup")
    .description("Create a daily 9 AM PT weekday cron job for the GTM pipeline (idempotent)")
    .action(async () => {
      try {
        const cronMod = await loadCronStoreMod();
        const storePath = cronMod.resolveCronStorePath();
        const store = await cronMod.loadCronStore(storePath);

        // Check for existing job by name
        // oxlint-disable-next-line typescript/no-explicit-any
        const existing = store.jobs.find((j: any) => j.name === GTM_CRON_JOB_NAME);
        if (existing) {
          const rawId = existing.id;
          const jobId = typeof rawId === "string" ? rawId : "unknown";
          ctx.logger.info(
            `GTM cron job already exists (id: ${jobId}). Use 'openclaw cron' to manage it.`,
          );
          return;
        }

        const now = Date.now();
        const newJob = {
          id: crypto.randomUUID(),
          name: GTM_CRON_JOB_NAME,
          description: "Daily GTM pipeline: research, outreach, follow-ups, social engagement",
          enabled: true,
          createdAtMs: now,
          updatedAtMs: now,
          schedule: {
            kind: "cron",
            expr: "0 9 * * 1-5",
            tz: "America/Los_Angeles",
          },
          sessionTarget: "isolated",
          wakeMode: "now",
          payload: {
            kind: "agentTurn",
            message:
              "Run the daily GTM pipeline. Use gtm_daily_pipeline to get the current state, " +
              "then execute the recommended actions in order: " +
              "1) Review and approve new prospects, " +
              "2) Send initial outreach emails, " +
              "3) Send follow-up emails, " +
              "4) LinkedIn engagement, " +
              "5) X engagement. " +
              "Respect daily limits. Report summary when done.",
          },
          state: {},
        };

        store.jobs.push(newJob);
        await cronMod.saveCronStore(storePath, store);
        ctx.logger.info("GTM daily pipeline cron job created: weekdays at 9:00 AM PT");
      } catch (err) {
        ctx.logger.error(
          `Failed to create cron job: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

  gtm
    .command("status")
    .description("Show GTM pipeline stats from Notion CRM")
    .action(async () => {
      try {
        const { resolveGtmConfig } = await import("./config.js");
        const { NotionCrm } = await import("./notion-crm.js");

        const cfg = resolveGtmConfig(ctx.config.plugins?.["gtm-agent"] as Record<string, unknown>);
        const crm = new NotionCrm(cfg);
        const summary = await crm.pipelineSummary();

        ctx.logger.info("GTM Pipeline Status:");
        ctx.logger.info(`  Total contacts: ${summary.totalContacts}`);
        ctx.logger.info(`  Pending approvals: ${summary.pendingApprovals}`);
        ctx.logger.info("  Deals by stage:");
        for (const [stage, data] of Object.entries(summary.byStage)) {
          ctx.logger.info(
            `    ${stage}: ${data.count} deals, $${data.totalValue.toLocaleString()}`,
          );
        }
      } catch (err) {
        ctx.logger.error(
          `Failed to fetch pipeline status: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

  gtm
    .command("run")
    .description("Manually trigger the daily GTM pipeline")
    .action(async () => {
      ctx.logger.info("Triggering daily GTM pipeline via agent turn...");
      try {
        let triggerAgentTurn: (message: string) => Promise<void>;
        try {
          const mod = await import("../../../src/agents/trigger.js");
          // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unnecessary-type-assertion
          triggerAgentTurn = (mod as any).triggerAgentTurn;
        } catch {
          const mod = await import("../../../agents/trigger.js");
          // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unnecessary-type-assertion
          triggerAgentTurn = (mod as any).triggerAgentTurn;
        }

        await triggerAgentTurn(
          "Run the daily GTM pipeline using gtm_daily_pipeline. Execute all recommended actions, respecting daily limits.",
        );
        ctx.logger.info("Daily pipeline triggered successfully.");
      } catch (err) {
        ctx.logger.error(
          `Failed to trigger pipeline: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
}

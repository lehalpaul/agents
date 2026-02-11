import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import type { GtmConfig } from "./src/config.js";
import { resolveGtmConfig } from "./src/config.js";
import { registerGtmCli } from "./src/cron-setup.js";
import { createApproveProspectsTool } from "./src/tools/approve-prospects.js";
import { createCrmQueryTool } from "./src/tools/crm-query.js";
import { createDailyPipelineTool } from "./src/tools/daily-pipeline.js";
import { createLinkedInConnectTool } from "./src/tools/linkedin-connect.js";
import { createResearchProspectsTool } from "./src/tools/research-prospects.js";
import { createSendOutreachTool } from "./src/tools/send-outreach.js";
import { createXEngageTool } from "./src/tools/x-engage.js";

export default function register(api: OpenClawPluginApi) {
  // Lazy config resolution — resolved on first tool call, not at registration time.
  // This avoids failing the whole plugin load if Notion keys aren't set yet.
  let cachedConfig: GtmConfig | undefined;
  const getConfig = (): GtmConfig => {
    if (!cachedConfig) {
      cachedConfig = resolveGtmConfig(api.pluginConfig);
    }
    return cachedConfig;
  };

  // Phase 1: Research + CRM
  api.registerTool(createResearchProspectsTool(getConfig), { optional: true });
  api.registerTool(createApproveProspectsTool(getConfig), { optional: true });
  api.registerTool(createCrmQueryTool(getConfig), { optional: true });

  // Phase 2: Email outreach
  api.registerTool(createSendOutreachTool(getConfig), { optional: true });

  // Phase 3: Social (assistive mode — requires Playwright)
  api.registerTool(createLinkedInConnectTool(getConfig), { optional: true });
  api.registerTool(createXEngageTool(getConfig), { optional: true });

  // Phase 4: Daily pipeline orchestrator
  api.registerTool(createDailyPipelineTool(getConfig), { optional: true });

  // CLI: openclaw gtm setup|status|run
  api.registerCli(registerGtmCli, { commands: ["gtm"] });
}

import { Type } from "@sinclair/typebox";
import type { GtmConfig } from "../config.js";
import { NotionCrm } from "../notion-crm.js";
import { navigateToProfile, prefillDm, prefillFollow, searchX } from "../x-browser.js";

export function createXEngageTool(getConfig: () => GtmConfig) {
  return {
    name: "gtm_x_engage",
    description:
      "X/Twitter assistive actions. Navigates and prefills but does NOT auto-submit — " +
      "user must review and click. " +
      "Actions: 'search', 'navigate', 'prefill_follow', 'prefill_dm'. " +
      "All actions are logged to the CRM.",
    parameters: Type.Object({
      action: Type.String({
        description:
          "Action: 'search' (search users), 'navigate' (open profile), " +
          "'prefill_follow' (navigate to profile for follow), " +
          "'prefill_dm' (compose DM with prefilled message)",
      }),
      query: Type.Optional(Type.String({ description: "Search query (for 'search' action)" })),
      profileUrl: Type.Optional(Type.String({ description: "X profile URL" })),
      handle: Type.Optional(Type.String({ description: "X handle (for 'prefill_dm')" })),
      message: Type.Optional(Type.String({ description: "DM message to prefill" })),
      contactPageId: Type.Optional(
        Type.String({ description: "Notion contact page ID for logging" }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const cfg = getConfig();
      const crm = new NotionCrm(cfg);
      // oxlint-disable-next-line typescript/no-explicit-any
      const p = params as any;
      const action = p.action as string;
      const profileDir = cfg.xProfileDir;

      if (action === "search") {
        const query = p.query as string;
        if (!query) {
          throw new Error("query is required for search action");
        }
        const results = await searchX(profileDir, query);
        return {
          content: [{ type: "text", text: JSON.stringify({ action: "search", results }, null, 2) }],
        };
      }

      if (action === "navigate") {
        const url = p.profileUrl as string;
        if (!url) {
          throw new Error("profileUrl is required for navigate action");
        }
        const currentUrl = await navigateToProfile(profileDir, url);

        if (p.contactPageId) {
          await crm.logActivity({
            summary: `X: viewed profile ${url}`,
            type: "X",
            contactPageId: p.contactPageId,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ action: "navigate", url: currentUrl }, null, 2),
            },
          ],
        };
      }

      if (action === "prefill_follow") {
        const url = p.profileUrl as string;
        if (!url) {
          throw new Error("profileUrl is required for prefill_follow");
        }
        const result = await prefillFollow(profileDir, url);

        if (p.contactPageId) {
          await crm.logActivity({
            summary: `X: follow action queued for ${url}`,
            type: "X",
            contactPageId: p.contactPageId,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ action: "prefill_follow", url, ...result }, null, 2),
            },
          ],
        };
      }

      if (action === "prefill_dm") {
        const handle = p.handle as string;
        const message = p.message as string;
        if (!handle) {
          throw new Error("handle is required for prefill_dm");
        }
        if (!message) {
          throw new Error("message is required for prefill_dm");
        }

        const result = await prefillDm(profileDir, handle, message);

        if (p.contactPageId) {
          await crm.logActivity({
            summary: `X: DM prefilled for ${handle}`,
            type: "X",
            contactPageId: p.contactPageId,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ action: "prefill_dm", handle, ...result }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Unknown action: ${action}. Use 'search', 'navigate', 'prefill_follow', or 'prefill_dm'.`,
          },
        ],
      };
    },
  };
}

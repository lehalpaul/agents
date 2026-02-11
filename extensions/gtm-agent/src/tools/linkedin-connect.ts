import { Type } from "@sinclair/typebox";
import type { GtmConfig } from "../config.js";
import {
  checkPendingConnections,
  navigateToProfile,
  prefillConnectionRequest,
  prefillMessage,
  searchLinkedIn,
} from "../linkedin-browser.js";
import { NotionCrm } from "../notion-crm.js";

export function createLinkedInConnectTool(getConfig: () => GtmConfig) {
  return {
    name: "gtm_linkedin",
    description:
      "LinkedIn assistive actions. Navigates and prefills forms but does NOT auto-submit — " +
      "the user must review and click Send/Connect. " +
      "Actions: 'search', 'navigate', 'prefill_connect', 'check_pending', 'prefill_message'. " +
      "All actions are logged to the CRM.",
    parameters: Type.Object({
      action: Type.String({
        description:
          "Action: 'search' (search people), 'navigate' (open profile), " +
          "'prefill_connect' (navigate + fill connection note), " +
          "'check_pending' (check sent invitations), " +
          "'prefill_message' (open chat + fill message)",
      }),
      query: Type.Optional(Type.String({ description: "Search query (for 'search' action)" })),
      location: Type.Optional(
        Type.String({ description: "Location filter (for 'search' action)" }),
      ),
      profileUrl: Type.Optional(Type.String({ description: "LinkedIn profile URL" })),
      note: Type.Optional(
        Type.String({ description: "Connection request note (for 'prefill_connect')" }),
      ),
      message: Type.Optional(
        Type.String({ description: "Message to send (for 'prefill_message')" }),
      ),
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
      const profileDir = cfg.linkedInProfileDir;

      if (action === "search") {
        const query = p.query as string;
        if (!query) {
          throw new Error("query is required for search action");
        }
        const results = await searchLinkedIn(profileDir, query, p.location);
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
            summary: `LinkedIn: viewed profile ${url}`,
            type: "LinkedIn",
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

      if (action === "prefill_connect") {
        const url = p.profileUrl as string;
        const note = p.note as string;
        if (!url) {
          throw new Error("profileUrl is required for prefill_connect");
        }
        if (!note) {
          throw new Error("note is required for prefill_connect");
        }

        await navigateToProfile(profileDir, url);
        const result = await prefillConnectionRequest(profileDir, note);

        if (p.contactPageId) {
          await crm.logActivity({
            summary: `LinkedIn: connection request prefilled for ${url}`,
            type: "LinkedIn",
            contactPageId: p.contactPageId,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ action: "prefill_connect", url, ...result }, null, 2),
            },
          ],
        };
      }

      if (action === "check_pending") {
        const pending = await checkPendingConnections(profileDir);
        return {
          content: [
            { type: "text", text: JSON.stringify({ action: "check_pending", pending }, null, 2) },
          ],
        };
      }

      if (action === "prefill_message") {
        const url = p.profileUrl as string;
        const message = p.message as string;
        if (!url) {
          throw new Error("profileUrl is required for prefill_message");
        }
        if (!message) {
          throw new Error("message is required for prefill_message");
        }

        const result = await prefillMessage(profileDir, url, message);

        if (p.contactPageId) {
          await crm.logActivity({
            summary: `LinkedIn: message prefilled for ${url}`,
            type: "LinkedIn",
            contactPageId: p.contactPageId,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ action: "prefill_message", url, ...result }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Unknown action: ${action}. Use 'search', 'navigate', 'prefill_connect', 'check_pending', or 'prefill_message'.`,
          },
        ],
      };
    },
  };
}

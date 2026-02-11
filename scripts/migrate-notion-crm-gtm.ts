/**
 * Migrate existing Notion CRM databases to add GTM Agent properties.
 *
 * Adds to Contacts: Consent Status, Opt Out, Source, LinkedIn, X, Website, Notes, Next Follow-up
 * Adds to Activities Type select: LinkedIn, X
 *
 * Usage:
 *   bun scripts/migrate-notion-crm-gtm.ts \
 *     --contacts-ds-id <data_source_id> \
 *     --activities-ds-id <data_source_id>
 *
 * Safe to run multiple times — Notion ignores properties that already exist.
 */

import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const NOTION_VERSION = "2025-09-03";
const API_BASE = "https://api.notion.com/v1";
const THROTTLE_MS = 350;

function getApiKey(): string {
  if (process.env.NOTION_API_KEY) {
    return process.env.NOTION_API_KEY;
  }
  try {
    return readFileSync(join(homedir(), ".config/notion/api_key"), "utf-8").trim();
  } catch {
    console.error("Error: Set NOTION_API_KEY env var or create ~/.config/notion/api_key");
    process.exit(1);
  }
}

function getArg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error(`Missing required argument: ${flag}`);
    console.error(
      "Usage: bun scripts/migrate-notion-crm-gtm.ts --contacts-ds-id <id> --activities-ds-id <id>",
    );
    process.exit(1);
  }
  return process.argv[idx + 1].replace(/-/g, "");
}

const API_KEY = getApiKey();
const CONTACTS_DS_ID = getArg("--contacts-ds-id");
const ACTIVITIES_DS_ID = getArg("--activities-ds-id");

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notionPatch(path: string, body: Record<string, unknown>) {
  await sleep(THROTTLE_MS);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Notion API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  console.log("Migrating Contacts data source to add GTM properties...\n");

  // Add new properties to the Contacts data source
  await notionPatch(`/data_sources/${CONTACTS_DS_ID}`, {
    properties: {
      "Consent Status": {
        select: {
          options: [{ name: "none" }, { name: "implied" }, { name: "express" }],
        },
      },
      "Opt Out": { checkbox: {} },
      Source: { rich_text: {} },
      LinkedIn: { rich_text: {} },
      X: { rich_text: {} },
      Website: { rich_text: {} },
      Notes: { rich_text: {} },
      "Next Follow-up": { date: {} },
    },
  });
  console.log("  + Consent Status (select: none/implied/express)");
  console.log("  + Opt Out (checkbox)");
  console.log("  + Source (rich_text)");
  console.log("  + LinkedIn (rich_text)");
  console.log("  + X (rich_text)");
  console.log("  + Website (rich_text)");
  console.log("  + Notes (rich_text)");
  console.log("  + Next Follow-up (date)");

  console.log("\nMigrating Activities data source to add LinkedIn/X type options...\n");

  // Update Activities Type select to include new options.
  // Notion merges options, so existing ones are preserved.
  await notionPatch(`/data_sources/${ACTIVITIES_DS_ID}`, {
    properties: {
      Type: {
        select: {
          options: [
            { name: "Call" },
            { name: "Email" },
            { name: "Meeting" },
            { name: "Note" },
            { name: "LinkedIn" },
            { name: "X" },
          ],
        },
      },
    },
  });
  console.log("  + Type options: LinkedIn, X (merged with existing)");

  console.log("\nDone! Existing data is preserved; new properties have empty/default values.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});

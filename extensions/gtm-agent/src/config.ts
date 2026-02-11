import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsentStatus = "none" | "implied" | "express";

export type Prospect = {
  name: string;
  company: string;
  role: string;
  email?: string;
  linkedin?: string;
  x?: string;
  website?: string;
  notes?: string;
  source: string;
};

export type Contact = {
  pageId: string;
  name: string;
  email?: string;
  phone?: string;
  company: string;
  role: string;
  consentStatus: ConsentStatus;
  optOut: boolean;
  source?: string;
  linkedin?: string;
  x?: string;
  website?: string;
  lastContacted?: string;
  nextFollowup?: string;
};

export type DealStage =
  | "Lead"
  | "Qualified"
  | "Proposal"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

export type Deal = {
  pageId: string;
  dealName: string;
  company: string;
  value?: number;
  stage: DealStage;
  owner?: string;
  closeDate?: string;
  notes?: string;
  contactPageId?: string;
};

export type ActivityType = "Call" | "Email" | "Meeting" | "Note" | "LinkedIn" | "X";

export type Activity = {
  pageId?: string;
  summary: string;
  type: ActivityType;
  date: string;
  followUpDate?: string;
  contactPageId?: string;
  dealPageId?: string;
};

export type GtmConfig = {
  notionApiKey: string;
  notionContactsDbId: string;
  notionContactsDsId: string;
  notionDealsDbId: string;
  notionDealsDsId: string;
  notionActivitiesDbId: string;
  notionActivitiesDsId: string;
  targetMarket?: string;
  targetLocation?: string;
  dailyEmailLimit: number;
  dailyLinkedInLimit: number;
  dailyXLimit: number;
  gmailAccount?: string;
  linkedInProfileDir: string;
  xProfileDir: string;
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export function resolveNotionApiKey(): string {
  if (process.env.NOTION_API_KEY) {
    return process.env.NOTION_API_KEY;
  }
  try {
    return readFileSync(join(homedir(), ".config/notion/api_key"), "utf-8").trim();
  } catch {
    throw new Error("Set NOTION_API_KEY env var or create ~/.config/notion/api_key");
  }
}

const DEFAULT_PROFILE_BASE = join(homedir(), ".openclaw", "gtm-agent", "browser-profiles");

export function resolveGtmConfig(pluginConfig: Record<string, unknown> = {}): GtmConfig {
  const str = (key: string): string | undefined => {
    const v = pluginConfig[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const num = (key: string, fallback: number): number => {
    const v = pluginConfig[key];
    return typeof v === "number" && v > 0 ? v : fallback;
  };

  const notionApiKey = resolveNotionApiKey();

  const notionContactsDbId = str("notionContactsDbId");
  const notionContactsDsId = str("notionContactsDsId");
  const notionDealsDbId = str("notionDealsDbId");
  const notionDealsDsId = str("notionDealsDsId");
  const notionActivitiesDbId = str("notionActivitiesDbId");
  const notionActivitiesDsId = str("notionActivitiesDsId");

  if (
    !notionContactsDbId ||
    !notionContactsDsId ||
    !notionDealsDbId ||
    !notionDealsDsId ||
    !notionActivitiesDbId ||
    !notionActivitiesDsId
  ) {
    throw new Error(
      "GTM Agent requires all Notion DB IDs in plugin config: " +
        "notionContactsDbId, notionContactsDsId, notionDealsDbId, notionDealsDsId, " +
        "notionActivitiesDbId, notionActivitiesDsId",
    );
  }

  return {
    notionApiKey,
    notionContactsDbId,
    notionContactsDsId,
    notionDealsDbId,
    notionDealsDsId,
    notionActivitiesDbId,
    notionActivitiesDsId,
    targetMarket: str("targetMarket"),
    targetLocation: str("targetLocation"),
    dailyEmailLimit: num("dailyEmailLimit", 20),
    dailyLinkedInLimit: num("dailyLinkedInLimit", 15),
    dailyXLimit: num("dailyXLimit", 10),
    gmailAccount: str("gmailAccount"),
    linkedInProfileDir: str("linkedInProfileDir") ?? join(DEFAULT_PROFILE_BASE, "linkedin"),
    xProfileDir: str("xProfileDir") ?? join(DEFAULT_PROFILE_BASE, "x"),
  };
}

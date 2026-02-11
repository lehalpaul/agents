import type {
  Activity,
  ActivityType,
  ConsentStatus,
  Contact,
  Deal,
  DealStage,
  GtmConfig,
} from "./config.js";

// ---------------------------------------------------------------------------
// Notion API helpers
// ---------------------------------------------------------------------------

const NOTION_VERSION = "2025-09-03";
const API_BASE = "https://api.notion.com/v1";
const THROTTLE_MS = 350;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type NotionHeaders = Record<string, string>;

function makeHeaders(apiKey: string): NotionHeaders {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionRequest(
  method: string,
  path: string,
  headers: NotionHeaders,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await sleep(THROTTLE_MS);
  const opts: RequestInit = { method, headers };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Property helpers
// ---------------------------------------------------------------------------

function titleProp(text: string) {
  return { title: [{ text: { content: text } }] };
}

function richTextProp(text: string) {
  return { rich_text: [{ text: { content: text } }] };
}

function selectProp(name: string) {
  return { select: { name } };
}

function dateProp(dateStr: string) {
  return { date: { start: dateStr } };
}

function emailProp(email: string) {
  return { email };
}

function numberProp(value: number) {
  return { number: value };
}

function checkboxProp(value: boolean) {
  return { checkbox: value };
}

function relationProp(pageId: string) {
  return { relation: [{ id: pageId }] };
}

// Extract values from Notion response properties
function extractTitle(props: Record<string, unknown>, key: string): string {
  // oxlint-disable-next-line typescript/no-explicit-any
  const p = props[key] as any;
  return p?.title?.[0]?.text?.content ?? p?.title?.[0]?.plain_text ?? "";
}

function extractRichText(props: Record<string, unknown>, key: string): string {
  // oxlint-disable-next-line typescript/no-explicit-any
  const p = props[key] as any;
  return p?.rich_text?.[0]?.text?.content ?? p?.rich_text?.[0]?.plain_text ?? "";
}

function extractSelect(props: Record<string, unknown>, key: string): string {
  // oxlint-disable-next-line typescript/no-explicit-any
  const p = props[key] as any;
  return p?.select?.name ?? "";
}

function extractDate(props: Record<string, unknown>, key: string): string | undefined {
  // oxlint-disable-next-line typescript/no-explicit-any
  const p = props[key] as any;
  return p?.date?.start ?? undefined;
}

function extractEmail(props: Record<string, unknown>, key: string): string | undefined {
  // oxlint-disable-next-line typescript/no-explicit-any
  const p = props[key] as any;
  return typeof p?.email === "string" ? p.email : undefined;
}

function extractNumber(props: Record<string, unknown>, key: string): number | undefined {
  // oxlint-disable-next-line typescript/no-explicit-any
  const p = props[key] as any;
  return typeof p?.number === "number" ? p.number : undefined;
}

function extractCheckbox(props: Record<string, unknown>, key: string): boolean {
  // oxlint-disable-next-line typescript/no-explicit-any
  const p = props[key] as any;
  return p?.checkbox === true;
}

function extractRelation(props: Record<string, unknown>, key: string): string | undefined {
  // oxlint-disable-next-line typescript/no-explicit-any
  const p = props[key] as any;
  return p?.relation?.[0]?.id ?? undefined;
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

async function paginatedQuery(
  endpoint: string,
  headers: NotionHeaders,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const allResults: Record<string, unknown>[] = [];
  let startCursor: string | undefined;

  do {
    const queryBody = {
      ...body,
      page_size: 100,
      ...(startCursor ? { start_cursor: startCursor } : {}),
    };
    const res = await notionRequest("POST", endpoint, headers, queryBody);
    // oxlint-disable-next-line typescript/no-explicit-any
    const page = res as any;
    const results = (page.results ?? []) as Record<string, unknown>[];
    allResults.push(...results);
    startCursor = page.has_more ? page.next_cursor : undefined;
  } while (startCursor);

  return allResults;
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

function parseContact(page: Record<string, unknown>): Contact {
  const props = page.properties as Record<string, unknown>;
  return {
    pageId: page.id as string,
    name: extractTitle(props, "Name"),
    email: extractEmail(props, "Email"),
    phone: extractRichText(props, "Phone"),
    company: extractRichText(props, "Company"),
    role: extractRichText(props, "Role"),
    consentStatus: (extractSelect(props, "Consent Status") as ConsentStatus) || "none",
    optOut: extractCheckbox(props, "Opt Out"),
    source: extractRichText(props, "Source"),
    linkedin: extractRichText(props, "LinkedIn") || undefined,
    x: extractRichText(props, "X") || undefined,
    website: extractRichText(props, "Website") || undefined,
    lastContacted: extractDate(props, "Last Contacted"),
    nextFollowup: extractDate(props, "Next Follow-up"),
  };
}

function parseDeal(page: Record<string, unknown>): Deal {
  const props = page.properties as Record<string, unknown>;
  return {
    pageId: page.id as string,
    dealName: extractTitle(props, "Deal Name"),
    company: extractRichText(props, "Company"),
    value: extractNumber(props, "Value"),
    stage: (extractSelect(props, "Stage") as DealStage) || "Lead",
    owner: extractRichText(props, "Owner"),
    closeDate: extractDate(props, "Close Date"),
    notes: extractRichText(props, "Notes"),
    contactPageId: extractRelation(props, "Contact"),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class NotionCrm {
  private headers: NotionHeaders;
  private cfg: GtmConfig;

  constructor(cfg: GtmConfig) {
    this.cfg = cfg;
    this.headers = makeHeaders(cfg.notionApiKey);
  }

  // -- Contacts -------------------------------------------------------------

  async createContact(prospect: {
    name: string;
    email?: string;
    phone?: string;
    company: string;
    role: string;
    source: string;
    consentStatus?: ConsentStatus;
    linkedin?: string;
    x?: string;
    website?: string;
    notes?: string;
  }): Promise<Contact> {
    const properties: Record<string, unknown> = {
      Name: titleProp(prospect.name),
      Company: richTextProp(prospect.company),
      Role: richTextProp(prospect.role),
      Source: richTextProp(prospect.source),
      "Consent Status": selectProp(prospect.consentStatus ?? "none"),
      "Opt Out": checkboxProp(false),
    };
    if (prospect.email) {
      properties.Email = emailProp(prospect.email);
    }
    if (prospect.phone) {
      properties.Phone = richTextProp(prospect.phone);
    }
    if (prospect.linkedin) {
      properties.LinkedIn = richTextProp(prospect.linkedin);
    }
    if (prospect.x) {
      properties.X = richTextProp(prospect.x);
    }
    if (prospect.website) {
      properties.Website = richTextProp(prospect.website);
    }
    if (prospect.notes) {
      properties.Notes = richTextProp(prospect.notes);
    }

    const page = await notionRequest("POST", "/pages", this.headers, {
      parent: { type: "data_source_id", data_source_id: this.cfg.notionContactsDsId },
      properties,
    });
    return parseContact(page);
  }

  async findContactByEmail(email: string): Promise<Contact | undefined> {
    const res = await notionRequest(
      "POST",
      `/data_sources/${this.cfg.notionContactsDsId}/query`,
      this.headers,
      {
        filter: { property: "Email", email: { equals: email } },
        page_size: 1,
      },
    );
    // oxlint-disable-next-line typescript/no-explicit-any
    const results = (res as any).results as Record<string, unknown>[];
    if (!results || results.length === 0) {
      return undefined;
    }
    return parseContact(results[0]);
  }

  async findContactByCompany(company: string): Promise<Contact[]> {
    const results = await paginatedQuery(
      `/data_sources/${this.cfg.notionContactsDsId}/query`,
      this.headers,
      { filter: { property: "Company", rich_text: { contains: company } } },
    );
    return results.map(parseContact);
  }

  async queryContacts(filter?: Record<string, unknown>): Promise<Contact[]> {
    const body: Record<string, unknown> = {};
    if (filter) {
      body.filter = filter;
    }
    const results = await paginatedQuery(
      `/data_sources/${this.cfg.notionContactsDsId}/query`,
      this.headers,
      body,
    );
    return results.map(parseContact);
  }

  async updateContact(
    pageId: string,
    updates: Partial<{
      consentStatus: ConsentStatus;
      optOut: boolean;
      lastContacted: string;
      nextFollowup: string;
    }>,
  ): Promise<void> {
    const properties: Record<string, unknown> = {};
    if (updates.consentStatus !== undefined) {
      properties["Consent Status"] = selectProp(updates.consentStatus);
    }
    if (updates.optOut !== undefined) {
      properties["Opt Out"] = checkboxProp(updates.optOut);
    }
    if (updates.lastContacted !== undefined) {
      properties["Last Contacted"] = dateProp(updates.lastContacted);
    }
    if (updates.nextFollowup !== undefined) {
      properties["Next Follow-up"] = dateProp(updates.nextFollowup);
    }
    if (Object.keys(properties).length === 0) {
      return;
    }
    await notionRequest("PATCH", `/pages/${pageId}`, this.headers, { properties });
  }

  async getContactByPageId(pageId: string): Promise<Contact> {
    const page = await notionRequest("GET", `/pages/${pageId}`, this.headers);
    return parseContact(page);
  }

  // -- Deals ----------------------------------------------------------------

  async createDeal(deal: {
    dealName: string;
    company: string;
    value?: number;
    stage?: DealStage;
    owner?: string;
    closeDate?: string;
    notes?: string;
    contactPageId?: string;
  }): Promise<Deal> {
    const properties: Record<string, unknown> = {
      "Deal Name": titleProp(deal.dealName),
      Company: richTextProp(deal.company),
      Stage: selectProp(deal.stage ?? "Lead"),
    };
    if (deal.value !== undefined) {
      properties.Value = numberProp(deal.value);
    }
    if (deal.owner) {
      properties.Owner = richTextProp(deal.owner);
    }
    if (deal.closeDate) {
      properties["Close Date"] = dateProp(deal.closeDate);
    }
    if (deal.notes) {
      properties.Notes = richTextProp(deal.notes);
    }
    if (deal.contactPageId) {
      properties.Contact = relationProp(deal.contactPageId);
    }

    const page = await notionRequest("POST", "/pages", this.headers, {
      parent: { type: "data_source_id", data_source_id: this.cfg.notionDealsDsId },
      properties,
    });
    return parseDeal(page);
  }

  async queryDeals(filter?: Record<string, unknown>): Promise<Deal[]> {
    const body: Record<string, unknown> = {};
    if (filter) {
      body.filter = filter;
    }
    const results = await paginatedQuery(
      `/data_sources/${this.cfg.notionDealsDsId}/query`,
      this.headers,
      body,
    );
    return results.map(parseDeal);
  }

  async updateDealStage(pageId: string, stage: DealStage): Promise<void> {
    await notionRequest("PATCH", `/pages/${pageId}`, this.headers, {
      properties: { Stage: selectProp(stage) },
    });
  }

  // -- Activities -----------------------------------------------------------

  async logActivity(activity: {
    summary: string;
    type: ActivityType;
    date?: string;
    followUpDate?: string;
    contactPageId?: string;
    dealPageId?: string;
  }): Promise<Activity> {
    const properties: Record<string, unknown> = {
      Summary: titleProp(activity.summary),
      Type: selectProp(activity.type),
      Date: dateProp(activity.date ?? new Date().toISOString().split("T")[0]),
    };
    if (activity.followUpDate) {
      properties["Follow-up Date"] = dateProp(activity.followUpDate);
    }
    if (activity.contactPageId) {
      properties.Contact = relationProp(activity.contactPageId);
    }
    if (activity.dealPageId) {
      properties.Deal = relationProp(activity.dealPageId);
    }

    const page = await notionRequest("POST", "/pages", this.headers, {
      parent: { type: "data_source_id", data_source_id: this.cfg.notionActivitiesDsId },
      properties,
    });
    return {
      pageId: page.id as string,
      summary: activity.summary,
      type: activity.type,
      date: activity.date ?? new Date().toISOString().split("T")[0],
      followUpDate: activity.followUpDate,
      contactPageId: activity.contactPageId,
      dealPageId: activity.dealPageId,
    };
  }

  // -- Pipeline summary -----------------------------------------------------

  async pipelineSummary(): Promise<{
    byStage: Record<string, { count: number; totalValue: number }>;
    pendingApprovals: number;
    totalContacts: number;
  }> {
    const [deals, contacts] = await Promise.all([this.queryDeals(), this.queryContacts()]);

    const byStage: Record<string, { count: number; totalValue: number }> = {};
    for (const deal of deals) {
      const entry = byStage[deal.stage] ?? { count: 0, totalValue: 0 };
      entry.count += 1;
      entry.totalValue += deal.value ?? 0;
      byStage[deal.stage] = entry;
    }

    const pendingApprovals = contacts.filter((c) => c.consentStatus === "none" && !c.optOut).length;

    return { byStage, pendingApprovals, totalContacts: contacts.length };
  }

  // -- Compliance guard -----------------------------------------------------

  canContact(contact: Contact): boolean {
    return contact.consentStatus !== "none" && !contact.optOut;
  }
}

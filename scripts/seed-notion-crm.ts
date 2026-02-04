import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const NOTION_VERSION = "2025-09-03";
const API_BASE = "https://api.notion.com/v1";
const THROTTLE_MS = 350;

function getApiKey(): string {
  if (process.env.NOTION_API_KEY) return process.env.NOTION_API_KEY;
  try {
    return readFileSync(join(homedir(), ".config/notion/api_key"), "utf-8").trim();
  } catch {
    console.error("Error: Set NOTION_API_KEY env var or create ~/.config/notion/api_key");
    process.exit(1);
  }
}

function getParentPageId(): string {
  const idx = process.argv.indexOf("--parent-page-id");
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error("Usage: bun scripts/seed-notion-crm.ts --parent-page-id <PAGE_ID>");
    process.exit(1);
  }
  return process.argv[idx + 1].replace(/-/g, "");
}

const API_KEY = getApiKey();
const PARENT_PAGE_ID = getParentPageId();
const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notionPost(path: string, body: Record<string, unknown>) {
  await sleep(THROTTLE_MS);
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Notion API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function notionGet(path: string) {
  await sleep(THROTTLE_MS);
  const res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });
  if (!res.ok) throw new Error(`Notion API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function notionPatch(path: string, body: Record<string, unknown>) {
  await sleep(THROTTLE_MS);
  const res = await fetch(`${API_BASE}${path}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Notion API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function createDatabase(title: string, properties: Record<string, unknown>) {
  const res = await notionPost("/databases", {
    parent: { type: "page_id", page_id: PARENT_PAGE_ID },
    title: [{ text: { content: title } }],
    is_inline: true,
    initial_data_source: {
      name: title,
      properties,
    },
  });
  const databaseId = res.id;
  const db = await notionGet(`/databases/${databaseId}`);
  const dataSourceId = db?.data_sources?.[0]?.id;
  if (!dataSourceId) {
    throw new Error(`Failed to resolve data_source_id for database ${databaseId}`);
  }
  return { database_id: databaseId, data_source_id: dataSourceId };
}

async function addRelationProperty(dataSourceId: string, propertyName: string, targetDataSourceId: string) {
  await notionPatch(`/data_sources/${dataSourceId}`, {
    properties: { [propertyName]: { relation: { data_source_id: targetDataSourceId, single_property: {} } } },
  });
}

function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split("T")[0]; }
function daysFromNow(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; }

const CONTACTS = [
  { name: "Sarah Chen", email: "sarah.chen@acmecorp.com", phone: "+1-415-555-0101", company: "Acme Corp", role: "VP of Engineering" },
  { name: "John Park", email: "john.park@techflow.io", phone: "+1-650-555-0102", company: "TechFlow Inc", role: "CTO" },
  { name: "Maria Santos", email: "maria@brighthorizon.com", phone: "+1-212-555-0103", company: "Bright Horizon", role: "Head of Operations" },
  { name: "David Kim", email: "dkim@novapay.com", phone: "+1-310-555-0104", company: "NovaPay", role: "Director of Product" },
  { name: "Emily Wright", email: "ewright@summitlogistics.com", phone: "+1-512-555-0105", company: "Summit Logistics", role: "CEO" },
  { name: "James Liu", email: "james.liu@quantumdata.ai", phone: "+1-408-555-0106", company: "QuantumData AI", role: "VP of Sales" },
  { name: "Rachel Green", email: "rgreen@mediapulse.co", phone: "+1-323-555-0107", company: "MediaPulse", role: "Marketing Director" },
  { name: "Carlos Reyes", email: "carlos@fasttrack.dev", phone: "+1-305-555-0108", company: "FastTrack Dev", role: "Founder" },
  { name: "Lisa Patel", email: "lisa.patel@clearview.com", phone: "+1-617-555-0109", company: "ClearView Analytics", role: "Head of IT" },
  { name: "Tom Wilson", email: "twilson@steelbridge.io", phone: "+1-312-555-0110", company: "SteelBridge", role: "COO" },
  { name: "Nina Kowalski", email: "nina@blueshift.co", phone: "+1-206-555-0111", company: "BlueShift", role: "VP of Partnerships" },
  { name: "Alex Turner", email: "alex.t@redcanvas.com", phone: "+1-503-555-0112", company: "RedCanvas", role: "Engineering Manager" },
  { name: "Priya Sharma", email: "priya@cloudnest.io", phone: "+1-858-555-0113", company: "CloudNest", role: "Director of Infrastructure" },
  { name: "Mike O'Brien", email: "mobrien@greenvolt.com", phone: "+1-720-555-0114", company: "GreenVolt Energy", role: "Procurement Lead" },
  { name: "Sophie Martin", email: "smartin@datapeak.co", phone: "+1-919-555-0115", company: "DataPeak", role: "Chief Data Officer" },
];

const DEALS = [
  { name: "Acme Corp Platform License", company: "Acme Corp", value: 120000, stage: "Negotiation", owner: "You", closeDate: "2026-03-15", notes: "Multi-year deal, needs security review", contactIdx: 0 },
  { name: "TechFlow Annual Contract", company: "TechFlow Inc", value: 85000, stage: "Proposal", owner: "You", closeDate: "2026-02-28", notes: "Interested in enterprise tier", contactIdx: 1 },
  { name: "Bright Horizon Onboarding", company: "Bright Horizon", value: 45000, stage: "Qualified", owner: "You", closeDate: "2026-04-01", notes: "Need to demo workflow automation", contactIdx: 2 },
  { name: "NovaPay Integration", company: "NovaPay", value: 200000, stage: "Negotiation", owner: "You", closeDate: "2026-02-20", notes: "Legal reviewing MSA, close is imminent", contactIdx: 3 },
  { name: "Summit Logistics Expansion", company: "Summit Logistics", value: 350000, stage: "Proposal", owner: "You", closeDate: "2026-05-01", notes: "Expanding from 50 to 500 seats", contactIdx: 4 },
  { name: "QuantumData POC", company: "QuantumData AI", value: 15000, stage: "Lead", owner: "You", closeDate: "2026-06-01", notes: "Inbound from website, exploring options", contactIdx: 5 },
  { name: "MediaPulse Content Suite", company: "MediaPulse", value: 60000, stage: "Closed Won", owner: "You", closeDate: "2026-01-10", notes: "Signed! Onboarding scheduled", contactIdx: 6 },
  { name: "FastTrack Dev Tools", company: "FastTrack Dev", value: 25000, stage: "Closed Lost", owner: "You", closeDate: "2026-01-05", notes: "Went with competitor on price", contactIdx: 7 },
  { name: "ClearView Analytics Renewal", company: "ClearView Analytics", value: 95000, stage: "Qualified", owner: "You", closeDate: "2026-03-30", notes: "Renewal conversation started, upsell opportunity", contactIdx: 8 },
  { name: "SteelBridge Pilot", company: "SteelBridge", value: 30000, stage: "Lead", owner: "You", closeDate: "2026-07-01", notes: "Referred by Tom Wilson, early stage", contactIdx: 9 },
];

const ACTIVITIES = [
  { summary: "Intro call with Sarah — discussed platform needs", type: "Call", date: daysAgo(25), contactIdx: 0, dealIdx: 0, followUp: null },
  { summary: "Sent proposal to Acme Corp", type: "Email", date: daysAgo(18), contactIdx: 0, dealIdx: 0, followUp: null },
  { summary: "Security review meeting with Acme", type: "Meeting", date: daysAgo(7), contactIdx: 0, dealIdx: 0, followUp: daysFromNow(3) },
  { summary: "John Park demo session", type: "Meeting", date: daysAgo(20), contactIdx: 1, dealIdx: 1, followUp: null },
  { summary: "Sent TechFlow pricing breakdown", type: "Email", date: daysAgo(12), contactIdx: 1, dealIdx: 1, followUp: daysFromNow(5) },
  { summary: "Discovery call with Maria", type: "Call", date: daysAgo(15), contactIdx: 2, dealIdx: 2, followUp: null },
  { summary: "Bright Horizon — scheduled demo for next week", type: "Note", date: daysAgo(5), contactIdx: 2, dealIdx: 2, followUp: daysFromNow(7) },
  { summary: "NovaPay legal review call", type: "Call", date: daysAgo(3), contactIdx: 3, dealIdx: 3, followUp: daysFromNow(2) },
  { summary: "MSA redline sent to NovaPay", type: "Email", date: daysAgo(2), contactIdx: 3, dealIdx: 3, followUp: null },
  { summary: "Emily Wright intro — expansion discussion", type: "Call", date: daysAgo(22), contactIdx: 4, dealIdx: 4, followUp: null },
  { summary: "Summit Logistics ROI analysis sent", type: "Email", date: daysAgo(10), contactIdx: 4, dealIdx: 4, followUp: null },
  { summary: "Summit exec presentation", type: "Meeting", date: daysAgo(4), contactIdx: 4, dealIdx: 4, followUp: daysFromNow(10) },
  { summary: "Inbound lead from QuantumData website", type: "Note", date: daysAgo(8), contactIdx: 5, dealIdx: 5, followUp: daysFromNow(1) },
  { summary: "MediaPulse contract signing", type: "Meeting", date: daysAgo(21), contactIdx: 6, dealIdx: 6, followUp: null },
  { summary: "MediaPulse onboarding kickoff", type: "Meeting", date: daysAgo(14), contactIdx: 6, dealIdx: 6, followUp: null },
  { summary: "FastTrack final pricing discussion", type: "Call", date: daysAgo(28), contactIdx: 7, dealIdx: 7, followUp: null },
  { summary: "FastTrack — lost deal retrospective note", type: "Note", date: daysAgo(26), contactIdx: 7, dealIdx: 7, followUp: null },
  { summary: "ClearView renewal intro with Lisa", type: "Call", date: daysAgo(9), contactIdx: 8, dealIdx: 8, followUp: daysFromNow(4) },
  { summary: "ClearView usage report sent", type: "Email", date: daysAgo(6), contactIdx: 8, dealIdx: 8, followUp: null },
  { summary: "Tom Wilson referral follow-up", type: "Call", date: daysAgo(2), contactIdx: 9, dealIdx: 9, followUp: daysFromNow(8) },
];

async function main() {
  console.log("Creating databases...\n");

  console.log("  Creating Contacts database...");
  const contactsDb = await createDatabase("Contacts", {
    Name: { title: {} }, Email: { email: {} }, Phone: { rich_text: {} },
    Company: { rich_text: {} }, Role: { rich_text: {} }, "Last Contacted": { date: {} },
  });
  console.log(`  ✓ Contacts: ${contactsDb.database_id}`);

  console.log("  Creating Deals database...");
  const dealsDb = await createDatabase("Deals", {
    "Deal Name": { title: {} }, Company: { rich_text: {} },
    Value: { number: { format: "dollar" } },
    Stage: { select: { options: ["Lead","Qualified","Proposal","Negotiation","Closed Won","Closed Lost"].map(s => ({ name: s })) } },
    Owner: { rich_text: {} }, "Close Date": { date: {} }, Notes: { rich_text: {} },
  });
  console.log(`  ✓ Deals: ${dealsDb.database_id}`);

  console.log("  Creating Activities database...");
  const activitiesDb = await createDatabase("Activities", {
    Summary: { title: {} },
    Type: { select: { options: ["Call","Email","Meeting","Note"].map(s => ({ name: s })) } },
    Date: { date: {} }, "Follow-up Date": { date: {} },
  });
  console.log(`  ✓ Activities: ${activitiesDb.database_id}`);

  console.log("\nAdding relations...");
    await addRelationProperty(dealsDb.data_source_id, "Contact", contactsDb.data_source_id);
  console.log("  ✓ Deals.Contact → Contacts");
    await addRelationProperty(activitiesDb.data_source_id, "Contact", contactsDb.data_source_id);
  console.log("  ✓ Activities.Contact → Contacts");
    await addRelationProperty(activitiesDb.data_source_id, "Deal", dealsDb.data_source_id);
  console.log("  ✓ Activities.Deal → Deals");

  console.log("\nSeeding contacts...");
  const contactPageIds: string[] = [];
  for (const c of CONTACTS) {
    const res = await notionPost("/pages", {
      parent: { type: "data_source_id", data_source_id: contactsDb.data_source_id },
      properties: {
        Name: { title: [{ text: { content: c.name } }] },
        Email: { email: c.email },
        Phone: { rich_text: [{ text: { content: c.phone } }] },
        Company: { rich_text: [{ text: { content: c.company } }] },
        Role: { rich_text: [{ text: { content: c.role } }] },
        "Last Contacted": { date: { start: daysAgo(Math.floor(Math.random() * 14) + 1) } },
      },
    });
    contactPageIds.push(res.id);
    console.log(`  ✓ ${c.name}`);
  }

  console.log("\nSeeding deals...");
  const dealPageIds: string[] = [];
  for (const d of DEALS) {
    const res = await notionPost("/pages", {
      parent: { type: "data_source_id", data_source_id: dealsDb.data_source_id },
      properties: {
        "Deal Name": { title: [{ text: { content: d.name } }] },
        Company: { rich_text: [{ text: { content: d.company } }] },
        Value: { number: d.value },
        Stage: { select: { name: d.stage } },
        Owner: { rich_text: [{ text: { content: d.owner } }] },
        "Close Date": { date: { start: d.closeDate } },
        Notes: { rich_text: [{ text: { content: d.notes } }] },
        Contact: { relation: [{ id: contactPageIds[d.contactIdx] }] },
      },
    });
    dealPageIds.push(res.id);
    console.log(`  ✓ ${d.name} (${d.stage}) — $${d.value.toLocaleString()}`);
  }

  console.log("\nSeeding activities...");
  for (const a of ACTIVITIES) {
    const properties: Record<string, unknown> = {
      Summary: { title: [{ text: { content: a.summary } }] },
      Type: { select: { name: a.type } },
      Date: { date: { start: a.date } },
      Contact: { relation: [{ id: contactPageIds[a.contactIdx] }] },
      Deal: { relation: [{ id: dealPageIds[a.dealIdx] }] },
    };
    if (a.followUp) properties["Follow-up Date"] = { date: { start: a.followUp } };
    await notionPost("/pages", { parent: { type: "data_source_id", data_source_id: activitiesDb.data_source_id }, properties });
    console.log(`  ✓ ${a.summary}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("CRM DATABASE IDS:");
  console.log("=".repeat(60));
  console.log(JSON.stringify({ deals: dealsDb, contacts: contactsDb, activities: activitiesDb }, null, 2));
  console.log("\nDone! Check your Notion page.");
}

main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GtmConfig } from "./config.js";
import { NotionCrm } from "./notion-crm.js";

const MOCK_CONFIG: GtmConfig = {
  notionApiKey: "test-api-key",
  notionContactsDbId: "contacts-db-id",
  notionContactsDsId: "contacts-ds-id",
  notionDealsDbId: "deals-db-id",
  notionDealsDsId: "deals-ds-id",
  notionActivitiesDbId: "activities-db-id",
  notionActivitiesDsId: "activities-ds-id",
  dailyEmailLimit: 20,
  dailyLinkedInLimit: 15,
  dailyXLimit: 10,
  linkedInProfileDir: "/tmp/test-linkedin",
  xProfileDir: "/tmp/test-x",
};

function mockFetchResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

describe("NotionCrm", () => {
  let crm: NotionCrm;

  beforeEach(() => {
    crm = new NotionCrm(MOCK_CONFIG);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("canContact", () => {
    it("returns false when consent_status is none", () => {
      expect(
        crm.canContact({
          pageId: "p1",
          name: "Test",
          company: "Co",
          role: "CEO",
          consentStatus: "none",
          optOut: false,
        }),
      ).toBe(false);
    });

    it("returns false when opt_out is true", () => {
      expect(
        crm.canContact({
          pageId: "p1",
          name: "Test",
          company: "Co",
          role: "CEO",
          consentStatus: "implied",
          optOut: true,
        }),
      ).toBe(false);
    });

    it("returns true when consent is implied and not opted out", () => {
      expect(
        crm.canContact({
          pageId: "p1",
          name: "Test",
          company: "Co",
          role: "CEO",
          consentStatus: "implied",
          optOut: false,
        }),
      ).toBe(true);
    });

    it("returns true when consent is express", () => {
      expect(
        crm.canContact({
          pageId: "p1",
          name: "Test",
          company: "Co",
          role: "CEO",
          consentStatus: "express",
          optOut: false,
        }),
      ).toBe(true);
    });
  });

  describe("createContact", () => {
    it("sends correct properties to Notion API", async () => {
      const mockResponse = {
        id: "new-contact-id",
        properties: {
          Name: { title: [{ text: { content: "Jane Doe" } }] },
          Email: { email: "jane@example.com" },
          Phone: { rich_text: [] },
          Company: { rich_text: [{ text: { content: "Acme" } }] },
          Role: { rich_text: [{ text: { content: "CTO" } }] },
          "Consent Status": { select: { name: "none" } },
          "Opt Out": { checkbox: false },
          Source: { rich_text: [{ text: { content: "web search" } }] },
          "Last Contacted": { date: null },
          "Next Follow-up": { date: null },
        },
      };

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(mockFetchResponse(mockResponse) as Response);

      // Advance timers past throttle delay
      const contactPromise = crm.createContact({
        name: "Jane Doe",
        email: "jane@example.com",
        company: "Acme",
        role: "CTO",
        source: "web search",
      });
      await vi.advanceTimersByTimeAsync(500);
      const contact = await contactPromise;

      expect(contact.pageId).toBe("new-contact-id");
      expect(contact.name).toBe("Jane Doe");
      expect(contact.company).toBe("Acme");
      expect(contact.consentStatus).toBe("none");
      expect(contact.optOut).toBe(false);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.notion.com/v1/pages");
      const body = JSON.parse(opts?.body as string);
      expect(body.parent.data_source_id).toBe("contacts-ds-id");
      expect(body.properties.Name.title[0].text.content).toBe("Jane Doe");
    });
  });

  describe("pipelineSummary", () => {
    it("aggregates deals by stage", async () => {
      const dealsResponse = {
        has_more: false,
        results: [
          {
            id: "d1",
            properties: {
              "Deal Name": { title: [{ text: { content: "Deal A" } }] },
              Company: { rich_text: [{ text: { content: "Co A" } }] },
              Value: { number: 50000 },
              Stage: { select: { name: "Lead" } },
              Owner: { rich_text: [] },
              "Close Date": { date: null },
              Notes: { rich_text: [] },
              Contact: { relation: [] },
            },
          },
          {
            id: "d2",
            properties: {
              "Deal Name": { title: [{ text: { content: "Deal B" } }] },
              Company: { rich_text: [{ text: { content: "Co B" } }] },
              Value: { number: 100000 },
              Stage: { select: { name: "Lead" } },
              Owner: { rich_text: [] },
              "Close Date": { date: null },
              Notes: { rich_text: [] },
              Contact: { relation: [] },
            },
          },
        ],
      };

      const contactsResponse = {
        has_more: false,
        results: [
          {
            id: "c1",
            properties: {
              Name: { title: [{ text: { content: "Person A" } }] },
              Email: { email: "a@example.com" },
              Phone: { rich_text: [] },
              Company: { rich_text: [{ text: { content: "Co A" } }] },
              Role: { rich_text: [{ text: { content: "CEO" } }] },
              "Consent Status": { select: { name: "none" } },
              "Opt Out": { checkbox: false },
              Source: { rich_text: [] },
              "Last Contacted": { date: null },
              "Next Follow-up": { date: null },
            },
          },
        ],
      };

      let callCount = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        callCount += 1;
        // First call is deals query, second is contacts query
        if (callCount === 1) {
          return mockFetchResponse(dealsResponse) as Response;
        }
        return mockFetchResponse(contactsResponse) as Response;
      });

      const summaryPromise = crm.pipelineSummary();
      // Advance past both throttle delays
      await vi.advanceTimersByTimeAsync(1000);
      const summary = await summaryPromise;

      expect(summary.byStage.Lead).toEqual({ count: 2, totalValue: 150000 });
      expect(summary.pendingApprovals).toBe(1);
      expect(summary.totalContacts).toBe(1);
    });
  });
});

import { describe, expect, it } from "vitest";
import { nextFollowupDate, personalizeTemplate } from "./gmail-outreach.js";

describe("gmail-outreach", () => {
  describe("personalizeTemplate", () => {
    it("replaces placeholders with data values", () => {
      const template =
        "Hi {{name}}, I saw {{company}} is growing. Would love to connect about {{topic}}.";
      const result = personalizeTemplate(template, {
        name: "Sarah",
        company: "Acme Corp",
        topic: "automation",
      });
      expect(result).toBe(
        "Hi Sarah, I saw Acme Corp is growing. Would love to connect about automation.",
      );
    });

    it("replaces multiple occurrences", () => {
      const template = "{{name}} from {{company}} — meet {{name}}";
      const result = personalizeTemplate(template, { name: "John", company: "TechFlow" });
      expect(result).toBe("John from TechFlow — meet John");
    });

    it("leaves unmatched placeholders as-is", () => {
      const template = "Hi {{name}}, re: {{topic}}";
      const result = personalizeTemplate(template, { name: "Alice" });
      expect(result).toBe("Hi Alice, re: {{topic}}");
    });
  });

  describe("nextFollowupDate", () => {
    it("returns a date string", () => {
      const result = nextFollowupDate("initial");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns a future date", () => {
      const result = nextFollowupDate("initial");
      const resultDate = new Date(result);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expect(resultDate.getTime()).toBeGreaterThan(today.getTime());
    });

    it("uses different delays for different sequence steps", () => {
      const initial = new Date(nextFollowupDate("initial")).getTime();
      const followUp3 = new Date(nextFollowupDate("follow-up-3")).getTime();
      // follow-up-3 should be further out than initial
      expect(followUp3).toBeGreaterThan(initial);
    });
  });
});

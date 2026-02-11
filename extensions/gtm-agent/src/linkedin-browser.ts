import type { BrowserContext, Page } from "playwright-core";
import { humanDelay, launchPersistentContext } from "./browser-service.js";

let context: BrowserContext | undefined;
let page: Page | undefined;

async function getPage(profileDir: string): Promise<Page> {
  if (!context) {
    context = await launchPersistentContext(profileDir);
  }
  if (!page || page.isClosed()) {
    page = context.pages()[0] ?? (await context.newPage());
  }
  return page;
}

export async function searchLinkedIn(
  profileDir: string,
  query: string,
  location?: string,
): Promise<Array<{ name: string; headline: string; url: string }>> {
  const p = await getPage(profileDir);
  // LinkedIn people search accepts keywords + location text filter
  let searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
  if (location) {
    searchUrl += `&location=${encodeURIComponent(location)}`;
  }
  await p.goto(searchUrl);
  await humanDelay();

  // Extract basic profile info from search results
  const results = await p.evaluate(() => {
    const items: Array<{ name: string; headline: string; url: string }> = [];
    const cards = document.querySelectorAll(".reusable-search__result-container");
    for (const card of cards) {
      const linkEl = card.querySelector("a.app-aware-link");
      const nameEl = card.querySelector(".entity-result__title-text a span[aria-hidden=true]");
      const headlineEl = card.querySelector(".entity-result__primary-subtitle");
      if (linkEl && nameEl) {
        items.push({
          name: nameEl.textContent?.trim() ?? "",
          headline: headlineEl?.textContent?.trim() ?? "",
          url: (linkEl.getAttribute("href") ?? "").split("?")[0],
        });
      }
    }
    return items.slice(0, 10);
  });

  return results;
}

export async function navigateToProfile(profileDir: string, url: string): Promise<string> {
  const p = await getPage(profileDir);
  await p.goto(url);
  await humanDelay();
  return p.url();
}

export async function prefillConnectionRequest(
  profileDir: string,
  note: string,
): Promise<{ status: string }> {
  const p = await getPage(profileDir);
  await humanDelay(1000, 3000);

  // Click "Connect" button if present
  const connectBtn = await p.$('button:has-text("Connect")');
  if (!connectBtn) {
    return { status: "connect_button_not_found" };
  }
  await connectBtn.click();
  await humanDelay(1000, 2000);

  // Click "Add a note"
  const addNoteBtn = await p.$('button:has-text("Add a note")');
  if (addNoteBtn) {
    await addNoteBtn.click();
    await humanDelay(500, 1000);
  }

  // Fill the note field
  const textarea = await p.$('textarea[name="message"]');
  if (textarea) {
    await textarea.fill(note);
  }

  // Do NOT click Send — user reviews and clicks manually
  return { status: "prefilled_awaiting_user_action" };
}

export async function checkPendingConnections(
  profileDir: string,
): Promise<Array<{ name: string; url: string }>> {
  const p = await getPage(profileDir);
  await p.goto("https://www.linkedin.com/mynetwork/invitation-manager/sent/");
  await humanDelay();

  const pending = await p.evaluate(() => {
    const items: Array<{ name: string; url: string }> = [];
    const cards = document.querySelectorAll(".invitation-card");
    for (const card of cards) {
      const linkEl = card.querySelector("a");
      const nameEl = card.querySelector(".invitation-card__title");
      if (linkEl && nameEl) {
        items.push({
          name: nameEl.textContent?.trim() ?? "",
          url: (linkEl as HTMLElement).getAttribute("href")?.split("?")[0] ?? "",
        });
      }
    }
    return items.slice(0, 20);
  });

  return pending;
}

export async function prefillMessage(
  profileDir: string,
  profileUrl: string,
  message: string,
): Promise<{ status: string }> {
  const p = await getPage(profileDir);
  await p.goto(profileUrl);
  await humanDelay();

  // Click "Message" button
  const msgBtn = await p.$('button:has-text("Message")');
  if (!msgBtn) {
    return { status: "message_button_not_found" };
  }
  await msgBtn.click();
  await humanDelay(1000, 2000);

  // Fill message box
  const msgBox = await p.$('div[role="textbox"]');
  if (msgBox) {
    await msgBox.fill(message);
  }

  // Do NOT send — user reviews
  return { status: "prefilled_awaiting_user_action" };
}

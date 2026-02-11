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

export async function searchX(
  profileDir: string,
  query: string,
): Promise<Array<{ name: string; handle: string; bio: string; url: string }>> {
  const p = await getPage(profileDir);
  await p.goto(`https://x.com/search?q=${encodeURIComponent(query)}&f=user`);
  await humanDelay(3000, 6000);

  const results = await p.evaluate(() => {
    const items: Array<{ name: string; handle: string; bio: string; url: string }> = [];
    const cells = document.querySelectorAll('[data-testid="UserCell"]');
    for (const cell of cells) {
      const nameEl = cell.querySelector('[data-testid="User-Name"] a span');
      const handleEl = cell.querySelector('[data-testid="User-Name"] a + a span');
      const bioEl = cell.querySelector('[data-testid="UserCell"] > div > div:last-child');
      const linkEl = cell.querySelector("a");
      const href = linkEl?.getAttribute("href") ?? "";
      if (nameEl && href) {
        let profileUrl: string;
        try {
          profileUrl = `https://x.com${new URL(href, "https://x.com").pathname}`;
        } catch {
          profileUrl = `https://x.com${href}`;
        }
        items.push({
          name: nameEl.textContent?.trim() ?? "",
          handle: handleEl?.textContent?.trim() ?? "",
          bio: bioEl?.textContent?.trim() ?? "",
          url: profileUrl,
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

export async function prefillFollow(profileDir: string, url: string): Promise<{ status: string }> {
  const p = await getPage(profileDir);
  await p.goto(url);
  await humanDelay();

  // Check if already following
  const unfollowBtn = await p.$('[data-testid$="-unfollow"]');
  if (unfollowBtn) {
    return { status: "already_following" };
  }

  // Navigate to profile but do NOT auto-follow — user clicks
  return { status: "navigated_awaiting_user_action" };
}

export async function prefillDm(
  profileDir: string,
  handle: string,
  message: string,
): Promise<{ status: string }> {
  const p = await getPage(profileDir);
  // Navigate to DM compose for this user
  const cleanHandle = handle.replace("@", "");
  await p.goto(`https://x.com/messages/compose`);
  await humanDelay(2000, 4000);

  // Search for user in compose
  const searchInput = await p.$('input[data-testid="searchPeople"]');
  if (searchInput) {
    await searchInput.fill(cleanHandle);
    await humanDelay(1500, 3000);

    // Click the first matching user
    const userCell = await p.$('[data-testid="UserCell"]');
    if (userCell) {
      await userCell.click();
      await humanDelay(1000, 2000);

      // Click Next
      const nextBtn = await p.$('[data-testid="nextButton"]');
      if (nextBtn) {
        await nextBtn.click();
      }
      await humanDelay(1000, 2000);

      // Fill the message box
      const msgBox = await p.$('[data-testid="dmComposerTextInput"]');
      if (msgBox) {
        await msgBox.fill(message);
      }
    }
  }

  // Do NOT send — user reviews
  return { status: "prefilled_awaiting_user_action" };
}

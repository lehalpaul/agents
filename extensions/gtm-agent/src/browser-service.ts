import type { Browser, BrowserContext } from "playwright-core";
import fs from "node:fs/promises";

// Manages Playwright chromium with persistent profile dirs.
// User logs in manually once; cookies persist across sessions.

let browserInstance: Browser | undefined;

async function ensurePlaywright(): Promise<typeof import("playwright-core")> {
  try {
    return await import("playwright-core");
  } catch {
    throw new Error(
      "playwright-core is not installed. Run: npm install playwright-core && npx playwright install chromium",
    );
  }
}

export async function launchPersistentContext(profileDir: string): Promise<BrowserContext> {
  const pw = await ensurePlaywright();
  await fs.mkdir(profileDir, { recursive: true });
  const context = await pw.chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  browserInstance = context.browser() ?? undefined;
  return context;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = undefined;
  }
}

/**
 * Randomized delay to mimic human behavior (min 2s, max 8s by default).
 */
export function humanDelay(minMs = 2000, maxMs = 8000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}

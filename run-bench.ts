import { chromium } from "@playwright/test";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("http://localhost:5173/bench.html", { timeout: 60000 });
  await page.waitForSelector("#run", { timeout: 60000 });

  // Click the run button
  await page.click("#run");

  // Wait for results to appear in window.__BENCH_RESULTS__
  await page.waitForFunction(
    () => (window as any).__BENCH_RESULTS__ !== undefined,
    { timeout: 120000 }
  );

  const results = await page.evaluate(() => (window as any).__BENCH_RESULTS__);
  console.log("BENCH_RESULTS", JSON.stringify(results, null, 2));

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

import fs from "fs";
import puppeteer from "puppeteer-core";
import { logger, useLogger } from "../../helpers/log.js";
import { getMetricsFromPage } from "./src/metrics.js";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

useLogger(app);

let browser = null;

async function main() {
  if (!browser) {
    console.log("Launching browser...");
    browser = await puppeteer.launch({
      executablePath:
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      //args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
      // width and height
      defaultViewport: { width: 580, height: 600 },
    });
  }

  // goto page
  const page = await browser.newPage();

  console.log("Waiting for page to load...");
  await page.goto("https://kalshi.com/ideas/profiles/EJG7", {
    waitUntil: "networkidle2",
  });

  console.log("Clicking 'Positions' tab...");
  const spans = await page.$$("span");
  const spanTexts = await Promise.all(
    spans.map((span) => span.evaluate((el) => el.textContent.trim()))
  );
  const positionsSpanIndex = spanTexts.findIndex(
    (text) => text === "Positions"
  );
  if (positionsSpanIndex !== -1) {
    await spans[positionsSpanIndex].click();
  }

  const metrics = await getMetricsFromPage(page);
  logger("metrics", metrics);

  // in the div with class infinite-scroll-component,
  // get the text context of all divs that start with class interactive-
  const eventsRawText = await page.evaluate(() => {
    const containerDiv = Array.from(document.querySelectorAll("div")).find(
      (div) => div.className.startsWith("infinite-scroll-component")
    );

    if (!containerDiv) return [];

    const positionDivs = Array.from(
      containerDiv.querySelectorAll("div")
    ).filter((div) => div.className.startsWith("interactive-"));

    return positionDivs.map((div) => ({
      rawText: div.innerText,
    }));
  });

  // Process the raw text data
  const events = eventsRawText.map((item) => {
    const rows = item.rawText.split("\n");
    //remove the first item and return the rest as title
    const title = rows.shift();
    const positions = [];
    for (let i = 0; i < rows.length; i += 3) {
      const details = rows[i + 2]; // e.g. '$750.08 ($187.52) · 18752 contracts'

      const contracts = details.split(" · ")[1].replace(" contracts", "");

      const position = {
        side: rows[i],
        outcome: rows[i + 1],
        contracts: Number(contracts.replace(/,/g, "")),
        details: rows[i + 2],
      };

      positions.push(position);
    }

    return {
      rawText: item.rawText,
      title,
      positions,
    };
  });
  console.log(`Found ${events.length} events with positions.`);

  // each event use the title to click a span with that text to go to the event page
  // save the url of that page to the event object
  for (const event of events) {
    const spans = await page.$$("span");
    for (const span of spans) {
      const text = await span.evaluate((el) => el.textContent.trim());

      if (text !== event.title) {
        continue;
      }
      // click parent
      await span.evaluate((el) => el.parentElement.click());
      await page.waitForNavigation({ waitUntil: "networkidle2" });
      await delay(1000); //wait a second for url to update
      event.url = page.url();
      console.log(event.title, `-> Navigated to event page: ${event.url}`);
      await page.goBack({ waitUntil: "networkidle2" });
      break;
    }
  }

  for (const event of events) {
    event.ticker = event.url.split("/").pop().toUpperCase();
  }

  for (const event of events) {
    const response = await fetch(
      `https://api.elections.kalshi.com/trade-api/v2/events/${event.ticker}`,
      { method: "GET", body: undefined }
    );
    const data = await response.json();
    event.eventData = data;
    console.log(data);
    delay(2500); // half second delay between requests
  }

  for (const event of events) {
    for (const position of event.positions) {
      const market = event.eventData.markets.find(
        (m) =>
          m.no_sub_title === position.outcome ||
          m.yes_sub_title === position.outcome
      );

      if (!market) continue;
      console.log("Found market", market);
    }
  }

  const result = {
    metrics,
    events,
    timeStamp: new Date().toISOString(),
  };

  //save positions to file
  fs.writeFileSync("logs/ej2_positions.json", JSON.stringify(result, null, 2));

  console.log("All done!");
  await page.close();
}

main();

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

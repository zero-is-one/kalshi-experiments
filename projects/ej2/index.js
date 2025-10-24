import puppeteer from "puppeteer-core";
import {
  createLogServer,
  getLogAsString,
  logger,
} from "../../helpers/logger/index.js";
import { getMetricsFromPage } from "./src/metrics.js";
import { getEvent, order } from "../../helpers/kalshi-api/index.js";
import { delay } from "../../helpers/delay.js";

const checkIntervalMinutes = 10;
const betsMade = [];

createLogServer();
let browser = null;

async function main() {
  console.log("Get EJ positions from Kalshi...");
  if (!browser) {
    console.log("* Launching browser...");
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

  console.log("* Waiting for page to load...");
  await page.goto("https://kalshi.com/ideas/profiles/EJG7", {
    waitUntil: "networkidle2",
  });

  console.log("* Getting Metrics...");
  const metrics = await getMetricsFromPage(page);

  console.log("* Clicking 'Positions' tab...");
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

    return positionDivs.map((div) => div.innerText);
  });

  // Process the raw text data
  const eventPositions = eventsRawText.map((rawText) => {
    const rows = rawText.split("\n");
    //remove the first item and return the rest as title
    const title = rows.shift();
    const positions = [];
    for (let i = 0; i < rows.length; i += 3) {
      const details = rows[i + 2]; // e.g. '$750.08 ($187.52) · 18752 contracts'

      const contracts = details.split(" · ")[1].replace(" contracts", "");

      const position = {
        side: rows[i].toLowerCase(),
        outcome: rows[i + 1],
        contracts: Number(contracts.replace(/,/g, "")),
        details: rows[i + 2],
      };

      positions.push(position);
    }

    return {
      title,
      positions,
      rawText,
    };
  });

  console.log(`Found ${eventPositions.length} raw events with positions.`);
  console.log("Navigating to each event page to get urls and tickers...");

  // each event use the title to click a span with that text to go to the event page
  // save the url of that page to the event object

  for (const eventPosition of eventPositions) {
    const spans = await page.$$("span");
    for (const span of spans) {
      const text = await span.evaluate((el) => el.textContent.trim());

      if (text !== eventPosition.title) {
        continue;
      }
      // click parent
      await span.evaluate((el) => el.parentElement.click());
      await page.waitForNavigation({ waitUntil: "networkidle2" });
      await delay(1000); //wait a second for url to update
      eventPosition.url = page.url();

      if (eventPosition.url.includes("/markets/")) {
        eventPosition.ticker = eventPosition.url.split("/").pop().toUpperCase();
      }

      console.log("*", eventPosition.title);
      console.log("└─ `", eventPosition.url);

      await page.goBack({ waitUntil: "networkidle2" });
      break;
    }
  }

  logger("history", { eventPositions, metrics });

  console.log("Fetching event details from Kalshi API and placing orders...");

  const eventsLog = getLogAsString("api-events") || "";

  for (const eventPosition of eventPositions) {
    if (!eventPosition.url) continue;
    if (!eventPosition.ticker) continue;

    console.log(`Fetching data for event: ${eventPosition.title}`);

    if (eventsLog.includes(eventPosition.ticker)) {
      console.log(
        `└─  Skipping ${eventPosition.ticker}, already fetched in logs.`
      );
      continue;
    }

    const [eventResponse, error] = await getEvent(eventPosition.ticker);

    logger("api-events", {
      ticker: eventPosition.ticker,
      eventResponse,
      error,
    });

    if (error) {
      console.log(
        `(!) Error fetching event data for ticker ${eventPosition.ticker}:`,
        error
      );

      logger("errors", error);

      continue;
    }

    for (const position of eventPosition.positions) {
      console.log(`└─ Processing position for outcome: ${position.outcome}`);

      const market = eventResponse.markets.find(
        (m) =>
          m.no_sub_title === position.outcome ||
          m.yes_sub_title === position.outcome
      );

      if (!market) continue;

      console.log(
        `└─ Found market: ${market.title} for outcome ${position.outcome}.`
      );

      const contractCount = 1;

      console.log(
        `└─ Placing order for ${contractCount} contracts on '${position.side}' side.`
      );

      // Place order logic would go here
      const orderResult = await order({
        ticker: market.ticker,
        type: "market",
        action: "buy",
        side: position.side,
        count: contractCount,
        [`${position.side}_price`]: 90, // max price in cents
        client_order_id: `ejg7`,
      });

      logger("orders", {
        ticker: market.ticker,
        side: position.side,
        contracts: contractCount,
        orderResult,
      });

      betsMade.push({
        ticker: market.ticker,
        side: position.side,
        contracts: contractCount,
        orderResult,
      });

      console.log(`└─ Order result:`, orderResult);
    }

    await delay(20000);
  }

  console.log("Check Complete.");
  console.log(
    "Bets Made This Session:",
    betsMade.map((b) => ` ${b.ticker} - ${b.side} - ${b.contracts} contracts`)
  );
  await page.close();
  console.log("---------------------");
}

setInterval(() => {
  console.log(
    `Current time (EST): ${new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
    })}`
  );
  main();
}, checkIntervalMinutes * 60 * 1000);

main();

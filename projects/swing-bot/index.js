import puppeteer from "puppeteer-core";
import fs from "fs";
import { getEvent, order } from "../../helpers/kalshi-api/index.js";
import { logger } from "../../helpers/logger/index.js";
import { delay } from "../../helpers/delay.js";

let betsMade = [];
let browser = null;

const contractCount = 1;
const checkIntervalMinutes = 10;

async function main() {
  if (!browser) {
    console.log("Launching browser...");
    browser = await puppeteer.launch({
      executablePath:
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      //args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
      // width and height
      defaultViewport: { width: 800, height: 600 },
    });
  }

  console.log("Loading tennis matches from live page...");
  const page = await browser.newPage();
  await page.goto("https://kalshi.com/calendar", {
    waitUntil: "networkidle2",
  });
  console.log(" └─ Page loaded");

  await delay(1000); // wait for 5 seconds

  // click a button with a span that has text 'Tennis', using a CSS selector
  const buttons = await page.$$("button span");
  for (const button of buttons) {
    const text = await button.evaluate((el) => el.textContent);
    if (text.trim() === "Tennis") {
      await button.click();
      break;
    }
  }

  await delay(2000); // wait for 2 seconds

  // get all the a withs hrefs that include the word 'market/'

  const matchLinks = await page.$$eval("a[href*='markets/']", (links) =>
    links.map((link) => {
      // there are div with the role of button,
      // get there text
      const isLive = Array.from(link.querySelectorAll("span")).some((span) =>
        span.textContent.includes("LIVE")
      );

      // get all ellents with text 'flex items-center gap-[6px]'
      const data = link.querySelectorAll("div.flex.items-center.gap-\\[6px\\]");

      return {
        href: link.href,
        data: Array.from(data).map((el) => el.textContent.trim()),
        isLive,
      };
    })
  );

  const validMatches = matchLinks
    // data is length 4
    .filter((link) => link.data.length === 4)
    // isLive is false
    .filter((link) => !link.isLive)
    // percentage values in data[2] and data[3] are >= 41%
    .filter(
      (link) =>
        link.data[2].includes("%") &&
        link.data[3].includes("%") &&
        Number(link.data[2].replace("%", "")) >= 41 &&
        Number(link.data[3].replace("%", "")) >= 41
    )
    .map((link) => ({
      niceName: link.data[0] + " vs " + link.data[1],
      href: link.href,
      eventTicker: link.href.split("/").pop().toUpperCase(),
      players: [
        {
          name: link.data[0],
          percentChanceWin: Number(link.data[2].replace("%", "")),
        },
        {
          name: link.data[1],
          percentChanceWin: Number(link.data[3].replace("%", "")),
        },
      ],
    }));

  console.log(" └─ Closing page...");
  await page.close();

  console.log(
    "Upcoming matches that are close:",
    validMatches.map(
      (m) =>
        `${m.niceName} (${m.eventTicker}) - ${m.players[0].name}: ${m.players[0].percentChanceWin}% / ${m.players[1].name}: ${m.players[1].percentChanceWin}%`
    )
  );

  //request logs from file
  const ordersLogs = fs.readFileSync("logs/orders.log", "utf8");

  for (const match of validMatches) {
    if (ordersLogs.includes(match.eventTicker)) {
      console.log(`Skipping ${match.eventTicker}, already processed.`);
      continue;
    }

    const matchPlayerUnderdog =
      match.players[0].percentChanceWin < match.players[1].percentChanceWin
        ? match.players[0]
        : match.players[1];

    console.log(
      `Checking match: ${match.players[0].name} vs ${match.players[1].name}`
    );
    console.log(
      ` └─ Underdog: ${matchPlayerUnderdog.name} (${matchPlayerUnderdog.percentChanceWin}%)`
    );
    console.log(` └─ Fetching event data for ${match.eventTicker}...`);

    const [eventData, eventError] = await getEvent(match.eventTicker);

    if (eventError) {
      console.log(
        `Error fetching event ${match.eventTicker}: ${eventError.message}`
      );
      continue;
    }

    if (!eventData?.markets?.[0]?.rules_primary.includes("tennis")) {
      console.log(`Skipping ${match.eventTicker}, not a tennis match.`);
      logger(`errors`, { eventTicker: match.eventTicker, label: "not tennis" });
      continue;
    }

    if (eventData?.markets?.length !== 2) {
      logger("errors", {
        eventTicker: match.eventTicker,
        marketLength: eventData?.markets?.length,
        message: `Unexpected market length for ${match.eventTicker}: ${eventData?.markets?.length}`,
      });
      continue;
    }

    const market = eventData.markets.find((mkt) =>
      mkt.yes_sub_title.includes(matchPlayerUnderdog.name)
    );

    if (!market) {
      logger("errors", {
        eventTicker: match.eventTicker,
        underdogName: matchPlayerUnderdog.name,
        message: `Could not find market for underdog ${matchPlayerUnderdog.name} in event ${match.eventTicker}`,
      });
      continue;
    }

    if (market.volume < 5000) {
      console.log(
        ` └─ Skipping ${match.eventTicker}, volume too low: ${market.volume}`
      );
      continue;
    }

    // first buy a contract at max 51 cents
    console.log(
      ` └─ Placing order to buy 1 contract for ${eventData.event.title}(${market.ticker})...`
    );

    const [buyData, buyError] = await order({
      ticker: market.ticker,
      type: "market",
      action: "buy",
      side: "yes",
      count: contractCount,
      yes_price: 50, // max price in cents
      client_order_id: "swing-buy",
    });

    console.log(" └─ Placed buy order:", buyData, buyError);

    logger("orders", {
      type: "buy",
      eventTitle: eventData.event.title,
      market: market.ticker,
      buyData,
    });

    await delay(2000); // wait for 2 seconds

    if (buyError) {
      console.log("ERROR: Order was not filled, skipping further actions.");
      continue;
    }

    // Now place a sell limit order at 58 cents
    const [sellData, sellError] = await order({
      ticker: market.ticker,
      type: "limit",
      action: "sell",
      side: "yes",
      count: contractCount,
      yes_price: 58,
      sell_position_capped: true,
      post_only: true,
      client_order_id: "swing-sell",
    });

    logger("orders", {
      type: "sell",
      eventTitle: eventData.event.title,
      market: market.ticker,
      sellData,
    });

    console.log(" └─  Placed sell order:", sellData, sellError);

    if (sellError) {
      console.log(" └─  Sell order was not filled.");
    }

    betsMade.push({
      eventTicker: match.eventTicker,
      marketTicker: market.ticker,
      eventTitle: eventData.event.title,
    });

    break; //RUN ONE MATCH - LOOP will handle the rest in next cycle
  }

  console.log("");

  console.log(
    `---- ${betsMade.length} bets made: `,
    betsMade.map(
      (b) => `${b.eventTitle} (${b.eventTicker}) - ${b.marketTicker}`
    )
  );
  console.log("----------------------------------------");
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

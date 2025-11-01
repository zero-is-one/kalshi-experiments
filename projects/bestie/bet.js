import fs from "fs";
import axios from "axios";
import { to } from "await-to-js";
import { delay } from "../../helpers/delay.js";
import { red, blue, yellow, green } from "ansis";
import { logger, getLogAsString } from "../../helpers/logger/index.js";
import { order } from "../../helpers/kalshi-api/index.js";

const apiUrl = "https://api.elections.kalshi.com/v1";
const fetchDelayMs = 200;
const maxBetsPerRun = 4;

async function main(isInitialRun = true) {
  console.log("\n----------------------------------------\n");

  let remainingBetsThisSession = maxBetsPerRun;
  const sessionOrders = [];

  const users = JSON.parse(fs.readFileSync("userPerformanceScores.json"));
  console.log(`Total users to process: ${users.length}`);

  const marketHoldingsById = {};

  for (const [index, user] of users.entries()) {
    const nickname = user.nickname;
    console.log(`Fetching holdings for user: ${nickname}`);

    const url = `${apiUrl}/social/profile/holdings?nickname=${nickname}&limit=99&closed_positions=false`;
    console.log(
      `* Fetching holdings ${nickname} (${index}/${
        users.length
      }): ${url.replace(apiUrl, "")}`
    );

    await delay(fetchDelayMs);
    const [err, response] = await to(axios.get(url));

    if (err) {
      console.log(
        red`(!) Error fetching data for user ${nickname}:`,
        err.message
      );
      continue;
    }

    const holdings = response?.data?.holdings || [];

    const ordersLog = getLogAsString("orders") || "";

    for (const holding of holdings) {
      if (ordersLog.includes(holding.event_ticker)) {
        process.stdout.write(yellow`${holding.event_ticker}, skipping. `);
        continue;
      }

      const marketHoldings = holding?.market_holdings || [];
      for (const marketHolding of marketHoldings) {
        const side = marketHolding.signed_open_position > 0 ? "yes" : "no";
        const id = marketHolding.market_id + "-" + side;

        if (!marketHoldingsById[id]) {
          marketHoldingsById[id] = {
            id,
            marketId: marketHolding.market_id,
            marketTicker: marketHolding.market_ticker,
            side: marketHolding.signed_open_position > 0 ? "yes" : "no",
            eventTicker: holding.event_ticker,
            seriesTicker: holding.series_ticker,
            users: [],
          };
        }

        marketHoldingsById[id].users.push({
          nickname,
          performanceScore: user.score,
          contracts: Math.abs(marketHolding.signed_open_position),
          pnl: marketHolding.pnl,
        });
      }
    }
    console.log(""); // new line after user holdings
  }

  const marketHoldings = Object.values(marketHoldingsById)
    .map((mh) => {
      return {
        ...mh,
        betScore: getBetScore(mh.users),
      };
    })
    .sort((a, b) => b.betScore - a.betScore);

  console.log(
    `Found holdings in ${marketHoldings.length} unique markets to bet.`
  );

  fs.writeFileSync(
    "marketHoldings.json",
    JSON.stringify(marketHoldings, null, 2)
  );

  for (const mh of marketHoldings) {
    console.log(
      `Market ${mh.marketTicker} (${
        mh.side
      }) - Bet Score: ${mh.betScore.toFixed(4)}`
    );

    if (mh.betScore < 50) {
      console.log(blue`(-) Skipping low bet score market: ${mh.marketTicker}`);
      continue;
    }

    remainingBetsThisSession--;
    if (remainingBetsThisSession <= 0) {
      console.log(
        yellow`(!) Reached max bets for this run (${maxBetsPerRun}). Exiting.`
      );
      break;
    }

    logger("orders", mh);

    if (isInitialRun) {
      console.log(
        yellow`(!) Initial run - skipping order placement for market: ${mh.marketTicker}, event: ${mh.eventTicker}`
      );
      await delay(fetchDelayMs);
      continue;
    }

    await delay(fetchDelayMs);
    const [error, response] = await to(
      order({
        ticker: mh.marketTicker,
        type: "market",
        action: "buy",
        side: mh.side,
        count: 1, // number of contracts
        [`${mh.side}_price`]: 92, // max price in cents
        client_order_id: `bestie-${Date.now()}`,
        time_in_force: "FOK", // Fill or Kill
      })
    );

    sessionOrders.push({
      marketTicker: mh.marketTicker,
      side: mh.side,
      error,
      orderResult: response?.data || null,
      timestamp: new Date().toLocaleString("en-US", {
        timeZone: "America/New_York",
      }),
    });

    if (error) {
      console.log(red`(!) Error placing order:`, error.message);
      logger("errors", {
        error: error.message,
        ...mh,
      });

      logger("orders", {
        orderError: error.message,
      });

      continue;
    }

    console.log(
      green`(+) Placed order for market ${mh.marketTicker}:${mh.side}`,
      response.data
    );
  }

  console.log("Session Orders Summary:");
  if (sessionOrders.length === 0) {
    console.log(
      `No orders placed this session. ${
        isInitialRun ? "Initial run, so no orders were placed." : ""
      }`
    );
  } else {
    for (const order of sessionOrders) {
      console.log(
        `- ${order.timestamp} Market: ${order.marketTicker}, Side: ${
          order.side
        }, Result: ${order.error ? red("Error") : green("Success")}`
      );
    }
  }

  console.log(
    `Bestie run complete at ${new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
    })}`
  );
}

main();

setInterval(() => {
  main(false);
}, 5 * 60 * 1000); // every 5 minutes

function getBetScore(bettors) {
  if (!bettors || bettors.length === 0) return 0;

  // Skill-weighted confidence
  const weightedConfidence = bettors.map(
    (b) => b.contracts * Math.max(b.performanceScore, 0)
  );

  const totalWeight = weightedConfidence.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return 0;

  const weightedSkill = bettors.reduce(
    (sum, b, i) => sum + b.performanceScore * weightedConfidence[i],
    0
  );

  return weightedSkill / totalWeight;
}

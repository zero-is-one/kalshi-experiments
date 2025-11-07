import fs from "fs";
import { to } from "await-to-js";
import { delay, getFormattedDateTime } from "../../helpers/funcs.js";
import { red, blue, yellow, green } from "ansis";
import { logger, getLogAsString } from "../../helpers/logger/index.js";
import { order } from "../../helpers/kalshi-api/index.js";
import { getUserSkillScores } from "./getUserSkillScores.js";
import { getUserActivePositions } from "./getUserPositions.js";

const MIN_USERS_HOLDING_POSITION = 2;
const CONTRACT_COUNT = 1;
const RUN_EVERY_MINUTES = 5;

const sessionOrdersLog = [];

async function main(
  config = {
    isInitialRun: true,
  }
) {
  const isInitialRun = config?.isInitialRun ?? true;

  console.log("\n----------------------------------------\n");

  const userSkillScores = getUserSkillScores();

  console.log(`Loaded skill scores for ${userSkillScores.length} users.`);
  console.log("Fetching user positions...");
  // make a store for position Id and the nicknames of the users holding them
  const positionsMap = {};

  for (const user of userSkillScores) {
    const nickname = user.nickname;

    const positions = await getUserActivePositions(nickname);

    for (const position of positions) {
      if (!positionsMap[position.id]) {
        positionsMap[position.id] = { position, holders: [] };
      }
      positionsMap[position.id].holders.push(nickname);
    }

    process.stdout.write(`${nickname} (${positions.length}), `);
  }
  console.log("DONE!");

  const positions = Object.values(positionsMap)
    .map((entry) => ({
      ...entry,
      totalSkillScore: entry.holders.reduce((sum, nick) => {
        const user = userSkillScores.find((u) => u.nickname === nick);
        return sum + (user ? user.skillScore : 0);
      }, 0),
    }))
    .sort((a, b) => b.holders.length - a.holders.length)
    .filter((entry) => entry.holders.length >= MIN_USERS_HOLDING_POSITION);

  console.log(
    green(
      `Found ${positions.length} positions held by at least ${MIN_USERS_HOLDING_POSITION} users.`
    )
  );

  // save to file for logging
  fs.writeFileSync("bestieBetStats.json", JSON.stringify(positions, null, 2));

  const ordersLogString = getLogAsString("orders");
  for (const entry of positions) {
    const { position } = entry;

    if (ordersLogString.includes(position.id)) {
      console.log(
        yellow(`Already placed order for position ${position.id}, skipping.`)
      );
      continue;
    }

    if (isInitialRun) {
      console.log(
        yellow(`Initial run - logging position without action: ${position.id}`)
      );
      logger("orders", { isInitialRun: true, position });
      continue;
    }

    await delay(200);
    const orderConfig = {
      ticker: position.market_ticker,
      type: "market",
      action: "buy",
      side: position.side,
      count: CONTRACT_COUNT,
      [`${position.side}_price`]: 95,
      client_order_id: `bestie-rank-${Date.now()}`,
    };
    const [orderError, orderResult] = await to(order(orderConfig));

    logger("orders", {
      error: orderError?.message,
      orderResult,
      orderConfig,
      position,
      entry,
    });

    console.log("Bettering on position:", position.id);

    const timestamp = getFormattedDateTime();

    if (orderError) {
      sessionOrdersLog.push(
        `${timestamp} - (!) Error placing order for position ${position.id} - ${position.market_ticker}: ${orderError.message}`
      );
    } else {
      sessionOrdersLog.push(
        `${timestamp} - Order placed successfully for position ${position.id}  - ${position.market_ticker}`
      );
    }
  }

  if (sessionOrdersLog.length > 0) {
    console.log("\nSession Orders Summary:");
    sessionOrdersLog.forEach((log) => console.log(log));
  } else {
    console.log("No new orders placed in this run.");
  }
  console.log(`Bestie bet run complete. [${getFormattedDateTime()}]`);
}

main();
setInterval(async () => {
  try {
    await main({ isInitialRun: false });
  } catch (error) {
    console.error(`Error in main loop: ${error.message}`);
  }
}, RUN_EVERY_MINUTES * 60 * 1000);

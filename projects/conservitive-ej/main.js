import {
  getUserActivePositions,
  getPastUserPositions,
} from "./getUserPositions.js";
import { to } from "await-to-js";
import { order } from "../../helpers/kalshi-api/index.js";
import { delay, getFormattedDateTime } from "../../helpers/funcs.js";
import { logger } from "../../helpers/logger/index.js";

const MAX_BET = 5;
const NICKNAME = "EJG7";
const sessionLog = [];

console.log("Starting ej-conservative bot...");

// Fetch positions so that initial positions state is logged,
// we only want new positions to be processed
const [err] = await to(getUserActivePositions(NICKNAME));
if (err) {
  console.error("Error initializing fetching positions:", err.message);
  process.exit(1);
}

async function main() {
  const pastPositions = getPastUserPositions(NICKNAME);

  const userMaxContractsPerBet = pastPositions.reduce((max, pos) => {
    return Math.max(max, pos.total_absolute_position);
  }, 0);

  const [err, positions] = await to(getUserActivePositions(NICKNAME));

  if (err) {
    console.error("Error fetching positions:", err.message);
    return;
  }
  console.log(`-Consertive-ej----------------------------------------------`);
  console.log(`Processing Positions....`);

  for (const position of positions) {
    const hasBet = pastPositions.some((p) => p.id === position.id);

    const positionNicename = `${position.event_ticker} (${position.side})`;

    console.log(
      `Evaluating position: ${positionNicename} with ${position.total_absolute_position} contracts.`
    );

    if (hasBet) {
      console.log(
        `--> Already have a bet on position ${positionNicename}, skipping...`
      );
      continue;
    }

    const contractOrderCount = Math.round(
      (position.total_absolute_position / userMaxContractsPerBet) * MAX_BET
    );

    if (contractOrderCount < 1) {
      console.log(
        `--> Calculated contract order amount ${contractOrderCount} is less than 1 for position ${position.id}, skipping...`
      );
      continue;
    }

    await delay(200);
    const buyOrder = {
      type: "market",
      time_in_force: "fill_or_kill",
      ticker: position.market_ticker,
      action: "buy",
      side: position.side,
      count: contractOrderCount,
      [`${position.side}_price`]: 95,
      client_order_id: `con-ej-buy-${Date.now()}`,
    };
    const [buyError, buyResult] = await to(order(buyOrder));

    logger("orders", {
      type: "buy",
      position: positionNicename,
      buyOrder,
      buyResult,
      error: buyError?.message,
    });

    if (buyError) {
      console.error(
        `(!) Error placing order for position ${positionNicename}:`,
        buyError.message,
        buyOrder
      );

      sessionLog.push(`Error ${positionNicename}`, buyError.message);
      continue;
    }

    if (
      buyResult.order.fill_count !== contractOrderCount ||
      buyResult.order.status !== "executed"
    ) {
      console.error(
        `(!) Error, Odd filling for order for position ${positionNicename}:`,
        buyResult
      );

      sessionLog.push(`Error odd fill ${positionNicename}`, buyResult);
      continue;
    }

    console.log(
      `--> Successfully placed buy order for position ${positionNicename} for ${contractOrderCount} contracts.`
    );

    const fillCostPerContract = buyResult.order.taker_fill_cost;

    const sellOrder = {
      ticker: position.market_ticker,
      type: "limit",
      action: "sell",
      side: position.side,
      count: contractOrderCount,
      [`${position.side}_price`]: Math.min(99, fillCostPerContract + 15), // sell at 15 cents profit, capped at 99
      sell_position_capped: true,
      post_only: true,
      client_order_id: `con-ej-sell-${Date.now()}`,
    };

    const [sellError, sellResult] = await to(order(sellOrder));

    logger("orders", {
      type: "sell",
      position: positionNicename,
      sellOrder,
      sellResult,
      error: sellError?.message,
    });

    if (sellError) {
      console.error(
        `(!) Error placing sell order for position ${positionNicename}:`,
        sellError.message,
        sellOrder
      );

      sessionLog.push(`Error ${positionNicename}`, sellError.message);
      continue;
    }

    console.log(
      `--> Successfully placed sell orders for position ${positionNicename}.`
    );

    sessionLog.push(
      `Successfully placed buy and sell orders for ${positionNicename}.`
    );
  }
  if (sessionLog.length > 0) {
    console.log("\nSession Summary:");
    sessionLog.forEach((log) => console.log(log));
  } else {
    console.log("No new orders placed in this run.");
  }
  console.log(`ej-conservative bot run complete. [${getFormattedDateTime()}]`);
}

setInterval(async () => {
  try {
    await main();
  } catch (error) {
    console.error("Error in main loop:", error.message);
  }
}, 5 * 60 * 1000); // run every 5 minutes

main();

// position example:
//   {
//     "market_id": "19840cb7-8c4b-4deb-a46e-60aa864b96d3",
//     "market_ticker": "KXUSDTMIN-25DEC31-0.95",
//     "signed_open_position": -4187,
//     "pnl": 445000,
//     "event_ticker": "KXUSDTMIN-25DEC31",
//     "series_ticker": "KXUSDTMIN",
//     "total_absolute_position": 4187,
//     "fetchedAt": "2025-11-03T10:02:06.401Z",
//     "side": "no",
//     "id": "19840cb7-8c4b-4deb-a46e-60aa864b96d3:no"
//   },

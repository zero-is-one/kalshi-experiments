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
const invoices = [];

console.log("Starting ej-conservative bot V3...");

// Fetch positions so that initial positions state is logged,
// we only want new positions to be processed
const [err, initialPositions] = await to(getUserActivePositions(NICKNAME));

if (err) {
  console.error("Error initializing fetching positions:", err.message);
  process.exit(1);
}

const maxContractsPerOrder = initialPositions.reduce((max, pos) => {
  return Math.max(max, pos.total_absolute_position);
}, 0);

async function main() {
  console.log(`========== New Run [${getFormattedDateTime()}] ==========`);
  const [err, positions] = await to(getUserActivePositions(NICKNAME));

  if (err) {
    console.error("(!) Error fetching positions:", err.message);
    sessionLog.push(`Error fetching positions ${err.message}`);
    return;
  }

  console.log(`Found ${positions.length} active positions...`);

  for (const position of positions) {
    const positionNicename = `${position.event_ticker} (${position.side})`;
    console.log(
      `Evaluating position: ${positionNicename} with ${position.total_absolute_position} contracts.`
    );

    if (initialPositions.some((p) => p.id === position.id)) {
      console.log(
        `--> Position ${positionNicename} existed at start, skipping...`
      );
      continue;
    }

    let contractOrderCount = Math.round(
      (position.total_absolute_position / maxContractsPerOrder) * MAX_BET
    );

    if (contractOrderCount < 1) {
      console.log(
        `--> Calculated contract order amount ${contractOrderCount} is less than 1 for position ${position.id}, skipping...`
      );
      continue;
    }

    const previousInvoice = invoices.find(
      (inv) => inv.position.id === position.id
    );

    if (previousInvoice) {
      console.log(
        `--> Already have an invoice for position ${positionNicename}`
      );

      const contractOrderDiff =
        contractOrderCount - previousInvoice.contractOrderCount;

      if (contractOrderDiff > 0) {
        contractOrderCount = contractOrderDiff;
        previousInvoice.contractOrderCount += contractOrderDiff;
        console.log(
          `--> Increasing contract order count by ${contractOrderDiff} to ${contractOrderCount} for position ${positionNicename}`
        );
        sessionLog.push(
          `Increasing order for ${positionNicename} by ${contractOrderDiff} to ${contractOrderCount} contracts.`
        );
      } else {
        console.log(
          `--> No difference in contract order count for position ${positionNicename}, skipping...`
        );
        continue;
      }
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

      sessionLog.push(`Error ${positionNicename}: ${buyError.message}`);
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

    sessionLog.push(
      `Successfully placed buy order for ${positionNicename} for ${contractOrderCount} contracts.`
    );

    if (!previousInvoice) {
      invoices.push({
        position: { id: position.id, ...position },
        contractOrderCount,
      });
    }
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
}, 2 * 60 * 1000); // run every 2 minutes

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

import fs from "fs";
import axios from "axios";
import { to } from "await-to-js";
import { delay, getFormattedDateTime } from "../../helpers/funcs.js";
import { logger, getLogAsString } from "../../helpers/logger/index.js";
import { order } from "../../helpers/kalshi-api/index.js";
import { green } from "ansis";

const ALLOW_ORDERS = true;
const MAX_CONTRACTS = 5;

const sessionLog = [];

const main = async (isInitialRun = true) => {
  console.log("----------------------------------------");

  const [err, response] = await to(
    axios.get(
      "https://api.elections.kalshi.com/v1/social/trades?nickname=counsel777&page_size=99"
    )
  );

  if (err) {
    console.error(`Error fetching follower data: ${err.message}`);
    return;
  }

  const trades = response?.data?.trades || [];

  if (trades.length === 0) {
    console.log("No trades found for counsel777.");
    return;
  }

  // get min max counts
  const minContractCount = Math.min(...trades.map((trade) => trade.count));
  const maxContractCount = Math.max(...trades.map((trade) => trade.count));

  console.log(`Fetched ${trades.length} trades for counsel777.`);
  console.log(
    `Min contract count: ${minContractCount}, Max contract count: ${maxContractCount}`
  );

  const tradeLogs = getLogAsString("counsel777Trades");

  for (const trade of trades) {
    if (tradeLogs.includes(trade.trade_id)) {
      console.log(`Skipping already logged trade: ${trade.trade_id}`);
      continue;
    }

    logger("counsel777Trades", trade);

    if (isInitialRun) {
      console.log(
        `Initial run - logging trade without action: ${trade.trade_id}`
      );
      continue;
    }

    // Calculate contract count based on trade size relative to min/max range
    const tradeRange = maxContractCount - minContractCount;
    const tradePosition = trade.count - minContractCount;
    const normalizedRatio = tradePosition / tradeRange;
    const scaledCount = normalizedRatio * MAX_CONTRACTS;
    const contractCount = Math.min(
      MAX_CONTRACTS,
      Math.max(0, Math.round(scaledCount))
    );

    if (contractCount === 0) {
      console.log(
        `Calculated contract count is 0 for trade ${trade.trade_id}, skipping order placement.`
      );
      continue;
    }

    console.log(
      `Placing order for trade ${trade.trade_id} on market ${trade.ticker} for ${contractCount} contracts.`
    );

    if (!ALLOW_ORDERS) {
      console.log(`Buys are disabled. Skipping order placement.`);
      continue;
    }

    // const exampleTrade = {
    //   trade_id: "a7548e41-ae1c-7ad9-18c9-fd6c1e7af146",
    //   market_id: "f79eec80-a60c-478a-91c3-bac60d343bc9",
    //   ticker: "KXSUPERLIGGAME-25OCT31BASKOC-KOC",
    //   price: 24,
    //   price_dollars: "0.2400",
    //   count: 132,
    //   taker_side: "yes",
    //   maker_action: "buy",
    //   taker_action: "buy",
    //   maker_nickname: "",
    //   taker_nickname: "counsel777",
    //   maker_social_id: "",
    //   taker_social_id: "17e5653c-659d-ddb7-a1ff-efd8a1787dc4",
    //   create_date: "2025-10-31T18:19:10.720199Z",
    // };

    await delay(200);
    const [orderResult, orderError] = await order({
      ticker: trade.ticker,
      type: "market",
      action: trade.taker_action,
      side: trade.taker_side,
      count: contractCount,
      [`${trade.taker_side}_price`]:
        trade.taker_action === "buy" ? 90 : trade.price - 5,
      client_order_id: `council-${Date.now()}`,
    });

    logger("orders", {
      timestamp: getFormattedDateTime(),
      error: orderError?.message,
      orderResult,
      trade,
    });

    sessionLog.push(
      orderError
        ? `(!) Error placing order for trade ${trade.trade_id}: ${orderError.message}`
        : `Order placed successfully for trade ${trade.trade_id}`
    );

    console.log(sessionLog.at(-1));
  }

  if (sessionLog.length > 0) {
    console.log("\nSession Summary:");
    sessionLog.forEach((log) => console.log(log));
  } else {
    console.log("No new trades processed in this run.");
  }
  console.log(`counsel777 follower run complete. [${getFormattedDateTime()}]`);
};

setInterval(() => {
  main(false);
}, 5 * 60 * 1000); // every 5 minutes

main();

// import fs from "fs";
// import { delay } from "../../helpers/delay.js";
// import { logger, getLogAsString } from "../../helpers/logger/index.js";
// import { order, getAccountBalance } from "../../helpers/kalshi-api/index.js";

// const orders = [];

// const userData = JSON.parse(fs.readFileSync("userMetrics.json", "utf-8"));

// console.log(
//   `Loaded metrics for ${userData.users.length} users from userMetrics.json`
// );

// const users = userData.users
//   .filter((user) => user?.metrics?.pnl > 0)
//   .filter((user) => user?.holdings && user.holdings.length > 0)
//   .filter((user) => user?.metrics?.num_markets_traded >= 200);

// console.log(
//   `Filtered to ${users.length} users with positive PnL, holdings and at least 200 predictions.`
// );

// // sort by pnl weighted by the number of predictions made
// // users that are more consistently right should rank higher than those with a few lucky big wins
// users.sort((a, b) => {
//   const aScore = a.metrics.pnl * Math.log1p(a.metrics.num_markets_traded);
//   const bScore = b.metrics.pnl * Math.log1p(b.metrics.num_markets_traded);
//   return bScore - aScore;
// });

// console.log("Top 20 Users:");
// users.slice(0, 20).forEach((user, index) => {
//   console.log(
//     `${index + 1}. ${user.nickname} - PnL: ${user.metrics.pnl}, Holdings: ${
//       user.holdings.length
//     }, Predictions: ${user.metrics.num_markets_traded}`
//   );
// });

// async function main() {
//   const [balanceData, error] = await getAccountBalance();
//   console.log("Current Account Balance:", balanceData.balance);
//   if (error) {
//     console.error("(!) Error fetching account balance:", error);
//     return;
//   }

//   if (balanceData.balance < 200) {
//     console.log("Insufficient balance to place orders. Exiting.");
//     return;
//   }

//   const userHoldings = [];
//   for (const user of users) {
//     const nickname = user.nickname;
//     console.log(`Fetching holdings for user: ${nickname}`);
//     let holdingsData;
//     try {
//       const holdingsUrl = `https://api.elections.kalshi.com/v1/social/profile/holdings?nickname=${nickname}&limit=20&closed_positions=false`;
//       const response = await fetch(holdingsUrl);
//       holdingsData = await response.json();
//     } catch (e) {
//       console.error(`(!) Error fetching holdings for user ${nickname}:`, e);
//     }

//     holdingsData.nickname = nickname;
//     holdingsData.createdAt = new Date().toISOString();
//     userHoldings.push(holdingsData);
//     await delay(100);
//   }

//   // go through each holdings and see how many users have positions in the same market

//   const markets = {};

//   for (const user of userHoldings) {
//     for (const eventHolding of user?.holdings || []) {
//       for (const marketHolding of eventHolding?.market_holdings) {
//         // const example = {
//         //   market_id: "bd0cf263-d8df-40ac-a9e0-ed51845f2cc3",
//         //   market_ticker: "KXMOVVALTAG-25NOV04-VAAG",
//         //   signed_open_position: -400,   // negative means No and positive means Yes
//         //   pnl: 40000, //  40000/10000 = $4 profit
//         // };
//         const side = marketHolding.signed_open_position > 0 ? "yes" : "no";
//         const id = marketHolding.market_id + "-" + side;

//         if (!markets[id]) {
//           markets[id] = {
//             id,
//             side,
//             users: [],
//             marketHolding,
//             eventHolding,
//           };
//         }

//         markets[id].users.push(user.nickname);
//       }
//     }
//   }

//   // sort markets by number of users holding positions
//   const sortedMarkets = Object.values(markets).sort((a, b) => {
//     return b.users.length - a.users.length;
//   });

//   console.log("Top 10 Markets by Number of Users Holding Positions:");
//   sortedMarkets.slice(0, 10).forEach((market, index) => {
//     console.log(
//       `${index + 1}. Market ID: ${
//         market.marketHolding.market_ticker
//       }, Users Holding: ${market.users.length}, Event Ticker: ${
//         market.eventHolding.event_ticker
//       }, side: ${market.side}`
//     );
//   });

//   fs.writeFileSync(
//     "userHoldingsAnalysis.json",
//     JSON.stringify(
//       { createdAt: new Date().toISOString(), markets: sortedMarkets },
//       null,
//       2
//     )
//   );

//   // filter markets to only those with at least 2 users holding positions
//   const filteredMarkets = sortedMarkets.filter(
//     (market) => market.users.length >= 2
//   );
//   fs.writeFileSync(
//     "filteredUserHoldingsAnalysis.json",
//     JSON.stringify(
//       { createdAt: new Date().toISOString(), markets: filteredMarkets },
//       null,
//       2
//     )
//   );
//   console.log(
//     `Found ${filteredMarkets.length} markets with at least 2 users holding positions. Data saved to filteredUserHoldingsAnalysis.json`
//   );

//   const eventsLog = getLogAsString("orders") || "";

//   for (const market of filteredMarkets) {
//     console.log(
//       `Market ${market.marketHolding.market_ticker}:${
//         market.side
//       } held by users: ${market.users.join(", ")}`
//     );

//     if (eventsLog.includes(market.id)) {
//       console.log(
//         `└─ Already placed order, skipping. ${market.marketHolding.market_ticker}`
//       );
//       continue;
//     }

//     const contractCount = 1;

//     console.log(
//       `└─ Placing order for ${contractCount} contracts on '${market.marketHolding.market_ticker}':${market.side}`
//     );

//     // Place order logic would go here
//     const [orderResult, orderError] = await order({
//       ticker: market.marketHolding.market_ticker,
//       type: "market",
//       action: "buy",
//       side: market.side,
//       count: contractCount,
//       [`${market.side}_price`]: 90, // max price in cents
//       client_order_id: `bestie-${Date.now()}`,
//     });

//     logger("orders", {
//       id: market.id,
//       ticker: market.marketHolding.market_ticker,
//       side: market.side,
//       contracts: contractCount,
//       orderResult,
//       orderError: orderError?.message,
//     });

//     orders.push({
//       id: market.id,
//       ticker: market.marketHolding.market_ticker,
//       side: market.side,
//       contracts: contractCount,
//       orderResult,
//       orderError: orderError?.message,
//       timestamp: new Date().toISOString(),
//     });

//     if (orderError) {
//       console.error(
//         `(!) Error placing order for market ${market.marketHolding.market_ticker}:`,
//         orderError
//       );
//     } else {
//       console.log(
//         `└─ Order placed successfully for market ${market.marketHolding.market_ticker}:`,
//         orderResult
//       );
//     }

//     await delay(500);
//   }

//   console.log("Bestie run complete. Placed Orders Summary:");
//   if (orders.length === 0) {
//     console.log("No orders placed.");
//   }
//   console.log(
//     orders
//       .map(
//         (o) =>
//           `${new Date(o.timestamp).toLocaleString("en-US", {
//             timeZone: "America/New_York",
//           })} EST - ${o.ticker}:${o.side} - ${
//             o.orderError ? "Failed" : "Success"
//           }`
//       )
//       .join("\n")
//   );
//   console.log(
//     "=====================================",
//     new Date().toLocaleString("en-US", {
//       timeZone: "America/New_York",
//     }) + " EST"
//   );
// }

// main();
// setInterval(() => {
//   main();
// }, 1000 * 60 * 5); // every 5 minutes

// https://api.elections.kalshi.com/v1/social/profile/metrics?nickname=EJG7&since_day_before=0

import fs from "fs";
import { delay } from "../../helpers/delay.js";

async function main() {
  const rawData = fs.readFileSync("users.json");
  console.log("Reading users.json file...");
  const parsedData = JSON.parse(rawData);
  const users = parsedData.users;
  console.log(`Total users to process: ${users.length}`);

  const userMetrics = [];
  let counter = 0;

  for (const user of users) {
    const nickname = user.nickname;
    const url = `https://api.elections.kalshi.com/v1/social/profile/metrics?nickname=${nickname}&since_day_before=0`;
    console.log(
      `${counter++}: Fetching metrics for user: ${nickname} from URL: ${url}`
    );

    let metricsData;
    try {
      const response = await fetch(url);
      metricsData = await response.json();
    } catch (e) {
      console.error(`(!) Error fetching data for user ${nickname}:`, e);
      continue;
    }

    if (!metricsData?.metrics) {
      console.log(`(!) No data found for user ${nickname}.`);
      continue;
    }

    let holdingsData;
    try {
      const holdingsUrl = `https://api.elections.kalshi.com/v1/social/profile/holdings?nickname=${nickname}&limit=20&closed_positions=false`;
      const response = await fetch(holdingsUrl);
      holdingsData = await response.json();
    } catch (e) {
      console.error(`(!) Error fetching holdings for user ${nickname}:`, e);
    }

    userMetrics.push({
      nickname,
      metrics: metricsData.metrics,
      holdings: holdingsData.holdings,
    });

    await delay(100);
  }

  fs.writeFileSync(
    "userMetrics.json",
    JSON.stringify(
      { createdAt: new Date().toISOString(), users: userMetrics },
      null,
      2
    )
  );

  console.log("User metrics data saved to userMetrics.json");
}

main();

// https://api.elections.kalshi.com/v1/social/profile/metrics?nickname=EJG7&since_day_before=0

import fs from "fs";
import { delay } from "../../helpers/delay.js";
import axios from "axios";
import { to } from "await-to-js";
import { red, blue, yellow, green } from "ansis";

const apiUrl = "https://api.elections.kalshi.com/v1";
const fetchDelayMs = 200;

async function main() {
  const usersNicknames = JSON.parse(fs.readFileSync("usersWithHoldings.json"));

  console.log(`Total users to process: ${usersNicknames.length}`);
  const usersMetrics = [];

  for (const [index, nickname] of usersNicknames.entries()) {
    // To avoid rate limiting
    const url = `${apiUrl}/social/profile/metrics?nickname=${nickname}&since_day_before=0`;
    console.log(
      `* Fetching metrics ${nickname} (${index}/${
        usersNicknames.length
      }): ${url.replace("apiUrl", "")}`
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

    const metricsData = response?.data?.metrics;

    if (!metricsData) {
      console.log(
        red`(!) No metrics data found for user ${nickname}. Skipping.`
      );
      continue;
    }

    usersMetrics.push({ nickname, ...metricsData });
  }

  fs.writeFileSync("userMetrics.json", JSON.stringify(usersMetrics, null, 2));
}

main();

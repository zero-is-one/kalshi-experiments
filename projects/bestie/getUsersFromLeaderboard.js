// https://api.elections.kalshi.com/v1/social/profile/holdings?nickname=EJG7&limit=20&closed_positions=false

// https://api.elections.kalshi.com/v1/social/profile?nickname=EJG7

import fs from "fs";
import { delay } from "../../helpers/delay.js";

const timeFrames = [0, 1, 3, 7, 15, 29, 60, 89, 99];

// In Kalsh Api this metric naming convention:
// volume = Volume
// projected_pnl = Profit
// num_markets_traded = Predictions
const metricNames = ["volume", "projected_pnl", "num_markets_traded"];

const categories = [
  null,
  "Politics",
  "Sports",
  "Entertainment", // this is "Culture" in the UI
  "Crypto",
  "Climate+and+Weather", // this is "Climate" in the UI
  "Economics",
  "Mentions",
  "Companies",
  "Financials",
  "Science+and+Technology",
  "Health",
  "World",
  "Elections",
];

async function main() {
  const urls = generateLeaderboardUrlPermutations();
  console.log(`Generated ${urls.length} requests for leaderboard data.`);

  const rankList = [];

  for (const url of urls) {
    console.log("Fetching Leaderboard Data:", url);

    let data;

    try {
      const response = await fetch(url);
      data = await response.json();
    } catch (e) {
      console.error("(!) Error fetching data:", e);
      continue;
    }

    if (!data?.rank_list || data.rank_list.length === 0) {
      console.log("(!) No rank_list found or it's empty.");
      continue;
    }

    rankList.push(...data.rank_list);

    await delay(1000);
  }

  const uniqueRankList = Array.from(
    new Set(rankList.map((entry) => entry.nickname))
  ).map((nickname) => rankList.find((entry) => entry.nickname === nickname));

  console.log("Total entries fetched:", rankList.length);
  console.log("Unique entries collected:", uniqueRankList.length);

  uniqueRankList
    .slice(0, 5)
    .forEach((entry) => console.log("Sample Data:", JSON.stringify(entry)));

  // save to file
  const data = {
    createdAt: new Date().toISOString(),
    users: uniqueRankList,
  };

  fs.writeFileSync("users.json", JSON.stringify(data, null, 2));
  console.log("User data saved to users.json");
}

main();

function generateLeaderboardUrlPermutations() {
  const apiUrl = "https://api.elections.kalshi.com/v1/social/leaderboard";
  const urls = [];

  for (const timeFrame of timeFrames) {
    for (const metricName of metricNames) {
      for (const category of categories) {
        const url = `${apiUrl}?metric_name=${metricName}&limit=100&since_day_before=${timeFrame}${
          category ? `&category=${category}` : ""
        }`;

        urls.push(url);
      }
    }
  }

  return urls;
}

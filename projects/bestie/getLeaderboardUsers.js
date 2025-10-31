import fs from "fs";
import { delay } from "../../helpers/delay.js";
import axios from "axios";
import { to } from "await-to-js";
import ansis, { red, bold, fg, hex, rgb, yellow } from "ansis";

// In Kalsh Api this metric naming convention:
// volume = Volume
// projected_pnl = Profit
// num_markets_traded = Predictions
const metricNames = ["volume", "projected_pnl", "num_markets_traded"];
const timeFrames = [0, 1, 3, 7, 15, 29, 60, 99];
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
const limit = 99;
const apiUrl = "https://api.elections.kalshi.com/v1/social/leaderboard";
const fetchDelayMs = 100;

async function main() {
  const leaderLinks = [];

  // Generate all combinations of urls
  for (const timeFrame of timeFrames) {
    for (const metricName of metricNames) {
      for (const category of categories) {
        let url = `${apiUrl}?metric_name=${metricName}&limit=${limit}&since_day_before=${timeFrame}`;

        if (category) {
          url += `&category=${category}`;
        }

        leaderLinks.push(url);
      }
    }
  }

  console.log(`Generated ${leaderLinks.length} requests for leaderboard data.`);

  const userDirectory = {};

  // load existing users to avoid re-fetching
  const file = JSON.parse(fs.readFileSync("leaderboardUsers.json", "utf-8"));
  file.forEach((entry) => (userDirectory[entry.nickname] = entry));

  let uniqueUsersAddedCount = 0;

  for (const [index, url] of leaderLinks.entries()) {
    console.log(
      `${yellow("*")} Fetching Leaderboard User (${index}/${
        leaderLinks.length
      }):`,
      url.replace(apiUrl, "")
    );

    const [
      err,
      {
        data: { rank_list: rankedUsers },
      },
    ] = await to(axios.get(url));

    if (err) {
      console.log(red`(!) Error fetching leaderboard data:`, err);
      continue;
    }

    if (!rankedUsers) {
      console.log(red`(!) No users found in the response.`, url);
      continue;
    }

    if (rankedUsers.length === 0) {
      console.log(red`(!) Empty user list returned.`, url);
      continue;
    }

    // add users to the list, avoiding duplicates
    for (const user of rankedUsers) {
      // Bail if user data is malformed
      if (!user.nickname || typeof user.nickname !== "string") {
        throw new Error("Invalid user: missing or invalid nickname");
      }

      if (!userDirectory[user.nickname]) {
        uniqueUsersAddedCount++;
      }
      userDirectory[user.nickname] = user;
    }

    await delay(fetchDelayMs);
  }

  const users = Object.values(userDirectory).sort((a, b) =>
    a.nickname.localeCompare(b.nickname)
  );

  console.log("Total Users fetched:", users.length);

  // Log 5 random users as samples
  const randomUsers = [...users].sort(() => 0.5 - Math.random()).slice(0, 5);
  randomUsers.forEach((entry) => console.log("Sample:", JSON.stringify(entry)));

  fs.writeFileSync("leaderboardUsers.json", JSON.stringify(users, null, 2));
  console.log("Unique Users Added:", uniqueUsersAddedCount);
  console.log("User data saved to leaderboardUsers.json");
  console.log("Done.");
}

main();

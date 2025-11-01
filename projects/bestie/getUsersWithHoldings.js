// https://api.elections.kalshi.com/v1/social/profile/metrics?nickname=EJG7&since_day_before=0

import fs from "fs";
import axios from "axios";
import { to } from "await-to-js";
import { delay } from "../../helpers/delay.js";
import { red, blue, yellow, green } from "ansis";

const apiUrl = "https://api.elections.kalshi.com/v1";
const fetchDelayMs = 200;

async function main() {
  const usersWithHoldings = JSON.parse(
    fs.readFileSync("usersWithHoldings.json")
  );
  const users = JSON.parse(fs.readFileSync("leaderboardUsers.json"));
  console.log(`Total users to process: ${users.length}`);

  for (const [index, user] of users.entries()) {
    const nickname = user.nickname;
    const url = `${apiUrl}/social/profile/holdings?nickname=${nickname}&limit=20&closed_positions=false`;
    console.log(
      `* (${index}/${
        users.length
      }) Fetching holdings '${nickname}': ${url.replace(apiUrl, "")}`
    );

    if (usersWithHoldings.includes(nickname)) {
      console.log(blue`(-) User already has holdings recorded: ${nickname}`);
      continue;
    }

    await delay(fetchDelayMs);
    const [err, response] = await to(axios.get(url));

    if (err) {
      console.log(red`(!) Error fetching:`, err.message);
      continue;
    }

    const holdings = response?.data?.holdings || [];

    if (!(holdings.length > 0)) {
      console.log(yellow`(-) No holdings for user: ${nickname}`);
      continue;
    }

    usersWithHoldings.push(nickname);
    console.log(green`(+) Added user with holdings: ${nickname}`);
  }

  fs.writeFileSync(
    "usersWithHoldings.json",
    JSON.stringify(usersWithHoldings, null, 2)
  );
  console.log(
    `Updated usersWithHoldings.json with ${usersWithHoldings.length} users.`
  );
}

main();

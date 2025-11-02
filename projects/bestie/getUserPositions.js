import fs from "fs";
import { delay, getFormattedDateTime } from "../../helpers/funcs.js";
import axios from "axios";
import { to } from "await-to-js";

const MAX_USERS_TO_FETCH = 20;
const isWatchMode = process.argv.includes("--watch");
const fetchDelayMs = 200;

const watchFn = async () => {
  const users = JSON.parse(fs.readFileSync("userSkillScores.json")).slice(
    0,
    MAX_USERS_TO_FETCH
  );

  console.log(
    `Users to track (${users.length}):`,
    users.map((u) => u.nickname).join(", ")
  );

  for (const [index, user] of users.entries()) {
    const nickname = user.nickname;
    console.log(
      `* Fetching holdings ${nickname} (${index + 1}/${users.length})...`
    );

    const [err, positions] = await to(getUserActivePositions(nickname));
    if (err) {
      console.error(
        `  - Error fetching holdings for ${nickname}: ${err.message}`
      );
    } else {
      console.log(`  - Fetched ${positions.length} active positions.`);
    }
  }

  console.log(
    `Completed fetching all user positions. [${getFormattedDateTime()}]`
  );
};

if (isWatchMode) {
  console.log(
    "Watch mode enabled. Fetching user positions every 30 minutes..."
  );
  console.log(`Started at ${getFormattedDateTime()}`);

  watchFn();
  setInterval(watchFn, 30 * 60 * 1000);
}

export async function getUserActivePositions(nickname) {
  const url = `https://api.elections.kalshi.com/v1/social/profile/holdings?nickname=${nickname}&limit=99&closed_positions=false`;

  await delay(fetchDelayMs);
  const [err, response] = await to(axios.get(url));

  if (err) {
    throw new Error(
      `Error fetching holdings for user ${nickname}: ${err.message}`
    );
  }

  const holdings = response?.data?.holdings || [];
  const activePositions = holdings
    .flatMap((h) => {
      const { market_holdings, ...e } = h;
      return market_holdings.map((m) => ({ ...m, ...e }));
    })
    .map((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
      side: p.signed_open_position > 0 ? "yes" : "no",
    }))
    .map((p) => ({ ...p, id: p.market_id + ":" + p.side }));

  const positions = getPastUserPositions(nickname);

  // check for new positions by comparing the market_id field
  const existingMarketIds = new Set(positions.map((p) => p.id));
  const filteredActivePositions = activePositions.filter(
    (p) => !existingMarketIds.has(p.id)
  );

  if (isWatchMode)
    if (filteredActivePositions.length > 0) {
      console.log(
        `  - Found ${filteredActivePositions.length} new active positions for ${nickname}.`
      );
    } else {
      console.log(`  - No new active positions for ${nickname}.`);
    }

  if (filteredActivePositions.length > 0) {
    positions.push(...filteredActivePositions);
    const filePath = getFilePathForUserPositions(nickname);
    fs.writeFileSync(filePath, JSON.stringify(positions, null, 2));
  }

  return activePositions;
}

function getFilePathForUserPositions(nickname) {
  const safeNickname = nickname.replace(/[<>:"/\\|?*]/g, "_");
  return `./positions/${safeNickname}.json`;
}

function getPastUserPositions(nickname) {
  const filePath = getFilePathForUserPositions(nickname);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } else {
    return [];
  }
}

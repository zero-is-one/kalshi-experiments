import fs from "fs";
import { getFormattedDateTime } from "../../helpers/funcs.js";

// the minimum number of bets a user must have made to be included in the rankings
const MIN_PREDICTIONS = 200;
const MIN_DOLLAR_VOLUME = 50;
const MIN_DOLLAR_PROFIT = 1000;

const isWatchMode = process.argv.includes("--watch");

export const getUserSkillScore = (nickname) => {
  const users = JSON.parse(fs.readFileSync("userSkillScores.json"));
  const user = users.find((u) => u.nickname === nickname);
  return user ? user.skillScore : 0;
};

export const getUserSkillScores = () => {
  const users = JSON.parse(fs.readFileSync("userSkillScores.json"));
  return users;
};

const watchFn = () => {
  const users = JSON.parse(fs.readFileSync("userMetrics.json"))
    .filter((user) => {
      return (
        typeof user.num_markets_traded === "number" &&
        typeof user.volume === "number" &&
        typeof user.pnl === "number"
      );
    })
    .map((user) => {
      return {
        nickname: user.nickname,
        dollarProfit: user.pnl / 10000, // pnl is in cents, convert to dollars
        dollarVolume: user.volume,
        predictionsCount: user.num_markets_traded,
      };
    })
    .filter(
      (u) =>
        u.dollarVolume >= MIN_DOLLAR_VOLUME &&
        u.predictionsCount >= MIN_PREDICTIONS &&
        u.dollarProfit > MIN_DOLLAR_PROFIT
    )
    .map((u) => {
      return {
        nickname: u.nickname,
        skillScore: u.dollarProfit / u.predictionsCount,
      };
    })
    .sort((a, b) => b.skillScore - a.skillScore)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  fs.writeFileSync("userSkillScores.json", JSON.stringify(users, null, 2));

  console.log(
    `Calculated skill scores for ${
      users.length
    } users. [${getFormattedDateTime()}]`
  );
  return users;
};

if (isWatchMode) {
  console.log(
    "Watch mode enabled. Calculating skill scores every 30 minutes..."
  );
  console.log(`Started at ${getFormattedDateTime()}`);
  watchFn();
  setInterval(watchFn, 30 * 60 * 1000);
}

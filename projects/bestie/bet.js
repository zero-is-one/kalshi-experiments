import fs from "fs";
import axios from "axios";
import { to } from "await-to-js";
import { delay } from "../../helpers/funcs.js";
import { red, blue, yellow, green } from "ansis";
import { logger, getLogAsString } from "../../helpers/logger/index.js";
import { order } from "../../helpers/kalshi-api/index.js";
import { getUserSkillScores } from "./getUserSkillScores.js";
import { getUserActivePositions } from "./getUserPositions.js";

const MIN_SKILL_SCORE_RANKING = 17; // top 18 users (0-indexed)

async function main(isInitialRun = true) {
  console.log("\n----------------------------------------\n");

  const userSkillScores = getUserSkillScores().slice(0, 30);

  const betSkillThreshold = userSkillScores[MIN_SKILL_SCORE_RANKING].skillScore;
  console.log(
    `Betting for users with skill score above ${betSkillThreshold.toFixed(2)}`
  );

  // make a store for position Id and the nicknames of the users holding them
  const statsMap = {};

  for (const user of userSkillScores) {
    const nickname = user.nickname;
    console.log(blue(`* Placing bet for user ${nickname}...`));

    const positions = await getUserActivePositions(nickname);
    console.log(`  - User has ${positions.length} active positions.`);

    for (const position of positions) {
      if (!statsMap[position.id]) {
        statsMap[position.id] = { position, holders: [] };
      }
      statsMap[position.id].holders.push(nickname);
    }
  }

  const statsArr = Object.values(statsMap)
    .map((entry) => ({
      ...entry,
      totalSkillScore: entry.holders.reduce((sum, nick) => {
        const user = userSkillScores.find((u) => u.nickname === nick);
        return sum + (user ? user.skillScore : 0);
      }, 0),
    }))
    .sort((a, b) => b.totalSkillScore - a.totalSkillScore)
    .filter((entry) => entry.totalSkillScore >= betSkillThreshold);

  // save to file for logging
  fs.writeFileSync("bestieBetStats.json", JSON.stringify(statsArr, null, 2));

  console.log(
    green(`\nTop ${statsArr.length} positions to consider betting on:`)
  );
}

main();

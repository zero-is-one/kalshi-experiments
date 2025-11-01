import fs from "fs";

const maxUsers = 50;

function main() {
  const users = JSON.parse(fs.readFileSync("userMetrics.json"))
    .filter((user) => {
      return (
        typeof user.num_markets_traded === "number" &&
        typeof user.volume === "number" &&
        typeof user.pnl === "number"
      );
    })
    // remove users with low activity / newer and unreliable data
    .filter((user) => user.num_markets_traded >= 100);

  console.log(`Total users to process: ${users.length}`);

  const globalROIAvg = getGlobalROIAvg(users);

  console.log("Global Average ROI:", globalROIAvg.toFixed(4));

  const scores = users
    .map((user) => {
      const score = getPerformanceScore(
        {
          profit: user.pnl,
          volume: user.volume,
          numBets: user.num_markets_traded,
        },
        globalROIAvg,
        200
      );
      return { nickname: user.nickname, score };
    }) // sort that returns new array
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ ...s, rank: i + 1 }))
    .slice(0, maxUsers); // top 50 only

  fs.writeFileSync(
    "userPerformanceScores.json",
    JSON.stringify(scores, null, 2)
  );
}

main();

function getPerformanceScore({ profit, volume, numBets }, globalROIAvg, k) {
  const roi = profit / volume; // raw efficiency
  const n = numBets; // experience weight
  const skill = (roi * n + globalROIAvg * k) / (n + k); // Bayesian shrinkage
  const confidence = n / (n + k); // reliability scaling
  const skillScore = skill * confidence; // final skill metric (unbounded)
  return skillScore;
}

function getGlobalROIAvg(users) {
  // Step 1: Filter outliers
  const filtered = users.filter((u) => {
    const roi = u.pnl / u.volume;
    const validVolume = u.volume >= 100;
    const validBets = u.num_markets_traded >= 10;
    const withinROI = roi > -1 && roi < 1; // -100% to +100%
    return validVolume && validBets && withinROI;
  });

  // Step 2: Compute weighted average ROI
  const totals = filtered.reduce(
    (acc, u) => {
      acc.profit += u.pnl;
      acc.volume += u.volume;
      return acc;
    },
    { profit: 0, volume: 0 }
  );

  return totals.volume > 0 ? totals.profit / totals.volume : 0;
}

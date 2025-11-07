const { spawn } = require("child_process");

// run npm start to start the bot

const npmStart = spawn("npm", ["start"], {
  stdio: "inherit",
  shell: true,
});

npmStart.on("close", (code) => {
  console.log(`npm start process exited with code ${code}`);
});

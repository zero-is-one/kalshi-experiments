import fs from "fs";
import path from "path";

export const logger = (fileName = "output", jsonData) => {
  const allData = {
    timestamp: new Date().toISOString(),
    ...jsonData,
    category: fileName,
  };
  fs.appendFileSync(`logs/${fileName}.log`, JSON.stringify(allData) + "\n");
};

export function useLogger(app) {
  app.get("/logs", (req, res) => {
    try {
      const logsDir = path.join(process.cwd(), "logs");
      const files = fs
        .readdirSync(logsDir)
        .filter((file) => file.endsWith(".log"));

      const logData = files.map((file) => {
        const content = fs.readFileSync(path.join(logsDir, file), "utf8");
        const lines = content
          .trim()
          .split("\n")
          .filter((line) => line);
        return {
          filename: file,
          entries: lines.map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return { raw: line };
            }
          }),
        };
      });

      const html = `
<!DOCTYPE html>
<html>
<head>
        <title>Log Viewer</title>
        <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .filter { margin-bottom: 20px; }
                .log-file { margin-bottom: 30px; border: 1px solid #ccc; padding: 15px; }
                .log-entry { background: #f5f5f5; margin: 5px 0; padding: 10px; border-radius: 4px; }
                .hidden { display: none; }
        </style>
</head>
<body>
        <h1>Log Viewer</h1>
        <div class="filter">
                <input type="text" id="searchInput" placeholder="Filter logs..." onkeyup="filterLogs()">
        </div>
        <div id="logContainer">
                ${logData
                  .map(
                    (log) => `
                        <div class="log-file" data-filename="${log.filename}">
                                <h3>${log.filename}</h3>
                                ${log.entries
                                  .map(
                                    (entry) => `
                                        <div class="log-entry" data-content="${JSON.stringify(
                                          entry
                                        ).toLowerCase()}">
                                                <pre>${JSON.stringify(
                                                  entry,
                                                  null,
                                                  2
                                                )}</pre>
                                        </div>
                                `
                                  )
                                  .join("")}
                        </div>
                `
                  )
                  .join("")}
        </div>
        
        <script>
                function filterLogs() {
                        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
                        const logFiles = document.querySelectorAll('.log-file');
                        
                        logFiles.forEach(logFile => {
                                const entries = logFile.querySelectorAll('.log-entry');
                                let hasVisibleEntries = false;
                                
                                entries.forEach(entry => {
                                        const content = entry.getAttribute('data-content');
                                        if (content.includes(searchTerm)) {
                                                entry.classList.remove('hidden');
                                                hasVisibleEntries = true;
                                        } else {
                                                entry.classList.add('hidden');
                                        }
                                });
                                
                                if (hasVisibleEntries || searchTerm === '') {
                                        logFile.classList.remove('hidden');
                                } else {
                                        logFile.classList.add('hidden');
                                }
                        });
                }
        </script>
</body>
</html>`;

      res.send(html);
    } catch (error) {
      res.status(500).send("Error reading log files");
    }
  });
}

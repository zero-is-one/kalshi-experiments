import fs from "fs";
import path from "path";
import express from "express";

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
                .log-file { margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px; }
                .file-header { 
                        background: #e9e9e9; 
                        padding: 15px; 
                        cursor: pointer; 
                        border-radius: 4px 4px 0 0;
                        user-select: none;
                }
                .file-header:hover { background: #ddd; }
                .file-content { 
                        padding: 10px; 
                        border-top: 1px solid #ccc;
                        display: none;
                }
                .file-content.expanded { display: block; }
                .log-entry { margin: 5px 0; border: 1px solid #ddd; border-radius: 4px; }
                .entry-header { 
                        background: #f5f5f5; 
                        padding: 10px; 
                        cursor: pointer; 
                        font-family: monospace;
                        user-select: none;
                        border-radius: 4px 4px 0 0;
                        height: 24px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;

                        
                }
                .entry-header:hover { background: #eee; }
                .entry-content { 
                        padding: 10px; 
                        border-top: 1px solid #ddd;
                        background: white;
                        display: none;
                }
                .entry-content.expanded { display: block; }
                .hidden { display: none; }
                .accordion-icon { float: right; }
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
                                <div class="file-header" onclick="toggleFile(this)">
                                        <strong>${log.filename}</strong> (${
                      log.entries.length
                    } entries)
                                        <span class="accordion-icon">▶</span>
                                </div>
                                <div class="file-content">
                                        ${log.entries
                                          .map(
                                            (entry) => `
                                                <div class="log-entry" data-content="${JSON.stringify(
                                                  entry
                                                )
                                                  .toLowerCase()
                                                  .replace(/"/g, "&quot;")}">
                                                        <div class="entry-header" onclick="toggleEntry(this)">
                                                                ${JSON.stringify(
                                                                  entry
                                                                )}
                                                                <span class="accordion-icon">▶</span>
                                                        </div>
                                                        <div class="entry-content">
                                                                <pre>${JSON.stringify(
                                                                  entry,
                                                                  null,
                                                                  2
                                                                )}</pre>
                                                        </div>
                                                </div>
                                        `
                                          )
                                          .join("")}
                                </div>
                        </div>
                `
                  )
                  .join("")}
        </div>
        
        <script>
                function toggleFile(header) {
                        const content = header.nextElementSibling;
                        const icon = header.querySelector('.accordion-icon');
                        
                        if (content.classList.contains('expanded')) {
                                content.classList.remove('expanded');
                                icon.textContent = '▶';
                        } else {
                                content.classList.add('expanded');
                                icon.textContent = '▼';
                        }
                }
                
                function toggleEntry(header) {
                        const content = header.nextElementSibling;
                        const icon = header.querySelector('.accordion-icon');
                        
                        if (content.classList.contains('expanded')) {
                                content.classList.remove('expanded');
                                icon.textContent = '▶';
                        } else {
                                content.classList.add('expanded');
                                icon.textContent = '▼';
                        }
                }
        
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

export const createLogServer = async () => {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}/logs`);
  });

  useLogger(app);

  return app;
};

export const getLogAsString = (fileName) => {
  try {
    const filePath = path.join(process.cwd(), "logs", `${fileName}.log`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf8");
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error reading log file:", error);
    return null;
  }
};

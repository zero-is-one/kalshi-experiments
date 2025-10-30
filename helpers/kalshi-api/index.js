import fs from "fs";
import crypto from "crypto";

const API_KEY_ID = "a4217df6-4725-4135-b3ad-85b8b212f4c1";
const BASE_URL = "https://api.elections.kalshi.com"; // or https://api.kalshi.com
const PRIVATE_KEY_PEM = (() => {
  try {
    return fs.readFileSync(new URL("./kalshi.key", import.meta.url), "utf8");
  } catch (err) {
    throw new Error(`Failed to load private key: ${err.message}`);
  }
})();

function createSignature(privateKeyPem, timestamp, method, path) {
  // Strip query parameters before signing
  const pathWithoutQuery = path.split("?")[0];

  // Message to sign: timestamp + HTTP_METHOD + path_without_query
  const message = `${timestamp}${method}${pathWithoutQuery}`;

  // Sign using RSA-PSS with SHA256
  const signature = crypto.sign("sha256", Buffer.from(message, "utf8"), {
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });

  return signature.toString("base64");
}

async function request(method, path, body = null, baseUrl = BASE_URL) {
  try {
    const apiKeyId = API_KEY_ID;
    const timestamp = Date.now().toString(); // milliseconds
    const signature = createSignature(PRIVATE_KEY_PEM, timestamp, method, path);

    //

    const headers = {
      "KALSHI-ACCESS-KEY": apiKeyId,
      "KALSHI-ACCESS-SIGNATURE": signature,
      "KALSHI-ACCESS-TIMESTAMP": timestamp,
      Accept: "application/json",
    };

    console.log({
      method,
      path,
      body,
      headers,
      //get timestammp in EST
      timestamp: new Date(parseInt(timestamp)).toLocaleString("en-US", {
        timeZone: "America/New_York",
      }),
    });

    // Add Content-Type header for POST requests
    if (method === "POST" && body) {
      headers["Content-Type"] = "application/json";
    }

    // Use global fetch (Node 18+). If using older Node, install node-fetch and uncomment:
    // const fetch = require('node-fetch');
    const url = baseUrl + path;

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    const contentType = res.headers.get("content-type") || "";
    let responseBody;
    if (contentType.includes("application/json")) {
      responseBody = await res.json();
    } else {
      responseBody = await res.text();
    }

    if (!res.ok) {
      const msg =
        typeof responseBody === "string"
          ? responseBody
          : JSON.stringify(responseBody);

      return [
        null,
        new Error(`Request failed: ${res.status} ${res.statusText} - ${msg}`),
      ];
    }

    return [responseBody, null];
  } catch (error) {
    return [null, error];
  }
}

export async function getAccountBalance() {
  const path = "/trade-api/v2/portfolio/balance";
  return request("GET", path, null, BASE_URL);
}

export async function order(order) {
  const path = "/trade-api/v2/portfolio/orders";
  return request("POST", path, order, BASE_URL);
}

export async function getEvent(eventTicker) {
  const path = `/trade-api/v2/events/${eventTicker}`;
  return request("GET", path, null, BASE_URL);
}

import { writeFileSync } from "fs";
import { YoutubeTranscript } from "@danielxceron/youtube-transcript";
import { delay } from "../../helpers/delay.js";
import { getEvent, order } from "../../helpers/kalshi-api/index.js";
import { logger } from "../../helpers/logger/index.js";
const isTestMode = false;

const YOUTUBE_API_KEY = "AIzaSyC93elLLaaVLiKlrx27SpgwEFneorRuEEU";
const CHANNEL_ID = "UCX6OQ3DkcsbYNE6H8uQQuVA";
const TARGET_HOUR = 12; // Hour in EST (24-hour format)
const TARGET_MINUTE = 0; // Minute

const eventTicker = "KXMRBEASTMENTION-25NOV16";

// Configuration for fetching
const BEFORE_TARGET_MS = 10; // Time before target time to start monitoring (in ms)
const TOTAL_FETCHES = 10; // Number of times to check for new videos
const MONITORING_PERIOD_MS = 3000; // Period in milliseconds (3 seconds)

let ordersCount = 0;
let maxOrders = 5;

async function getLatestVideo(channelId) {
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.append("key", YOUTUBE_API_KEY);
    url.searchParams.append("channelId", channelId);
    url.searchParams.append("part", "snippet");
    url.searchParams.append("order", "date");
    url.searchParams.append("type", "video");
    url.searchParams.append("maxResults", "1");
    url.searchParams.append("videoDuration", "long");

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 403) {
        console.error("YouTube API quota exceeded (403 Forbidden)");
      } else {
        console.error(`HTTP error! status: ${response.status}`);
      }

      return null;
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;

    const item = data.items[0];
    return {
      id: item.id.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
    };
  } catch (error) {
    console.error("Error fetching video:", error);
    return null;
  }
}

async function fetchAndSaveTranscript(video, event) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(video.id, {
      lang: "en",
    });

    const transcriptFetchedAt = new Date();

    console.log("-----Complete------");
    console.log({
      video,
      transcriptFetchedAt,
      prettyTranscriptFetchedAt: transcriptFetchedAt.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        timeZoneName: "short",
      }),
    });

    const transcriptText = transcript
      .map((entry) => entry.text)
      .join("\n")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .toLowerCase();

    let runs = 0;
    for (const market of event.markets) {
      const word = market.yes_sub_title.toLowerCase();
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      const matches = transcriptText.match(regex);
      const count = matches ? matches.length : 0;
      console.log(
        `The word "${word}" appears ${count} time(s) in the transcript.`
      );

      if (!isTestMode) {
        if (ordersCount >= maxOrders) {
          console.log(
            `Max orders limit of ${maxOrders} reached. No more orders will be placed.`
          );
          break;
        }
        const [result, error] = order({
          ticker: market.ticker,
          type: "market",
          action: "buy",
          side: "yes",
          count: 1,
          yes_price: 90, // max price in cents
          client_order_id: `yts-${Date.now()}`,
        });

        logger("orders", {
          type: "youtube-transcript-buy",
          event: event,
          market: market,
          word,
          count,
          result,
          error: error?.message,
        });
        ordersCount++;
        console.log(`Total orders placed so far: ${ordersCount}`);
      }

      runs++;
      if (runs >= 2) break;
    }

    writeFileSync(`${video.id}.txt`, transcriptText);
    console.log(
      `Transcript saved for ${video.id} at ${new Date().toISOString()}`
    );
  } catch (error) {
    console.error(`Failed to fetch transcript for ${video.id}:`, error);
  }
}

function getTimeUntilTargetTime() {
  const now = new Date();

  // Get the current date/time in Eastern timezone
  const nowInEastern = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const currentDay = nowInEastern.getDay(); // 0 = Sunday, 6 = Saturday

  // Calculate days until next Saturday
  let daysToAdd = (6 - currentDay + 7) % 7;

  // If today is Saturday, check if target time has passed
  if (currentDay === 6) {
    if (
      nowInEastern.getHours() < TARGET_HOUR ||
      (nowInEastern.getHours() === TARGET_HOUR &&
        nowInEastern.getMinutes() < TARGET_MINUTE)
    ) {
      daysToAdd = 0; // Target is today
    } else {
      daysToAdd = 7; // Target is next Saturday
    }
  }

  // Create target time by starting with current time and adjusting
  const targetTime = new Date(now);
  targetTime.setDate(now.getDate() + daysToAdd);

  // Get what the target time should be in Eastern timezone
  const targetInEastern = new Date(
    targetTime.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  targetInEastern.setHours(TARGET_HOUR, TARGET_MINUTE, 0, 0);

  // Convert back to local time by calculating the difference
  const easternOffset =
    targetTime.getTime() -
    new Date(
      targetTime.toLocaleString("en-US", { timeZone: "America/New_York" })
    ).getTime();
  const targetInLocal = new Date(targetInEastern.getTime() + easternOffset);

  return targetInLocal.getTime() - now.getTime();
}

async function startWatching() {
  const timeUntilTarget = isTestMode ? 3000 : getTimeUntilTargetTime();
  const waitTime = timeUntilTarget - BEFORE_TARGET_MS;

  const [event, eventError] = await getEvent(eventTicker);
  console.log("Event:", event.event.title);

  if (!event) {
    console.error(
      "Failed to fetch event details. Exiting.",
      eventError?.message
    );
    return;
  }

  // Get initial latest video
  const initialVideo = isTestMode
    ? { id: "TEST_VIDEO_ID", title: "Test Video (IN TEST MODE)" }
    : await getLatestVideo(CHANNEL_ID);

  if (!initialVideo) {
    throw new Error("Failed to fetch initial latest video");
  }

  console.log(
    `Initial latest video: ${initialVideo.title} (${initialVideo.id})`
  );

  const waitHours = Math.floor(waitTime / (1000 * 60 * 60));
  const waitMinutes = Math.floor((waitTime % (1000 * 60 * 60)) / (1000 * 60));
  const waitSeconds = Math.floor((waitTime % (1000 * 60)) / 1000);

  console.log(
    "Current Time:",
    new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
    })
  );
  console.log(
    "Target Time (EST):",
    new Date(Date.now() + timeUntilTarget).toLocaleString("en-US", {
      timeZone: "America/New_York",
    })
  );

  console.log(
    `Waiting ${waitHours}h ${waitMinutes}m ${waitSeconds}s until 10ms before ${TARGET_HOUR}:${TARGET_MINUTE.toString().padStart(
      2,
      "0"
    )} EST on Saturday...`
  );

  await delay(waitTime);

  // console.log("Starting video monitoring at", new Date().toISOString());
  // console.log(
  //   `Will check ${TOTAL_FETCHES} times over ${MONITORING_PERIOD_MS / 1000} seconds`
  // );

  let detectedVideo = null;

  // Calculate interval between checks
  const checkInterval = MONITORING_PERIOD_MS / TOTAL_FETCHES;
  let fetchCount = 0;

  const intervalId = setInterval(async () => {
    // Stop after reaching the target number of fetches
    fetchCount++;

    if (isTestMode && fetchCount >= 3) {
      clearInterval(intervalId);
      console.log(
        `(TEST MODE) Monitoring completed after ${fetchCount} checks `
      );
      return;
    }

    if (fetchCount > TOTAL_FETCHES) {
      clearInterval(intervalId);
      console.log(`Monitoring completed after ${TOTAL_FETCHES} checks`);
    }

    if (detectedVideo) {
      if (isTestMode) {
        console.log(
          `(TEST MODE) Interval Aborted: Detected video already processed: ${detectedVideo.title} (${detectedVideo.id})`
        );
      }
      clearInterval(intervalId);
      return;
    }

    //console.log(`Check ${fetchCount}/${TOTAL_FETCHES}`);

    const latestVideo = await getLatestVideo(CHANNEL_ID);

    if (latestVideo && latestVideo.id !== initialVideo.id) {
      if (isTestMode) {
        console.log(
          `NEW VIDEO FOUND: ${latestVideo.title} (${
            latestVideo.id
          }) at ${new Date().toISOString()}`
        );
      }

      if (detectedVideo) {
        if (isTestMode) {
          console.log(
            `(TEST MODE) Process Aborted: Detected video already processed: ${detectedVideo.title} (${detectedVideo.id})`
          );
        }
        return;
      }

      detectedVideo = {
        id: latestVideo.id,
        title: latestVideo.title,
        publishedAt: latestVideo.publishedAt,
        foundAt: new Date(),
      };

      fetchAndSaveTranscript(detectedVideo, event);
    }
  }, checkInterval);
}

startWatching();

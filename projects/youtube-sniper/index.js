const YOUTUBE_API_KEY = "AIzaSyC93elLLaaVLiKlrx27SpgwEFneorRuEEU";
const CHANNEL_ID = "UCX6OQ3DkcsbYNE6H8uQQuVA";

async function getLatestVideos(channelId, maxResults = 10) {
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.append("key", YOUTUBE_API_KEY);
    url.searchParams.append("channelId", channelId);
    url.searchParams.append("part", "snippet");
    url.searchParams.append("order", "date");
    url.searchParams.append("type", "video");
    url.searchParams.append("maxResults", maxResults);
    //video duration long
    url.searchParams.append("videoDuration", "long");

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    const videos = data.items
      // sort by publishedAt descending
      //.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .map((item) => ({
        title: item.snippet.title,

        // make the publishedAt more readable and get day of the week, and time
        // include timezone
        publishedAt: new Date(item.snippet.publishedAt).toLocaleString(
          "en-US",
          {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            timeZoneName: "short",
          }
        ),
      }));

    return videos;
  } catch (error) {
    console.error("Error fetching videos:", error.message);
    throw error;
  }
}

// Usage
async function main() {
  try {
    const videos = await getLatestVideos(CHANNEL_ID);
    console.log("Latest videos:", videos);
  } catch (error) {
    console.error("Failed to get videos:", error.message);
  }
}

main();

const youtubeId = "dQw4w9WgXcQ"; // Replace with your desired YouTube video ID

import { YoutubeTranscript } from "@danielxceron/youtube-transcript";

//YoutubeTranscript.fetchTranscript(youtubeId).then(console.log);

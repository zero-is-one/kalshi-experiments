export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getFormattedDateTime = () => {
  const nyTime = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return nyTime;
};

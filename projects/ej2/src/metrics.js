export async function getMetricsFromPage(page) {
  // get metrics div text as array
  // will be: [ 'Profit', '$84.5K', 'Volume', '3.49M', 'Predictions', '182' ]
  const metricsArr = (
    await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll("div"));
      const metricsDiv = divs.find((div) =>
        div.className.startsWith("metricsContainer-")
      );
      return metricsDiv ? metricsDiv.innerText : null;
    })
  ).split("\n");

  return {
    profit: metricsArr[1],
    volume: metricsArr[3],
    predictions: Number(metricsArr[5]),
  };
}

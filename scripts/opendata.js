const fs = require("fs");
const path = require("path");

const apiUrls = {
  wifiSites:
    "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/sites-disposant-du-service-paris-wi-fi/exports/geojson",
  bibliotheques:
    "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/repertoire-bibliotheques/exports/geojson",
};

async function fetchWifiSites() {
  try {
    const response = await fetch(apiUrls.wifiSites);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}

async function fetchBibliotheques() {
  try {
    const response = await fetch(apiUrls.bibliotheques);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}

function saveToFile(data, filename) {
  const outputPath = path.join(__dirname, "..", "data", filename);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
}

async function main() {
  const wifiSites = await fetchWifiSites();
  saveToFile(wifiSites, "pariswifi_sites.geojson");

  const bibliotheques = await fetchBibliotheques();
  saveToFile(bibliotheques, "bibliotheques.geojson");
}

main();

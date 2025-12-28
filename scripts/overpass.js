const fs = require("fs");
const path = require("path");

const OVERPASS_BASE_URL = "https://overpass.kumi.systems/api/interpreter";

const GRANDES_VILLES = [
  { name: "Paris", relation: 71525 },
  { name: "Marseille", relation: 76469 },
  { name: "Lyon", relation: 120965 },
  { name: "Toulouse", relation: 35738 },
  { name: "Nice", relation: 170100 },
];

function toGeoJSON(elements) {
  const features = [];

  for (const el of elements) {
    const lon = el.lon ?? el.center?.lon;
    const lat = el.lat ?? el.center?.lat;

    if (lon === undefined || lat === undefined) continue;
    const properties = {
      "@id": `${el.type}/${el.id}`,
      "@type": el.type,
      ...el.tags,
    };

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lon, lat],
      },
      properties,
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

async function fetchCoworkingSpots() {
  const areaIds = GRANDES_VILLES.map((v) => 3600000000 + v.relation);

  const query = `
    [out:json][timeout:120];
    (
      ${areaIds
        .map(
          (id) => `
        node["amenity"="coworking_space"](area:${id});
        way["amenity"="coworking_space"](area:${id});
        node["office"="coworking"](area:${id});
        way["office"="coworking"](area:${id});
      `,
        )
        .join("")}
    );
    out center;
  `;

  console.log("🔍 Récupération des spots de coworking...");

  const response = await fetch(OVERPASS_BASE_URL, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!response.ok) {
    throw new Error(`Erreur HTTP: ${response.status}`);
  }

  return response.json();
}

async function main() {
  try {
    const data = await fetchCoworkingSpots();
    console.log(`✅ ${data.elements.length} éléments récupérés`);

    const geojson = toGeoJSON(data.elements);

    const outputPath = path.join(
      __dirname,
      "..",
      "data",
      "coworking_france.geojson",
    );
    fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));

    console.log(`💾 Fichier sauvegardé: ${outputPath}`);
    console.log(`📊 Total: ${geojson.features.length} features`);
    console.log("🎉 Terminé !");
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    process.exit(1);
  }
}

main();

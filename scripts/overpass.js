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

  console.log("Récupération des spots de coworking...");

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

async function fetchLibraries() {
  const areaIds = GRANDES_VILLES.filter((v) => v.name !== "Paris").map(
    (v) => 3600000000 + v.relation,
  );

  const query = `
    [out:json][timeout:120];
    (
      ${areaIds
        .map(
          (id) => `
        node["amenity"="library"](area:${id});
        way["amenity"="library"](area:${id});
        relation["amenity"="library"](area:${id});
      `,
        )
        .join("")}
    );
    out center;
  `;

  console.log("Récupération des bibliothèques...");

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

async function fetchCofee() {
  const areaIds = GRANDES_VILLES.map((v) => 3600000000 + v.relation);

  const query = `
    [out:json][timeout:120];
    (
      ${areaIds
        .map(
          (id) => `
        node["amenity"="cafe"]["internet_access"](area:${id});
        way["amenity"="cafe"]["internet_access"](area:${id});
        node["amenity"="cafe"]["socket"](area:${id});
        way["amenity"="cafe"]["socket"](area:${id});
      `,
        )
        .join("")}
    );
    out center;
  `;

  console.log("Récupération des cafés...");

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

function addTypeOfSites(data, type) {
  data.features.forEach((feature) => {
    feature.properties.spotType = type;
  });
}

function saveToFile(data, filename) {
  const outputPath = path.join(__dirname, "..", "data", filename);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
}

async function main() {
  try {
    const coworkingData = await fetchCoworkingSpots();
    console.log(`✅ ${coworkingData.elements.length} éléments récupérés`);
    const coworkingGeojson = toGeoJSON(coworkingData.elements);
    addTypeOfSites(coworkingGeojson, "Coworking");
    saveToFile(coworkingGeojson, "coworking_france.geojson");
    console.log(`Total: ${coworkingGeojson.features.length} features`);
    console.log("Terminé !");

    const cofeeData = await fetchCofee();
    console.log(`✅ ${cofeeData.elements.length} éléments récupérés`);
    const cofeeGeojson = toGeoJSON(cofeeData.elements);
    addTypeOfSites(cofeeGeojson, "Cofee");
    saveToFile(cofeeGeojson, "cofee_france.geojson");
    console.log(`Total: ${cofeeGeojson.features.length} features`);
    console.log("Terminé !");

    const librariesData = await fetchLibraries();
    console.log(`✅ ${librariesData.elements.length} éléments récupérés`);
    const librariesGeojson = toGeoJSON(librariesData.elements);
    addTypeOfSites(librariesGeojson, "Library");
    saveToFile(librariesGeojson, "libraries_france.geojson");
    console.log(`Total: ${librariesGeojson.features.length} features`);
    console.log("Terminé !");
  } catch (error) {
    console.error("Erreur:", error.message);
    process.exit(1);
  }
}

main();

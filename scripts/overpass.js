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
const DELAY_BETWEEN_REQUESTS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function translateOpeningHours(osmHours) {
  if (!osmHours || osmHours === "") return "";

  const dayMap = {
    Mo: "Lundi",
    Tu: "Mardi",
    We: "Mercredi",
    Th: "Jeudi",
    Fr: "Vendredi",
    Sa: "Samedi",
    Su: "Dimanche",
    PH: "Jours feries",
  };

  const monthMap = {
    Jan: "Jan",
    Feb: "Fev",
    Mar: "Mar",
    Apr: "Avr",
    May: "Mai",
    Jun: "Juin",
    Jul: "Juil",
    Aug: "Aout",
    Sep: "Sep",
    Oct: "Oct",
    Nov: "Nov",
    Dec: "Dec",
  };

  let translated = osmHours;

  translated = translated.replace(/\s+off\b/gi, " Ferme");

  Object.entries(dayMap).forEach(([en, fr]) => {
    translated = translated.replace(new RegExp(`\\b${en}\\b`, "g"), fr);
  });

  Object.entries(monthMap).forEach(([en, fr]) => {
    translated = translated.replace(new RegExp(`\\b${en}\\b`, "g"), fr);
  });

  translated = translated.replace(/;\s*/g, "\n");
  translated = translated.replace(/,\s*/g, ", ");

  return translated;
}

function toGeoJSON(elements, cityName) {
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

    if (!properties["addr:city"] && cityName) {
      properties["addr:city"] = cityName;
    }

    if (properties.opening_hours) {
      properties.opening_hours = translateOpeningHours(
        properties.opening_hours,
      );
    }

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

async function fetchWithRetry(query, cityName, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`  Tentative ${attempt}/${maxRetries}...`);

      const response = await fetch(OVERPASS_BASE_URL, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");

      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.warn(`Reponse non-JSON recue pour ${cityName}:`);
        console.warn(text.substring(0, 200));

        if (attempt < maxRetries) {
          console.log(`Attente avant nouvelle tentative...`);
          await sleep(DELAY_BETWEEN_REQUESTS * attempt);
          continue;
        }
        throw new Error(`Reponse invalide apres ${maxRetries} tentatives`);
      }

      const data = await response.json();

      if (!data.elements) {
        throw new Error("Reponse JSON invalide: pas de propriete 'elements'");
      }

      return data;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`Erreur: ${error.message}`);
      console.log(`Attente avant nouvelle tentative...`);
      await sleep(DELAY_BETWEEN_REQUESTS * attempt);
    }
  }
}

async function fetchCoworkingSpots() {
  const allFeatures = [];

  for (const ville of GRANDES_VILLES) {
    const areaId = 3600000000 + ville.relation;

    const query = `
      [out:json][timeout:180];
      (
        node["amenity"="coworking_space"][name](area:${areaId});
        way["amenity"="coworking_space"][name](area:${areaId});
        node["office"="coworking"][name](area:${areaId});
        way["office"="coworking"][name](area:${areaId});
      );
      out center;
    `;

    console.log(`\nRecuperation des spots de coworking pour ${ville.name}...`);

    try {
      const data = await fetchWithRetry(query, ville.name);
      const geojson = toGeoJSON(data.elements, ville.name);
      allFeatures.push(...geojson.features);
      console.log(`OK: ${geojson.features.length} elements pour ${ville.name}`);
      await sleep(DELAY_BETWEEN_REQUESTS);
    } catch (error) {
      console.error(
        `ERREUR: Impossible de recuperer les donnees pour ${ville.name}: ${error.message}`,
      );
    }
  }

  return {
    type: "FeatureCollection",
    features: allFeatures,
  };
}

async function fetchLibraries() {
  const allFeatures = [];

  for (const ville of GRANDES_VILLES) {
    const areaId = 3600000000 + ville.relation;

    const query = `
      [out:json][timeout:180];
      (
        node["amenity"="library"][name](area:${areaId});
        way["amenity"="library"][name](area:${areaId});
        relation["amenity"="library"][name](area:${areaId});
      );
      out center;
    `;

    console.log(`\nRecuperation des bibliotheques pour ${ville.name}...`);

    try {
      const data = await fetchWithRetry(query, ville.name);
      const geojson = toGeoJSON(data.elements, ville.name);
      allFeatures.push(...geojson.features);
      console.log(`OK: ${geojson.features.length} elements pour ${ville.name}`);

      await sleep(DELAY_BETWEEN_REQUESTS);
    } catch (error) {
      console.error(
        `ERREUR: Impossible de recuperer les donnees pour ${ville.name}: ${error.message}`,
      );
    }
  }

  return {
    type: "FeatureCollection",
    features: allFeatures,
  };
}

async function fetchCofee() {
  const allFeatures = [];

  for (const ville of GRANDES_VILLES) {
    const areaId = 3600000000 + ville.relation;

    const query = `
      [out:json][timeout:180];
      (
        node["amenity"="cafe"]["internet_access"][name](area:${areaId});
        way["amenity"="cafe"]["internet_access"][name](area:${areaId});
        node["amenity"="cafe"]["socket"][name](area:${areaId});
        way["amenity"="cafe"]["socket"][name](area:${areaId});
      );
      out center;
    `;

    console.log(`\nRecuperation des cafes pour ${ville.name}...`);

    try {
      const data = await fetchWithRetry(query, ville.name);
      const geojson = toGeoJSON(data.elements, ville.name);
      allFeatures.push(...geojson.features);
      console.log(`OK: ${geojson.features.length} elements pour ${ville.name}`);
      await sleep(DELAY_BETWEEN_REQUESTS);
    } catch (error) {
      console.error(
        `ERREUR: Impossible de recuperer les donnees pour ${ville.name}: ${error.message}`,
      );
    }
  }

  return {
    type: "FeatureCollection",
    features: allFeatures,
  };
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
    const coworkingGeojson = await fetchCoworkingSpots();
    addTypeOfSites(coworkingGeojson, "Coworking");
    saveToFile(coworkingGeojson, "coworking_france.geojson");
    console.log(
      `\nTotal coworking: ${coworkingGeojson.features.length} features`,
    );
    console.log("Termine !");

    const cofeeGeojson = await fetchCofee();
    addTypeOfSites(cofeeGeojson, "Cofee");
    saveToFile(cofeeGeojson, "cofee_france.geojson");
    console.log(`\nTotal cafes: ${cofeeGeojson.features.length} features`);
    console.log("Termine !");

    const librariesGeojson = await fetchLibraries();
    addTypeOfSites(librariesGeojson, "Library");
    saveToFile(librariesGeojson, "libraries_france.geojson");
    console.log(
      `\nTotal bibliotheques: ${librariesGeojson.features.length} features`,
    );
    console.log("Termine !");
  } catch (error) {
    console.error("ERREUR:", error.message);
    process.exit(1);
  }
}

main();

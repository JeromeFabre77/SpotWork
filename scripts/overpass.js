const fs = require("fs");
const path = require("path");

const OVERPASS_BASE_URL = "https://overpass.kumi.systems/api/interpreter";

const GRANDES_VILLES = [
    {name: "Paris", relation: 3600071525},
    {name: "Marseille", relation: 3600076469},
    {name: "Lyon", relation: 3600120965},
    {name: "Toulouse", relation: 3600035738},
    {name: "Nice", relation: 3600170100},
];

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
    const allFeatures = [];

    for (const ville of GRANDES_VILLES) {
        const areaId = ville.relation;

        const query = `
      [out:json][timeout:120];
      (
        node["amenity"="coworking_space"][name](area:${areaId});
        way["amenity"="coworking_space"][name](area:${areaId});
        node["office"="coworking"][name](area:${areaId});
        way["office"="coworking"][name](area:${areaId});
      );
      out center;
    `;

        console.log(`Récupération des spots de coworking pour ${ville.name}...`);

        const response = await fetch(OVERPASS_BASE_URL, {
            method: "POST",
            body: `data=${encodeURIComponent(query)}`,
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        const geojson = toGeoJSON(data.elements, ville.name);
        allFeatures.push(...geojson.features);
        console.log(`  ✅ ${geojson.features.length} éléments pour ${ville.name}`);
    }

    return {
        type: "FeatureCollection",
        features: allFeatures,
    };
}

async function fetchLibraries() {
    const allFeatures = [];

    for (const ville of GRANDES_VILLES) {

        const areaId = ville.relation;

        const query = `
      [out:json][timeout:120];
      (
        node["amenity"="library"][name](area:${areaId});
        way["amenity"="library"][name](area:${areaId});
        relation["amenity"="library"][name](area:${areaId});
      );
      out center;
    `;

        console.log(`Récupération des bibliothèques pour ${ville.name}...`);

        const response = await fetch(OVERPASS_BASE_URL, {
            method: "POST",
            body: `data=${encodeURIComponent(query)}`,
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        const geojson = toGeoJSON(data.elements, ville.name);
        allFeatures.push(...geojson.features);
        console.log(`  ✅ ${geojson.features.length} éléments pour ${ville.name}`);
    }

    return {
        type: "FeatureCollection",
        features: allFeatures,
    };
}

async function fetchCofee() {
    const allFeatures = [];

    for (const ville of GRANDES_VILLES) {
        const areaId = ville.relation;

        const query = `
      [out:json][timeout:120];
      (
        node["amenity"="cafe"]["internet_access"][name](area:${areaId});
        way["amenity"="cafe"]["internet_access"][name](area:${areaId});
        node["amenity"="cafe"]["socket"][name](area:${areaId});
        way["amenity"="cafe"]["socket"][name](area:${areaId});
      );
      out center;
    `;

        console.log(`Récupération des cafés pour ${ville.name}...`);

        const response = await fetch(OVERPASS_BASE_URL, {
            method: "POST",
            body: `data=${encodeURIComponent(query)}`,
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        const geojson = toGeoJSON(data.elements, ville.name);
        allFeatures.push(...geojson.features);
        console.log(`  ✅ ${geojson.features.length} éléments pour ${ville.name}`);
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
        console.log(`📁 Total coworking: ${coworkingGeojson.features.length} features`);
        console.log("✅ Terminé !");

        const cofeeGeojson = await fetchCofee();
        addTypeOfSites(cofeeGeojson, "Cofee");
        saveToFile(cofeeGeojson, "cofee_france.geojson");
        console.log(`📁 Total cafés: ${cofeeGeojson.features.length} features`);
        console.log("✅ Terminé !");

        const librariesGeojson = await fetchLibraries();
        addTypeOfSites(librariesGeojson, "Library");
        saveToFile(librariesGeojson, "libraries_france.geojson");
        console.log(`📁 Total bibliothèques: ${librariesGeojson.features.length} features`);
        console.log("✅ Terminé !");
    } catch (error) {
        console.error("❌ Erreur: ", error.message);
        process.exit(1);
    }
}

main();

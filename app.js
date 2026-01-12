window.onload = () => {
  let map = L.map("map", { renderer: L.canvas(), preferCanvas: true }).setView(
    [48.8566, 2.3522],
    13,
  );
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    },
  ).addTo(map);

  fetchCoworkingData().then((data) => {
    addMarkersFromGeoJSON(map, data);

    data.features.forEach((feature) => {
      createTile({
        title: feature.properties.name,
        type: feature.properties.spotType,
        hours: feature.properties.opening_hours,
        phone: feature.properties.phone,
        website: feature.properties.website,
        description: feature.properties.description,
      });
    });
  });

  fetchLibraryData().then((data) => {
    addMarkersFromGeoJSON(map, data);

    data.features.forEach((feature) => {
      const props = feature.properties;
      createTile({
        title: props.nometablissement,
        type: props.spotType,
        hours: props.heuresouverture,
        phone: props.telephone,
        address:
          props.nomrue && props.codepostal && props.comune
            ? `${props.nomrue}, ${props.codepostal} ${props.comune}`
            : null,
        wifi: props.hasWifi,
        websiteUrl: props.accesweb,
      });
    });
  });

  fetchCofeeData().then((data) => {
    addMarkersFromGeoJSON(map, data);

    data.features.forEach((feature) => {
      createTile({
        title: feature.properties.name,
        type: feature.properties.spotType,
        hours: feature.properties.opening_hours,
        phone: feature.properties.phone,
        website: feature.properties.website,
      });
    });
  });
};

async function fetchCoworkingData() {
  return await fetch("data/coworking_france.geojson").then((response) =>
    response.json(),
  );
}

async function fetchLibraryData() {
  return await fetch("data/bibliotheques.geojson").then((response) =>
    response.json(),
  );
}

async function fetchCofeeData() {
  return await fetch("data/cofee_france.geojson").then((response) =>
    response.json(),
  );
}

const createTile = (data) => {
  const div = document.createElement("div");
  div.className = "tile";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "tile-checkbox";
  checkbox.addEventListener("change", (e) => {});

  div.appendChild(checkbox);

  const title = document.createElement("h3");
  title.textContent = data.title;
  div.appendChild(title);

  if (data.type) {
    const p = document.createElement("p");
    p.textContent = `Type: ${data.type}`;
    div.appendChild(p);
  }

  if (data.hours) {
    const p = document.createElement("p");
    p.textContent = `Horaires: ${data.hours}`;
    div.appendChild(p);
  }

  if (data.phone) {
    const p = document.createElement("p");
    p.textContent = `Téléphone: ${data.phone}`;
    div.appendChild(p);
  }

  if (data.address) {
    const p = document.createElement("p");
    p.textContent = data.address;
    div.appendChild(p);
  }
  if (data.wifi) {
    const p = document.createElement("p");
    p.textContent = "Wifi: Oui";
    div.appendChild(p);
  }
  if (data.website) {
    const a = document.createElement("a");
    a.href = data.website;
    a.textContent = data.website;
    a.target = "_blank";
    div.appendChild(a);
  }
  if (data.websiteUrl) {
    const button = document.createElement("button");
    button.textContent = "Site web";
    button.addEventListener("click", () =>
      window.open(data.websiteUrl, "_blank"),
    );
    div.appendChild(button);
  }

  if (data.description) {
    const p = document.createElement("p");
    p.textContent = data.description;
    div.appendChild(p);
  }

  document.querySelector(".spots").appendChild(div);
};

function defineIcon(type) {
  switch (type) {
    case "Library":
      return "./assets/icons/markers/Library.png";
    case "Cofee":
      return "./assets/icons/markers/Cofee.png";
    case "Coworking":
      return "./assets/icons/markers/Coworking.png";
    case "Wifi":
      return "./assets/icons/markers/Wifi.png";
    default:
      return;
  }
}
function addMarkersFromGeoJSON(map, geojson) {
  if (!geojson) return L.layerGroup().addTo(map);

  const features = Array.isArray(geojson) ? geojson : geojson.features || [];
  const group = L.layerGroup().addTo(map);
  let markers = [];

  markers = features
    .filter(hasValidProperties)
    .filter(hasValidGeometry)
    .map((feature) => ({
      marker: createMarker(feature),
      coords: L.latLng(
        feature.geometry.coordinates[1],
        feature.geometry.coordinates[0],
      ),
    }));

  const updateMarkers = () => {
    const zoom = map.getZoom();
    const bounds = map.getBounds();

    group.clearLayers();

    const maxMarkers = zoom < 10 ? 50 : zoom < 13 ? 200 : 1000;

    markers
      .filter((m) => bounds.contains(m.coords))
      .slice(0, maxMarkers)
      .forEach((m) => m.marker.addTo(group));
  };

  map.on("zoomend moveend", updateMarkers);

  updateMarkers();

  return group;
}

const hasValidProperties = (feature) =>
  feature.properties?.name || feature.properties?.nometablissement;

const hasValidGeometry = (feature) => {
  const coords = feature?.geometry?.coordinates;
  return (
    feature?.geometry?.type === "Point" &&
    Array.isArray(coords) &&
    coords.length >= 2
  );
};

const createMarker = (feature) => {
  const { coordinates } = feature.geometry;
  const [lng, lat] = coordinates;
  const props = feature.properties;

  const marker = L.marker([lat, lng], {
    title: props.name || props.nometablissement,
  });

  marker.bindPopup(props.name || props.nometablissement);
  marker.setIcon(createMarkerIcon(props.spotType));

  return marker;
};

const createMarkerIcon = (spotType) => {
  return L.icon({
    iconUrl: defineIcon(spotType),
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

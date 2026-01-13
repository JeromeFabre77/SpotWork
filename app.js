const filterState = {
  type: "",
  city: "",
  wifi: "",
};

const markerUpdaters = [];

const getWifiStatus = (props) => {
  if (!props) return "";
  if (props.hasWifi === true) return "available";
  if (props.hasWifi === false) return "not-available";
  const access = String(props.internet_access || "").toLowerCase().trim();
  if (access === "wlan" || access === "yes") return "available";
  if (access) return "not-available";
  return "";
};

const cityBounds = {
  Paris: { north: 48.902, south: 48.815, west: 2.224, east: 2.469 },
  Lyon: { north: 45.82, south: 45.72, west: 4.77, east: 4.9 },
  Marseille: { north: 43.37, south: 43.23, west: 5.25, east: 5.44 },
  Toulouse: { north: 43.67, south: 43.56, west: 1.36, east: 1.5 },
  Nice: { north: 43.75, south: 43.66, west: 7.19, east: 7.32 },
};

const isInCityBounds = (lat, lng, city) => {
  if (!city) return true;
  const bounds = cityBounds[city];
  if (!bounds) return true;
  return (
    lat <= bounds.north &&
    lat >= bounds.south &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
};

const isTileInCity = (tile, city) => {
  if (!city) return true;
  const lat = Number.parseFloat(tile.dataset.lat);
  const lng = Number.parseFloat(tile.dataset.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return isInCityBounds(lat, lng, city);
};

const applyFilters = () => {
  const tiles = document.querySelectorAll(".tile");
  tiles.forEach((tile) => {
    const tileType = tile.dataset.type || "";
    const matchesType = !filterState.type || tileType === filterState.type;
    const matchesCity = isTileInCity(tile, filterState.city);
    const tileWifi = tile.dataset.wifi || "";
    const matchesWifi = !filterState.wifi || tileWifi === filterState.wifi;
    tile.style.display = matchesType && matchesCity && matchesWifi ? "" : "none";
  });
};

const applyMarkerFilters = () => {
  markerUpdaters.forEach((update) => update());
};

window.onload = () => {
  const defaultView = { center: [48.8566, 2.3522], zoom: 13 };
  let map = L.map("map", { renderer: L.canvas(), preferCanvas: true }).setView(
    defaultView.center,
    defaultView.zoom,
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
      const coords = feature?.geometry?.coordinates || [];
      createTile({
        title: feature.properties.name,
        type: feature.properties.spotType,
        lat: coords[1],
        lng: coords[0],
        wifi: getWifiStatus(feature.properties),
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
      const coords = feature?.geometry?.coordinates || [];
      createTile({
        title: props.nometablissement,
        type: props.spotType,
        lat: coords[1],
        lng: coords[0],
        hours: props.heuresouverture,
        phone: props.telephone,
        address:
          props.nomrue && props.codepostal && props.comune
            ? `${props.nomrue}, ${props.codepostal} ${props.comune}`
            : null,
        wifi: getWifiStatus(props),
        websiteUrl: props.accesweb,
      });
    });
  });

  fetchCofeeData().then((data) => {
    addMarkersFromGeoJSON(map, data);

    data.features.forEach((feature) => {
      const coords = feature?.geometry?.coordinates || [];
      createTile({
        title: feature.properties.name,
        type: feature.properties.spotType,
        lat: coords[1],
        lng: coords[0],
        wifi: getWifiStatus(feature.properties),
        hours: feature.properties.opening_hours,
        phone: feature.properties.phone,
        website: feature.properties.website,
      });
    });
  });

  const typeSelect = document.getElementById("type");
  if (typeSelect) {
    typeSelect.addEventListener("change", (event) => {
      filterState.type = event.target.value;
      applyFilters();
      applyMarkerFilters();
    });
  }

  const citySelect = document.getElementById("city");
  if (citySelect) {
    citySelect.addEventListener("change", (event) => {
      filterState.city = event.target.value;
      applyFilters();
      applyMarkerFilters();
      if (!filterState.city) {
        map.setView(defaultView.center, defaultView.zoom);
        return;
      }
      const bounds = cityBounds[filterState.city];
      if (bounds) {
        map.fitBounds(
          L.latLngBounds(
            [bounds.south, bounds.west],
            [bounds.north, bounds.east],
          ),
        );
      }
    });
  }

  const wifiSelect = document.getElementById("wifi");
  if (wifiSelect) {
    wifiSelect.addEventListener("change", (event) => {
      filterState.wifi = event.target.value;
      applyFilters();
      applyMarkerFilters();
    });
  }

  const resetButton = document.getElementById("reset");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      filterState.type = "";
      filterState.city = "";
      filterState.wifi = "";
      if (typeSelect) typeSelect.value = "";
      if (citySelect) citySelect.value = "";
      if (wifiSelect) wifiSelect.value = "";
      applyFilters();
      applyMarkerFilters();
      map.setView(defaultView.center, defaultView.zoom);
    });
  }
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
  div.dataset.type = data.type || "";
  div.dataset.wifi = data.wifi || "";
  if (Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
    div.dataset.lat = data.lat;
    div.dataset.lng = data.lng;
  }

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
  if (data.wifi === "available") {
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
  applyFilters();
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
        type: feature.properties?.spotType || "",
        wifi: getWifiStatus(feature.properties),
      }));

  const updateMarkers = () => {
    const zoom = map.getZoom();
    const bounds = map.getBounds();

    group.clearLayers();

    const maxMarkers = zoom < 10 ? 50 : zoom < 13 ? 200 : 1000;

    markers
      .filter((m) => !filterState.type || m.type === filterState.type)
      .filter(
        (m) =>
          !filterState.city ||
          isInCityBounds(m.coords.lat, m.coords.lng, filterState.city),
      )
      .filter((m) => !filterState.wifi || m.wifi === filterState.wifi)
      .filter((m) => bounds.contains(m.coords))
      .slice(0, maxMarkers)
      .forEach((m) => m.marker.addTo(group));
  };

  map.on("zoomend moveend", updateMarkers);
  markerUpdaters.push(updateMarkers);

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

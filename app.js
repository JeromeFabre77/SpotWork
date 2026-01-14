// =============================================================================
// STATE MANAGEMENT
// =============================================================================

const state = {
  filters: {
    city: "",
    type: "",
    wifi: "",
  },
  map: null,
  allMarkers: [],
  allTiles: [],
  markerGroup: null,
};

// Coordonnées des villes
const CITY_COORDINATES = {
  Paris: [48.8566, 2.3522],
  Lyon: [45.764, 4.8357],
  Marseille: [43.2965, 5.3698],
  Toulouse: [43.6047, 1.4442],
  Nice: [43.7102, 7.262],
};

// =============================================================================
// UTILITIES
// =============================================================================

const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

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

// Extraire la ville d'un feature
const getCity = (props) => {
  return props.commune || props.city || props["addr:city"] || "";
};

// Vérifier si un spot a le WiFi
const hasWifi = (props) => {
  return (
    props.hasWifi === true ||
    props.wifi === true ||
    props.internet_access === "wlan" ||
    props.internet_access === "yes"
  );
};

// =============================================================================
// DATA FETCHING
// =============================================================================

const fetchCoworkingData = () =>
  fetch("data/coworking_france.geojson").then((res) => res.json());

const fetchLibraryData = () =>
  fetch("data/bibliotheques.geojson").then((res) => res.json());

const fetchCofeeData = () =>
  fetch("data/cofee_france.geojson").then((res) => res.json());

// =============================================================================
// FILTERS
// =============================================================================

const matchesFilters = (feature) => {
  const props = feature.properties;
  const filters = state.filters;

  if (filters.city) {
    const city = getCity(props);
    if (!city || !city.toLowerCase().includes(filters.city.toLowerCase())) {
      return false;
    }
  }

  if (filters.type && props.spotType !== filters.type) {
    return false;
  }

  if (filters.wifi !== "") {
    const spotHasWifi = hasWifi(props);
    const wifiRequired = filters.wifi === "true";
    if (spotHasWifi !== wifiRequired) {
      return false;
    }
  }

  return true;
};

const getFilteredMarkers = () => {
  return state.allMarkers.filter(({ feature }) => matchesFilters(feature));
};

const applyFilters = () => {
  console.log("Filtres appliqués:", state.filters);

  const filteredMarkers = getFilteredMarkers();
  console.log(
    `${filteredMarkers.length} / ${state.allMarkers.length} spots trouvés`,
  );
  updateMapMarkers(filteredMarkers);

  updateTilesVisibility();

  centerMapOnFilters(filteredMarkers);
};

const centerMapOnFilters = (filteredMarkers) => {
  if (state.filters.city && CITY_COORDINATES[state.filters.city]) {
    state.map.setView(CITY_COORDINATES[state.filters.city], 12);
  } else if (filteredMarkers.length > 0) {
    const bounds = L.latLngBounds(filteredMarkers.map((m) => m.coords));
    state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }
};

const resetFilters = () => {
  state.filters.city = "";
  state.filters.type = "";
  state.filters.wifi = "";

  document.getElementById("city").value = "";
  document.getElementById("type").value = "";
  document.getElementById("wifi").value = "";

  applyFilters();
  state.map.setView([48.8566, 2.3522], 13);
};

const initializeFilters = () => {
  document.getElementById("city").addEventListener("change", (e) => {
    state.filters.city = e.target.value;
    applyFilters();
  });

  document.getElementById("type").addEventListener("change", (e) => {
    state.filters.type = e.target.value;
    applyFilters();
  });

  document.getElementById("wifi").addEventListener("change", (e) => {
    state.filters.wifi = e.target.value;
    applyFilters();
  });

  document.getElementById("reset").addEventListener("click", resetFilters);
};

// =============================================================================
// MARKERS
// =============================================================================

const defineIcon = (type) => {
  const icons = {
    Library: "./assets/icons/markers/Library.png",
    Cofee: "./assets/icons/markers/Cofee.png",
    Coworking: "./assets/icons/markers/Coworking.png",
    Wifi: "./assets/icons/markers/Wifi.png",
  };
  return icons[type];
};

const createMarker = (feature) => {
  const { coordinates } = feature.geometry;
  const [lng, lat] = coordinates;
  const props = feature.properties;

  const marker = L.marker([lat, lng], {
    title: props.name || props.nometablissement,
  });

  marker.bindPopup(props.name || props.nometablissement);

  marker.setIcon(
    L.icon({
      iconUrl: defineIcon(props.spotType),
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    }),
  );

  return marker;
};

const initializeMarkers = () => {
  state.markerGroup = L.layerGroup().addTo(state.map);
  const markerCache = new Map();

  const updateVisibleMarkers = () => {
    const bounds = state.map.getBounds();
    const zoom = state.map.getZoom();

    state.markerGroup.clearLayers();

    const maxMarkers =
      zoom < 10 ? 100 : zoom < 12 ? 300 : zoom < 14 ? 600 : 1000;

    const filteredMarkers = getFilteredMarkers();
    const visibleMarkers = filteredMarkers
      .filter((m) => bounds.contains(m.coords))
      .slice(0, maxMarkers);

    visibleMarkers.forEach((markerData) => {
      const key = `${markerData.coords.lat}_${markerData.coords.lng}`;

      if (!markerCache.has(key)) {
        markerCache.set(key, createMarker(markerData.feature));
      }

      markerCache.get(key).addTo(state.markerGroup);
    });
  };

  const debouncedUpdate = debounce(updateVisibleMarkers, 200);

  state.map.on("moveend", debouncedUpdate);
  state.map.on("zoomend", debouncedUpdate);

  updateVisibleMarkers();
};

const updateMapMarkers = (filteredMarkers) => {
  if (!state.markerGroup) return;

  const bounds = state.map.getBounds();
  const zoom = state.map.getZoom();
  const maxMarkers = zoom < 10 ? 100 : zoom < 12 ? 300 : zoom < 14 ? 600 : 1000;

  state.markerGroup.clearLayers();

  const markerCache = new Map();
  const visibleMarkers = filteredMarkers
    .filter((m) => bounds.contains(m.coords))
    .slice(0, maxMarkers);

  visibleMarkers.forEach((markerData) => {
    const key = `${markerData.coords.lat}_${markerData.coords.lng}`;
    if (!markerCache.has(key)) {
      markerCache.set(key, createMarker(markerData.feature));
    }
    markerCache.get(key).addTo(state.markerGroup);
  });
};

// =============================================================================
// TILES
// =============================================================================

const createTile = (data, feature) => {
  const div = document.createElement("div");
  div.className = "tile";
  div.style.animationDelay = `${state.allTiles.length * 0.03}s`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "tile-checkbox";
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
  state.allTiles.push({ div, feature });
};

const updateTilesVisibility = () => {
  state.allTiles.forEach(({ div, feature }) => {
    div.style.display = matchesFilters(feature) ? "block" : "none";
  });
};

// =============================================================================
// DATA PROCESSING
// =============================================================================

const processCoworkingData = (data) => {
  if (!data?.features) return;

  data.features.forEach((feature) => {
    if (!hasValidProperties(feature) || !hasValidGeometry(feature)) return;

    const props = feature.properties;

    state.allMarkers.push({
      feature,
      coords: L.latLng(
        feature.geometry.coordinates[1],
        feature.geometry.coordinates[0],
      ),
    });

    createTile(
      {
        title: props.name,
        type: props.spotType,
        hours: props.opening_hours,
        phone: props.phone,
        website: props.website,
        description: props.description,
        wifi: hasWifi(props),
      },
      feature,
    );
  });
};

const processLibraryData = (data) => {
  if (!data?.features) return;

  data.features.forEach((feature) => {
    if (!hasValidProperties(feature) || !hasValidGeometry(feature)) return;

    const props = feature.properties;

    state.allMarkers.push({
      feature,
      coords: L.latLng(
        feature.geometry.coordinates[1],
        feature.geometry.coordinates[0],
      ),
    });

    createTile(
      {
        title: props.nometablissement,
        type: props.spotType,
        hours: props.heuresouverture,
        phone: props.telephone,
        address:
          props.nomrue && props.codepostal && props.commune
            ? `${props.nomrue}, ${props.codepostal} ${props.commune}`
            : null,
        wifi: hasWifi(props),
        websiteUrl: props.accesweb,
      },
      feature,
    );
  });
};

const processCofeeData = (data) => {
  if (!data?.features) return;

  data.features.forEach((feature) => {
    if (!hasValidProperties(feature) || !hasValidGeometry(feature)) return;

    const props = feature.properties;

    state.allMarkers.push({
      feature,
      coords: L.latLng(
        feature.geometry.coordinates[1],
        feature.geometry.coordinates[0],
      ),
    });

    createTile(
      {
        title: props.name,
        type: props.spotType,
        hours: props.opening_hours,
        phone: props.phone,
        website: props.website,
        wifi: hasWifi(props),
      },
      feature,
    );
  });
};

// =============================================================================
// INITIALIZATION
// =============================================================================

window.onload = () => {
  // Créer la carte
  state.map = L.map("map", {
    renderer: L.canvas(),
    preferCanvas: true,
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
  }).setView([48.8566, 2.3522], 13);

  // Ajouter les tuiles de la carte
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
    },
  ).addTo(state.map);

  initializeFilters();

  Promise.all([
    fetchCoworkingData(),
    fetchLibraryData(),
    fetchCofeeData(),
  ]).then(([coworkingData, libraryData, cofeeData]) => {
    processCoworkingData(coworkingData);
    processLibraryData(libraryData);
    processCofeeData(cofeeData);
    initializeMarkers();
  });
};

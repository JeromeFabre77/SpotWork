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
  allTilesData: [],
  markerGroup: null,
  pagination: {
    currentCount: 20,
    increment: 20,
  },
  modal: {
    isOpen: false,
    currentData: null,
  },
};

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
  feature.properties?.name && feature.properties?.opening_hours !== "closed";

const hasValidGeometry = (feature) => {
  const coords = feature?.geometry?.coordinates;
  return (
    feature?.geometry?.type === "Point" &&
    Array.isArray(coords) &&
    coords.length >= 2
  );
};

const getCity = (props) => {
  return (
    props["addr:city"] ||
    props["contact:city"] ||
    props.city ||
    props.commune ||
    ""
  );
};

const hasWifi = (props) => {
  return (
    props.hasWifi === true ||
    props.wifi === true ||
    props.internet_access === "wlan" ||
    props.internet_access === "yes"
  );
};

const getWifiFeeStatus = (props) => {
  const fee = props["internet_access:fee"];
  if (fee === "no") return "gratuit";
  if (fee === "customers") return "clients";
  if (fee === "yes") return "payant";
  return null;
};

const getWheelchairStatus = (props) => {
  const status = props.wheelchair;
  if (status === "yes") return "accessible";
  if (status === "limited") return "partiel";
  if (status === "no") return "non accessible";
  return null;
};

const getSeatingInfo = (props) => {
  const indoor = props.indoor_seating === "yes";
  const outdoor =
    props.outdoor_seating === "yes" || props.outdoor_seating === "sidewalk";
  return { indoor, outdoor };
};

const isTemporarilyClosed = (props) => {
  return props.closed === "yes" || props.temporary === "yes";
};

const getTypeIconPath = (type) => {
  const icons = {
    Library: "./assets/icons/library.svg",
    Cofee: "./assets/icons/cofee.svg",
    Coworking: "./assets/icons/coworking.svg",
  };
  return icons[type] || null;
};

// =============================================================================
// MODAL
// =============================================================================

const initializeModal = () => {
  const modal = document.getElementById("spot-modal");
  const closeBtn = modal.querySelector(".modal-close");
  closeBtn.addEventListener("click", closeModal);
};

const createInfoItem = (label, value) => {
  return `
    <div class="modal-info-item">
      <div class="modal-info-label">${label}</div>
      <div class="modal-info-value">${value}</div>
    </div>
  `;
};

const openModal = (data, feature) => {
  const modal = document.getElementById("spot-modal");

  state.modal.isOpen = true;
  state.modal.currentData = { data, feature };

  const modalIcon = document.getElementById("modal-icon");
  const iconPath = getTypeIconPath(data.type);
  if (iconPath) {
    modalIcon.innerHTML = `<img src="${iconPath}" alt="${data.type}" style="width: 24px; height: 24px;">`;
  } else {
    modalIcon.textContent = "";
  }
  document.getElementById("modal-title").textContent = data.title;
  const typeBadge = document.getElementById("modal-type");
  if (data.type) {
    typeBadge.textContent = data.type;
    typeBadge.style.display = "";
  } else {
    typeBadge.style.display = "none";
  }

  const infoGrid = document.getElementById("modal-info-grid");
  let infoHTML = "";

  if (data.address) {
    infoHTML += createInfoItem("Adresse", data.address);
  }

  if (data.hours) {
    const hoursFormatted = data.hours.replace(/\n/g, "<br>");
    infoHTML += createInfoItem("Horaires", hoursFormatted);
  }

  if (data.phone) {
    infoHTML += createInfoItem(
      "Téléphone",
      `<a href="tel:${data.phone}">${data.phone}</a>`,
    );
  }

  if (data.email) {
    infoHTML += createInfoItem(
      "Email",
      `<a href="mailto:${data.email}">${data.email}</a>`,
    );
  }

  const wifiStatus = data.wifi
    ? '<span class="wifi-available">✓ Disponible</span>'
    : '<span class="wifi-unavailable">✗ Non disponible</span>';
  infoHTML += createInfoItem("Wifi", wifiStatus);

  if (data.wheelchair) {
    infoHTML += createInfoItem("Accessibilité", data.wheelchair);
  }

  if (data.operator) {
    infoHTML += createInfoItem("Type", data.operator);
  }

  if (data.seating) {
    const seatingText = [];
    if (data.seating.indoor) seatingText.push("Intérieur");
    if (data.seating.outdoor) seatingText.push("Terrasse");
    if (seatingText.length > 0) {
      infoHTML += createInfoItem("Places", seatingText.join(", "));
    }
  }

  if (data.airConditioning) {
    infoHTML += createInfoItem("Climatisation", "Oui");
  }

  if (data.smoking) {
    const smokingText =
      data.smoking === "outside"
        ? "Fumoir extérieur"
        : data.smoking === "no"
          ? "Non-fumeur"
          : data.smoking;
    infoHTML += createInfoItem("Fumeur", smokingText);
  }

  infoGrid.innerHTML = infoHTML;

  const descSection = document.getElementById("modal-description-section");
  const descText = document.getElementById("modal-description");
  if (data.description) {
    descText.textContent = data.description;
    descSection.style.display = "";
  } else {
    descSection.style.display = "none";
  }
  const actionsContainer = document.getElementById("modal-actions");
  actionsContainer.innerHTML = "";

  if (data.website || data.websiteUrl) {
    const websiteBtn = document.createElement("button");
    websiteBtn.className = "modal-btn modal-btn-primary";
    websiteBtn.textContent = "Visiter le site web";
    websiteBtn.addEventListener("click", () => {
      window.open(data.website || data.websiteUrl, "_blank");
    });
    actionsContainer.appendChild(websiteBtn);
  }

  if (data.wikipedia) {
    const wikiBtn = document.createElement("button");
    wikiBtn.className = "modal-btn modal-btn-secondary";
    wikiBtn.textContent = "Wikipedia";
    wikiBtn.addEventListener("click", () => {
      const wikiUrl = data.wikipedia.startsWith("http")
        ? data.wikipedia
        : `https://fr.wikipedia.org/wiki/${data.wikipedia.replace("fr:", "")}`;
      window.open(wikiUrl, "_blank");
    });
    actionsContainer.appendChild(wikiBtn);
  }

  if (data.wikidata) {
    const wikidataBtn = document.createElement("button");
    wikidataBtn.className = "modal-btn modal-btn-secondary";
    wikidataBtn.textContent = "Wikidata";
    wikidataBtn.addEventListener("click", () => {
      window.open(`https://www.wikidata.org/wiki/${data.wikidata}`, "_blank");
    });
    actionsContainer.appendChild(wikidataBtn);
  }

  const mapBtn = document.createElement("button");
  mapBtn.className = "modal-btn modal-btn-secondary";
  mapBtn.textContent = "Voir sur la carte";
  mapBtn.addEventListener("click", () => {
    const coords = feature.geometry.coordinates;
    state.map.setView([coords[1], coords[0]], 40);
    closeModal();
  });
  actionsContainer.appendChild(mapBtn);

  modal.classList.add("modal-open");
  document.body.style.overflow = "hidden";
};

const closeModal = () => {
  const modal = document.getElementById("spot-modal");
  modal.classList.remove("modal-open");
  state.modal.isOpen = false;
  state.modal.currentData = null;
  document.body.style.overflow = "";
};

// =============================================================================
// DATA FETCHING
// =============================================================================

const fetchCoworkingData = () =>
  fetch("data/coworking_france.geojson").then((res) => res.json());

const fetchLibraryData = () =>
  fetch("data/libraries_france.geojson").then((res) => res.json());

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
  state.pagination.currentCount = 20;

  const filteredMarkers = getFilteredMarkers();
  centerMapOnFilters(filteredMarkers);
  requestAnimationFrame(() => {
    updateMapMarkers(filteredMarkers);
    rebuildTilesList();
  });
};

const centerMapOnFilters = (filteredMarkers) => {
  if (state.filters.city && CITY_COORDINATES[state.filters.city]) {
    state.map.setView(CITY_COORDINATES[state.filters.city], 12);
    return;
  }

  if (filteredMarkers.length > 0) {
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

const debouncedApplyFilters = debounce(applyFilters, 150);

const initializeFilters = () => {
  document.getElementById("city").addEventListener("change", (e) => {
    state.filters.city = e.target.value;
    debouncedApplyFilters();
  });

  document.getElementById("type").addEventListener("change", (e) => {
    state.filters.type = e.target.value;
    debouncedApplyFilters();
  });

  document.getElementById("wifi").addEventListener("change", (e) => {
    state.filters.wifi = e.target.value;
    debouncedApplyFilters();
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
    title: props.name,
  });

  marker.bindPopup(props.name);

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
// TILES - PAGINATION
// =============================================================================

const createTileElement = (data, feature) => {
  const div = document.createElement("div");
  div.className = "tile";

  if (data.temporarilyClosed) {
    const closedWarning = document.createElement("div");
    closedWarning.className = "tile-warning";
    closedWarning.textContent =
      data.closedDescription || "Temporairement fermé";
    div.appendChild(closedWarning);
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "tile-checkbox";
  checkbox.addEventListener("click", (e) => e.stopPropagation());
  div.appendChild(checkbox);

  const header = document.createElement("div");
  header.className = "tile-header";

  const titleContainer = document.createElement("div");
  titleContainer.className = "tile-title-container";

  const icon = document.createElement("span");
  icon.className = "tile-icon";

  const iconPath = getTypeIconPath(data.type);
  if (iconPath) {
    const img = document.createElement("img");
    img.src = iconPath;
    img.alt = data.type;
    img.style.width = "24px";
    img.style.height = "24px";
    icon.appendChild(img);
  } else {
    icon.textContent = "📍";
  }

  const title = document.createElement("h3");
  title.textContent = data.title;

  titleContainer.appendChild(icon);
  titleContainer.appendChild(title);
  header.appendChild(titleContainer);

  if (data.type) {
    const typeBadge = document.createElement("span");
    typeBadge.className = "tile-type-badge";
    typeBadge.textContent = data.type;
    header.appendChild(typeBadge);
  }

  div.appendChild(header);

  const infoContainer = document.createElement("div");
  infoContainer.className = "tile-info";

  if (data.address) {
    const addressP = document.createElement("p");
    addressP.className = "tile-address";
    addressP.innerHTML = `<span class="tile-label"></span> ${data.address}`;
    infoContainer.appendChild(addressP);
  }

  if (data.hours) {
    const hoursP = document.createElement("p");
    hoursP.className = "tile-hours";
    const hoursText = data.hours.split("\n")[0];
    hoursP.innerHTML = `<span class="tile-label"></span> ${hoursText}`;
    infoContainer.appendChild(hoursP);
  }

  if (data.email) {
    const emailP = document.createElement("p");
    emailP.className = "tile-email";
    emailP.innerHTML = `<span class="tile-label"></span><a href="mailto:${data.email}">${data.email}</a>`;
    infoContainer.appendChild(emailP);
  }

  const quickInfo = document.createElement("div");
  quickInfo.className = "tile-quick-info";

  if (data.wifi !== undefined) {
    const wifiSpan = document.createElement("span");
    wifiSpan.className = `tile-wifi ${data.wifi ? "wifi-yes" : "wifi-no"}`;
    let wifiText = data.wifi ? "Wifi" : "Pas de wifi";
    if (data.wifi && data.wifiFee) {
      wifiText += ` (${data.wifiFee})`;
    }
    wifiSpan.textContent = wifiText;
    quickInfo.appendChild(wifiSpan);
  }

  if (data.wheelchair) {
    const wheelchairSpan = document.createElement("span");
    wheelchairSpan.className = `tile-badge tile-wheelchair wheelchair-${data.wheelchair.replace(" ", "-")}`;
    wheelchairSpan.textContent = data.wheelchair;
    quickInfo.appendChild(wheelchairSpan);
  }

  if (data.seating) {
    if (data.seating.indoor) {
      const indoorSpan = document.createElement("span");
      indoorSpan.className = "tile-badge tile-seating";
      indoorSpan.textContent = "Intérieur";
      quickInfo.appendChild(indoorSpan);
    }
    if (data.seating.outdoor) {
      const outdoorSpan = document.createElement("span");
      outdoorSpan.className = "tile-badge tile-seating";
      outdoorSpan.textContent = "Terrasse";
      quickInfo.appendChild(outdoorSpan);
    }
  }

  if (data.airConditioning) {
    const acSpan = document.createElement("span");
    acSpan.className = "tile-badge tile-ac";
    acSpan.textContent = "Climatisé";
    quickInfo.appendChild(acSpan);
  }

  if (data.smoking) {
    const smokingSpan = document.createElement("span");
    smokingSpan.className = "tile-badge tile-smoking";
    smokingSpan.textContent =
      data.smoking === "outside" ? "Fumoir ext." : "Non-fumeur";
    quickInfo.appendChild(smokingSpan);
  }

  if (data.operator) {
    const operatorSpan = document.createElement("span");
    operatorSpan.className = "tile-badge tile-operator";
    operatorSpan.textContent = data.operator;
    quickInfo.appendChild(operatorSpan);
  }

  if (data.phone) {
    const phoneSpan = document.createElement("span");
    phoneSpan.className = "tile-phone";
    phoneSpan.textContent = data.phone;
    quickInfo.appendChild(phoneSpan);
  }

  if (quickInfo.children.length > 0) {
    infoContainer.appendChild(quickInfo);
  }

  div.appendChild(infoContainer);

  const moreBtn = document.createElement("button");
  moreBtn.className = "tile-more-btn";
  moreBtn.textContent = "Voir les détails";
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openModal(data, feature);
  });
  div.appendChild(moreBtn);

  div.addEventListener("click", () => {
    openModal(data, feature);
  });

  return div;
};

const storeTileData = (data, feature) => {
  state.allTilesData.push({ data, feature });
};

const rebuildTilesList = () => {
  const container = document.querySelector(".spots");

  container.innerHTML = "";
  const filteredData = state.allTilesData.filter(({ feature }) =>
    matchesFilters(feature),
  );

  const tilesToShow = filteredData.slice(0, state.pagination.currentCount);

  const fragment = document.createDocumentFragment();

  tilesToShow.forEach(({ data, feature }) => {
    fragment.appendChild(createTileElement(data, feature));
  });

  container.appendChild(fragment);

  if (filteredData.length > state.pagination.currentCount) {
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.className = "load-more-btn";
    loadMoreBtn.textContent = `Charger plus (${filteredData.length - state.pagination.currentCount} restants)`;
    loadMoreBtn.addEventListener("click", loadMoreTiles);
    container.appendChild(loadMoreBtn);
  } else if (filteredData.length > 0) {
    const endMessage = document.createElement("div");
    endMessage.className = "end-message";
    endMessage.textContent = "Tous les résultats sont affichés";
    container.appendChild(endMessage);
  }
};

const loadMoreTiles = () => {
  state.pagination.currentCount += state.pagination.increment;
  rebuildTilesList();
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

    storeTileData(
      {
        title: props.name,
        type: props.spotType,
        hours: props.opening_hours,
        phone: props.phone,
        email: props.email || props["contact:email"],
        website: props.website,
        description: props.description,
        wifi: hasWifi(props),
        wifiFee: getWifiFeeStatus(props),
        wheelchair: getWheelchairStatus(props),
        seating: getSeatingInfo(props),
        airConditioning: props.air_conditioning === "yes",
        smoking: props.smoking,
        operator:
          props["operator:type"] === "government"
            ? "Public"
            : props["operator:type"] === "private"
              ? "Privé"
              : null,
        temporarilyClosed: isTemporarilyClosed(props),
        closedDescription: props["closed:description"],
        wikipedia: props.wikipedia,
        wikidata: props.wikidata,
        address:
          props["addr:street"] && props["addr:postcode"] && getCity(props)
            ? `${props["addr:street"]}, ${props["addr:postcode"]} ${getCity(props)}`
            : getCity(props) || null,
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

    const street = props["addr:street"] || props["contact:street"] || "";
    const postcode = props["addr:postcode"] || props["contact:postcode"] || "";
    const city = getCity(props);
    const address =
      street && postcode && city
        ? `${street}, ${postcode} ${city}`
        : street && city
          ? `${street}, ${city}`
          : null;

    storeTileData(
      {
        title: props.name,
        type: props.spotType,
        hours: props.opening_hours,
        phone: props.phone || props["contact:phone"],
        email: props.email || props["contact:email"],
        address: address,
        wifi: hasWifi(props),
        wifiFee: getWifiFeeStatus(props),
        wheelchair: getWheelchairStatus(props),
        operator:
          props["operator:type"] === "government"
            ? "Public"
            : props["operator:type"] === "private"
              ? "Privé"
              : null,
        temporarilyClosed: isTemporarilyClosed(props),
        closedDescription: props["closed:description"],
        wikipedia: props.wikipedia,
        wikidata: props.wikidata,
        websiteUrl: props.website || props["contact:website"],
        description: props.description,
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

    storeTileData(
      {
        title: props.name,
        type: props.spotType,
        hours: props.opening_hours,
        phone: props.phone,
        email: props.email || props["contact:email"],
        website: props.website,
        wifi: hasWifi(props),
        wifiFee: getWifiFeeStatus(props),
        wheelchair: getWheelchairStatus(props),
        seating: getSeatingInfo(props),
        airConditioning: props.air_conditioning === "yes",
        smoking: props.smoking,
        temporarilyClosed: isTemporarilyClosed(props),
        closedDescription: props["closed:description"],
        wikipedia: props.wikipedia,
        wikidata: props.wikidata,
        address:
          props["addr:street"] && props["addr:postcode"] && getCity(props)
            ? `${props["addr:street"]}, ${props["addr:postcode"]} ${getCity(props)}`
            : getCity(props) || null,
      },
      feature,
    );
  });
};

// =============================================================================
// INITIALIZATION
// =============================================================================

window.onload = () => {
  state.map = L.map("map", {
    renderer: L.canvas(),
    preferCanvas: true,
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
  }).setView([48.8566, 2.3522], 13);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
    },
  ).addTo(state.map);

  initializeFilters();
  initializeModal();

  Promise.all([
    fetchCoworkingData(),
    fetchLibraryData(),
    fetchCofeeData(),
  ]).then(([coworkingData, libraryData, cofeeData]) => {
    processCoworkingData(coworkingData);
    processLibraryData(libraryData);
    processCofeeData(cofeeData);
    initializeMarkers();
    rebuildTilesList();
  });
};

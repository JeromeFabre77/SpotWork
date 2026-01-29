// =============================================================================
// STATE MANAGEMENT
// =============================================================================

const state = {
  filters: { city: "", type: "", wifi: "", search: "" },
  map: null,
  allMarkers: [],
  markerCache: new Map(),
  allTilesData: [],
  markerGroup: null,
  pagination: { currentCount: 20, increment: 20 },
  modal: { isOpen: false, currentData: null },
  comparison: { selectedPlaces: [], maxSelection: 4 },
};

const CITY_COORDINATES = {
  Paris: [48.8566, 2.3522],
  Lyon: [45.764, 4.8357],
  Marseille: [43.2965, 5.3698],
  Toulouse: [43.6047, 1.4442],
  Nice: [43.7102, 7.262],
};

const FRENCH_CITIES = new Set(
  Object.keys(CITY_COORDINATES).map((city) => city.toLowerCase()),
);

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

const getCity = (props) =>
  props["addr:city"] ||
  props["contact:city"] ||
  props.city ||
  props.commune ||
  "";

const hasWifi = (props) =>
  props.hasWifi === true ||
  props.wifi === true ||
  props.internet_access === "wlan" ||
  props.internet_access === "yes";

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

const getSeatingInfo = (props, spotType) => {
  const indoor =
    props.indoor_seating === "yes" ||
    spotType === "Coworking" ||
    spotType === "Library";
  const outdoor =
    props.outdoor_seating === "yes" || props.outdoor_seating === "sidewalk";
  return { indoor, outdoor };
};

const isTemporarilyClosed = (props) =>
  props.closed === "yes" || props.temporary === "yes";

const getTypeIconPath = (type) => {
  const icons = {
    Library: "./assets/icons/library.svg",
    Cofee: "./assets/icons/cofee.svg",
    Coworking: "./assets/icons/coworking.svg",
  };
  return icons[type] || null;
};

const getOperatorType = (props) =>
  props["operator:type"] === "government"
    ? "Public"
    : props["operator:type"] === "private"
      ? "Privé"
      : null;

const formatAddress = (props) => {
  const street = props["addr:street"] || props["contact:street"] || "";
  const postcode = props["addr:postcode"] || props["contact:postcode"] || "";
  const city = getCity(props);

  if (street && postcode && city) return `${street}, ${postcode} ${city}`;
  if (street && city) return `${street}, ${city}`;
  return city || null;
};

const createElement = (tag, className, textContent = "") => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  return el;
};

const createBadge = (className, text) => createElement("span", className, text);

const createActionButton = (className, text, url) => {
  const btn = createElement("button", className, text);
  btn.addEventListener("click", () => window.open(url, "_blank"));
  return btn;
};

// =============================================================================
// MODAL
// =============================================================================

const createInfoItem = (label, value) => `
  <div class="modal-info-item">
    <div class="modal-info-label">${label}</div>
    <div class="modal-info-value">${value}</div>
  </div>
`;

const buildModalInfo = (data) => {
  let html = "";

  if (data.address) html += createInfoItem("Adresse", data.address);
  if (data.hours)
    html += createInfoItem("Horaires", data.hours.replace(/\n/g, "<br>"));
  if (data.phone)
    html += createInfoItem(
      "Téléphone",
      `<a href="tel:${data.phone}">${data.phone}</a>`,
    );
  if (data.email)
    html += createInfoItem(
      "Email",
      `<a href="mailto:${data.email}">${data.email}</a>`,
    );

  const wifiStatus = data.wifi
    ? '<span class="wifi-available">Disponible</span>'
    : '<span class="wifi-unavailable">Non disponible</span>';
  html += createInfoItem("Wifi", wifiStatus);

  if (data.wheelchair) html += createInfoItem("Accessibilité", data.wheelchair);
  if (data.operator) html += createInfoItem("Type", data.operator);

  if (data.seating) {
    const seatingText = [];
    if (data.seating.indoor) seatingText.push("Intérieur");
    if (data.seating.outdoor) seatingText.push("Terrasse");
    if (seatingText.length > 0)
      html += createInfoItem("Places", seatingText.join(", "));
  }

  if (data.airConditioning) html += createInfoItem("Climatisation", "Oui");

  if (data.smoking) {
    const smokingText =
      data.smoking === "outside"
        ? "Fumoir extérieur"
        : data.smoking === "no"
          ? "Non-fumeur"
          : data.smoking;
    html += createInfoItem("Fumeur", smokingText);
  }

  return html;
};

const buildModalActions = (data, feature, container) => {
  container.innerHTML = "";

  if (data.website || data.websiteUrl) {
    container.appendChild(
      createActionButton(
        "modal-btn modal-btn-primary",
        "Visiter le site web",
        data.website || data.websiteUrl,
      ),
    );
  }

  if (data.wikipedia) {
    const wikiUrl = data.wikipedia.startsWith("http")
      ? data.wikipedia
      : `https://fr.wikipedia.org/wiki/${data.wikipedia.replace("fr:", "")}`;
    container.appendChild(
      createActionButton("modal-btn modal-btn-secondary", "Wikipedia", wikiUrl),
    );
  }

  if (data.wikidata) {
    container.appendChild(
      createActionButton(
        "modal-btn modal-btn-secondary",
        "Wikidata",
        `https://www.wikidata.org/wiki/${data.wikidata}`,
      ),
    );
  }

  const mapBtn = createElement(
    "button",
    "modal-btn modal-btn-secondary",
    "Voir sur la carte",
  );
  mapBtn.addEventListener("click", () => {
    const coords = feature.geometry.coordinates;
    state.map.setView([coords[1], coords[0]], 40);
    closeModal();
  });
  container.appendChild(mapBtn);
};

const openModal = (data, feature) => {
  const modal = document.getElementById("spot-modal");
  state.modal = { isOpen: true, currentData: { data, feature } };

  const modalIcon = document.getElementById("modal-icon");
  const iconPath = getTypeIconPath(data.type);
  modalIcon.innerHTML = iconPath
    ? `<img src="${iconPath}" alt="${data.type}" style="width: 24px; height: 24px;">`
    : "";

  document.getElementById("modal-title").textContent = data.title;
  const typeBadge = document.getElementById("modal-type");
  if (data.type) {
    typeBadge.textContent = data.type;
    typeBadge.style.display = "";
  } else {
    typeBadge.style.display = "none";
  }

  document.getElementById("modal-info-grid").innerHTML = buildModalInfo(data);

  const descSection = document.getElementById("modal-description-section");
  const descText = document.getElementById("modal-description");
  if (data.description) {
    descText.textContent = data.description;
    descSection.style.display = "";
  } else {
    descSection.style.display = "none";
  }
  buildModalActions(data, feature, document.getElementById("modal-actions"));

  modal.classList.add("modal-open");
  document.body.style.overflow = "hidden";
};

const closeModal = () => {
  const modal = document.getElementById("spot-modal");
  modal.classList.remove("modal-open");
  state.modal = { isOpen: false, currentData: null };
  document.body.style.overflow = "";
};

// =============================================================================
// DATA FETCHING
// =============================================================================

const fetchData = (path) => fetch(path).then((res) => res.json());

// =============================================================================
// FILTERS & SEARCH
// =============================================================================

const matchesFilters = (feature) => {
  const props = feature.properties;
  const { city, type, wifi, search } = state.filters;

  if (search) {
    const searchLower = search.toLowerCase();
    const spotCity = getCity(props).toLowerCase();
    if (FRENCH_CITIES.has(searchLower)) {
      if (spotCity !== searchLower) return false;
    } else {
      const spotName = (props.name || "").toLowerCase();
      const spotType = (props.spotType || "").toLowerCase();
      const spotAddress = formatAddress(props)?.toLowerCase() || "";

      const matchesSearch =
        spotName.includes(searchLower) ||
        spotType.includes(searchLower) ||
        spotAddress.includes(searchLower);

      if (!matchesSearch) return false;
    }
  }

  if (city) {
    const spotCity = getCity(props);
    if (!spotCity || !spotCity.toLowerCase().includes(city.toLowerCase()))
      return false;
  }

  if (type && props.spotType !== type) return false;
  if (wifi !== "") {
    const spotHasWifi = hasWifi(props);
    if (spotHasWifi !== (wifi === "true")) return false;
  }

  return true;
};

const getFilteredMarkers = () =>
  state.allMarkers.filter(({ feature }) => matchesFilters(feature));

const applyFilters = () => {
  state.pagination.currentCount = 20;
  const filteredMarkers = getFilteredMarkers();
  if (state.filters.search && filteredMarkers.length > 0) {
    centerOnSearchResults(filteredMarkers);
  } else {
    centerMapOnFilters(filteredMarkers);
  }

  requestAnimationFrame(() => {
    updateMapMarkers(filteredMarkers);
    rebuildTilesList();
  });
};

const centerOnSearchResults = (filteredMarkers) => {
  if (filteredMarkers.length === 1) {
    const marker = filteredMarkers[0];
    state.map.setView(marker.coords, 16);
  } else if (filteredMarkers.length > 1) {
    const bounds = L.latLngBounds(filteredMarkers.map((m) => m.coords));
    state.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }
};

const centerMapOnFilters = (filteredMarkers) => {
  if (state.filters.city && filteredMarkers.length > 0) {
    const bounds = L.latLngBounds(filteredMarkers.map((m) => m.coords));
    state.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    return;
  }

  if (state.filters.city && CITY_COORDINATES[state.filters.city]) {
    state.map.setView(CITY_COORDINATES[state.filters.city], 14);
    return;
  }
};

const resetFilters = () => {
  state.filters = { city: "", type: "", wifi: "", search: "" };
  ["city", "type", "wifi", "search-input"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  applyFilters();
  state.map.setView([48.8566, 2.3522], 13);
};

const debouncedApplyFilters = debounce(applyFilters, 150);
const debouncedSearchApplyFilters = debounce(applyFilters, 300);

const initializeFilters = () => {
  ["city", "type", "wifi"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => {
      state.filters[id] = e.target.value;
      debouncedApplyFilters();
    });
  });

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.filters.search = e.target.value.trim();
      debouncedSearchApplyFilters();
    });
  }
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
  const [lng, lat] = feature.geometry.coordinates;
  const { name, spotType } = feature.properties;

  const marker = L.marker([lat, lng], { title: name });
  marker.bindPopup(name);
  marker.feature = feature;
  marker.spotType = spotType;

  marker.setIcon(
    L.icon({
      iconUrl: defineIcon(spotType),
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    }),
  );

  return marker;
};

const updateMapMarkers = (filteredMarkers) => {
  if (!state.markerGroup) state.markerGroup = L.layerGroup().addTo(state.map);
  const bounds = state.map.getBounds();
  const zoom = state.map.getZoom();
  const maxMarkers = zoom < 10 ? 100 : zoom < 12 ? 300 : zoom < 14 ? 600 : 1000;

  state.markerGroup.clearLayers();
  if (filteredMarkers === undefined) filteredMarkers = getFilteredMarkers();
  const visibleMarkers = filteredMarkers
    .filter((m) => bounds.contains(m.coords))
    .slice(0, maxMarkers);

  visibleMarkers.forEach((markerData) => {
    const key = `${markerData.coords.lat}_${markerData.coords.lng}`;
    if (!state.markerCache.has(key)) {
      state.markerCache.set(key, createMarker(markerData.feature));
    }
    state.markerCache.get(key).addTo(state.markerGroup);
  });
};

// =============================================================================
// TILES - PAGINATION
// =============================================================================

const addTileInfo = (container, data) => {
  if (data.address) {
    const addressP = createElement("p", "tile-address");
    addressP.innerHTML = `<span class="tile-label"></span> ${data.address}`;
    container.appendChild(addressP);
  }

  if (data.hours) {
    const hoursP = createElement("p", "tile-hours");
    hoursP.innerHTML = `<span class="tile-label"></span> ${data.hours.split("\n")[0]}`;
    container.appendChild(hoursP);
  }

  if (data.email) {
    const emailP = createElement("p", "tile-email");
    emailP.innerHTML = `<span class="tile-label"></span><a href="mailto:${data.email}">${data.email}</a>`;
    container.appendChild(emailP);
  }
};

const addQuickInfo = (container, data) => {
  const quickInfo = createElement("div", "tile-quick-info");

  if (data.wifi !== undefined) {
    let wifiText = data.wifi ? "Wifi" : "Pas de wifi";
    if (data.wifi && data.wifiFee) wifiText += ` (${data.wifiFee})`;
    quickInfo.appendChild(
      createBadge(`tile-wifi ${data.wifi ? "wifi-yes" : "wifi-no"}`, wifiText),
    );
  }

  if (data.wheelchair) {
    quickInfo.appendChild(
      createBadge(
        `tile-badge tile-wheelchair wheelchair-${data.wheelchair.replace(" ", "-")}`,
        data.wheelchair,
      ),
    );
  }

  if (data.seating) {
    if (data.seating.indoor)
      quickInfo.appendChild(
        createBadge("tile-badge tile-seating", "Intérieur"),
      );
    if (data.seating.outdoor)
      quickInfo.appendChild(createBadge("tile-badge tile-seating", "Terrasse"));
  }

  if (data.airConditioning)
    quickInfo.appendChild(createBadge("tile-badge tile-ac", "Climatisé"));

  if (data.smoking) {
    const smokingText =
      data.smoking === "outside" ? "Fumoir ext." : "Non-fumeur";
    quickInfo.appendChild(createBadge("tile-badge tile-smoking", smokingText));
  }

  if (data.operator)
    quickInfo.appendChild(
      createBadge("tile-badge tile-operator", data.operator),
    );

  if (data.phone) quickInfo.appendChild(createBadge("tile-phone", data.phone));

  if (quickInfo.children.length > 0) container.appendChild(quickInfo);
};

const createTileElement = (data, feature) => {
  const div = createElement("div", "tile");

  if (data.temporarilyClosed) {
    div.appendChild(
      createElement(
        "div",
        "tile-warning",
        data.closedDescription || "Temporairement fermé",
      ),
    );
  }

  const checkbox = createElement("input", "tile-checkbox");
  checkbox.type = "checkbox";
  checkbox.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlaceSelection(data, feature, checkbox);
  });
  div.appendChild(checkbox);

  const header = createElement("div", "tile-header");
  const titleContainer = createElement("div", "tile-title-container");
  const icon = createElement("span", "tile-icon");

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

  titleContainer.appendChild(icon);
  titleContainer.appendChild(createElement("h3", "", data.title));
  header.appendChild(titleContainer);

  if (data.type) {
    header.appendChild(createElement("span", "tile-type-badge", data.type));
  }
  div.appendChild(header);
  const infoContainer = createElement("div", "tile-info");
  addTileInfo(infoContainer, data);
  addQuickInfo(infoContainer, data);
  div.appendChild(infoContainer);

  div.addEventListener("click", () => openModal(data, feature));

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
    const loadMoreBtn = createElement(
      "button",
      "load-more-btn",
      `Charger plus (${filteredData.length - state.pagination.currentCount} restants)`,
    );
    loadMoreBtn.addEventListener("click", loadMoreTiles);
    container.appendChild(loadMoreBtn);
  } else if (filteredData.length > 0) {
    container.appendChild(
      createElement("div", "end-message", "Tous les résultats sont affichés"),
    );
  }
};

const loadMoreTiles = () => {
  state.pagination.currentCount += state.pagination.increment;
  rebuildTilesList();
};

// =============================================================================
// COMPARISON FEATURE
// =============================================================================
const updateComparisonCount = () => {
  const count = state.comparison.selectedPlaces.length;
  document.getElementById("comparison-count").textContent = count;

  const compareBtn = document.querySelector("#comparison-tile > button");
  if (compareBtn) {
    compareBtn.disabled = count < 2;
  }
  const clearBtn = document.querySelector("#comparison-tile > div button");
  if (clearBtn) {
    clearBtn.disabled = count === 0;
  }

  updateMarkerHighlight();
};

const updateMarkerHighlight = () => {
  const selectedIds = new Set(state.comparison.selectedPlaces.map((p) => p.id));
  const hasSelection = selectedIds.size > 0;

  state.markerCache.forEach((marker, key) => {
    if (!marker.feature || !marker.spotType) return;

    const isSelected = selectedIds.has(key);

    if (hasSelection && !isSelected) {
      marker.setOpacity(0.2);
    } else {
      marker.setOpacity(1);
    }
    const iconSize = isSelected ? [48, 48] : [32, 32];
    const iconAnchor = isSelected ? [24, 48] : [16, 32];
    const popupAnchor = isSelected ? [0, -48] : [0, -32];
    marker.setIcon(
      L.icon({
        iconUrl: defineIcon(marker.spotType),
        iconSize: iconSize,
        iconAnchor: iconAnchor,
        popupAnchor: popupAnchor,
        className: isSelected ? "marker-selected" : "",
      }),
    );
    if (isSelected) {
      marker._icon?.classList.add("marker-selected");
    } else {
      marker._icon?.classList.remove("marker-selected");
    }
  });
};

const togglePlaceSelection = (data, feature, checkbox) => {
  const [lng, lat] = feature.geometry.coordinates;
  const placeId = `${lat}_${lng}`;

  if (checkbox.checked) {
    if (
      state.comparison.selectedPlaces.length >= state.comparison.maxSelection
    ) {
      checkbox.checked = false;
      alert(
        `Vous ne pouvez comparer que ${state.comparison.maxSelection} lieux maximum.`,
      );
      return;
    }

    state.comparison.selectedPlaces.push({
      id: placeId,
      data,
      feature,
    });
  } else {
    const index = state.comparison.selectedPlaces.findIndex(
      (p) => p.id === placeId,
    );
    if (index !== -1) {
      state.comparison.selectedPlaces.splice(index, 1);
    }
  }

  updateComparisonCount();
  updateMarkerHighlight();
};

const calculatePlaceScore = (data) => {
  let score = 0;

  if (data.wifi && data.wifiFee === "gratuit") score += 20;
  else if (data.wifi) score += 10;

  if (data.wheelchair === "accessible") score += 15;
  else if (data.wheelchair === "partiel") score += 8;

  if (data.airConditioning) score += 10;

  if (data.seating?.indoor) score += 10;
  if (data.seating?.outdoor) score += 10;

  if (data.operator === "Public") score += 5;

  if (data.smoking === "no") score += 10;

  if (data.hours) score += 5;

  if (data.email || data.phone) score += 5;

  return score;
};

const getBestPlace = (places) => {
  let bestPlace = null;
  let bestScore = -1;

  places.forEach((place) => {
    const score = calculatePlaceScore(place.data);
    if (score > bestScore) {
      bestScore = score;
      bestPlace = place;
    }
  });

  return { place: bestPlace, score: bestScore };
};

const getComparisonValue = (value, type) => {
  if (value === undefined || value === null || value === "") {
    return '<span class="comparison-value-neutral">Non renseigné</span>';
  }

  switch (type) {
    case "wifi":
      if (value === true)
        return '<span class="comparison-value-good">✓ Oui</span>';
      return '<span class="comparison-value-bad">✗ Non</span>';

    case "wifiFee":
      if (value === "gratuit")
        return '<span class="comparison-value-good">Gratuit</span>';
      if (value === "payant")
        return '<span class="comparison-value-bad">Payant</span>';
      if (value === "clients")
        return '<span class="comparison-value-neutral">Clients uniquement</span>';
      return '<span class="comparison-value-neutral">-</span>';

    case "wheelchair":
      if (value === "accessible")
        return '<span class="comparison-value-good">Accessible</span>';
      if (value === "partiel")
        return '<span class="comparison-value-neutral">Partiel</span>';
      if (value === "non accessible")
        return '<span class="comparison-value-bad">Non accessible</span>';
      return '<span class="comparison-value-neutral">-</span>';

    case "boolean":
      if (value === true)
        return '<span class="comparison-value-good">✓ Oui</span>';
      return '<span class="comparison-value-bad">✗ Non</span>';

    case "seating":
      const seats = [];
      if (value.indoor) seats.push("Intérieur");
      if (value.outdoor) seats.push("Terrasse");
      if (seats.length > 0)
        return (
          '<span class="comparison-value-good">' + seats.join(", ") + "</span>"
        );
      return '<span class="comparison-value-neutral">Non renseigné</span>';

    default:
      return value;
  }
};

const buildFeatureItem = (name, value, extra = null) => {
  let status = "unavailable";
  let icon =
    "<img src='assets/icons/close.svg' alt='Informations' width='20' height='20'>";
  let displayValue = "Non disponible";

  switch (name) {
    case "WiFi":
      if (value === true) {
        status = "available";
        icon =
          "<img src='assets/icons/wifi.svg' alt='WiFi' width='20' height='20'>";
        displayValue = extra ? `Disponible (${extra})` : "Disponible";
      } else {
        displayValue = "Non disponible";
      }
      break;

    case "Accessibilité":
      if (value === "accessible") {
        status = "available";
        icon =
          "<img src='assets/icons/wheelchair.svg' alt='Accessibilité' width='20' height='20'>";
        displayValue = "Accessible";
      } else if (value === "partiel") {
        status = "partial";
        icon =
          "<img src='assets/icons/warning.svg' alt='Accessibilité' width='20' height='20'>";
        displayValue = "Partiel";
      } else {
        displayValue = "Non accessible";
      }
      break;

    case "Climatisation":
      if (value === true) {
        status = "available";
        icon =
          "<img src='assets/icons/clim.svg' alt='Climatisation' width='20' height='20'>";
        displayValue = "Disponible";
      }
      break;

    case "Places":
      if (value && (value.indoor || value.outdoor)) {
        status = "available";
        icon =
          "<img src='assets/icons/chair.svg' alt='Places' width='20' height='20'>";
        const places = [];
        if (value.indoor) places.push("Intérieur");
        if (value.outdoor) places.push("Terrasse");
        displayValue = places.join(" + ");
      }
      break;
  }

  return `
    <div class="feature-item">
      <div class="feature-icon ${status}">${icon}</div>
      <div class="feature-details">
        <div class="feature-name">${name}</div>
        <div class="feature-value">${displayValue}</div>
      </div>
    </div>
  `;
};

const buildCriteriaComparison = (places) => {
  const criteria = [
    {
      name: "WiFi Gratuit",
      getValue: (d) => d.wifi && d.wifiFee === "gratuit",
    },
    { name: "Accessible PMR", getValue: (d) => d.wheelchair === "accessible" },
    { name: "Climatisation", getValue: (d) => d.airConditioning },
    { name: "Terrasse", getValue: (d) => d.seating?.outdoor },
    { name: "Non-fumeur", getValue: (d) => d.smoking === "no" },
  ];

  let html = '<div class="comparison-graph-card">';
  html += "<h3>Critères Clés</h3>";
  html += '<div class="score-comparison">';

  criteria.forEach((criterion) => {
    const placesWithFeature = places.filter((p) =>
      criterion.getValue(p.data),
    ).length;
    const percentage = (placesWithFeature / places.length) * 100;
    html += `
      <div class="score-item">
        <div class="score-item-header">
          <div class="score-item-name">${criterion.name}</div>
          <div class="score-item-value">${placesWithFeature}/${places.length}</div>
        </div>
        <div class="score-bar-container">
          <div class="score-bar" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  });

  html += "</div></div>";
  return html;
};

const buildComparisonGraphs = (places) => {
  if (places.length === 0) {
    return `
      <div class="comparison-empty">
        <div class="comparison-empty-text">Aucun lieu sélectionné</div>
        <div class="comparison-empty-subtext">Sélectionnez au moins 2 lieux pour les comparer</div>
      </div>
    `;
  }

  const { place: bestPlace } = getBestPlace(places);

  let html = '<div class="comparison-place-cards">';

  places.forEach(({ data, id }) => {
    const score = calculatePlaceScore(data);
    const isBest = bestPlace && bestPlace.id === id;

    html += `
      <div class="comparison-place-card ${isBest ? "best-place" : ""}">
        <div class="comparison-place-header">
          <div>
            <h4 class="comparison-place-title">${data.title}</h4>
            <div class="comparison-place-type">${data.type || "Non spécifié"}</div>
            ${isBest ? '<span class="best-badge"><img src="assets/icons/best.svg" alt="Meilleur choix" width="20" height="20"> Meilleur choix</span>' : ""}
          </div>
          <div class="comparison-place-score">
            <div class="comparison-place-score-value">${score}</div>
            <div class="comparison-place-score-label">/ 100</div>
          </div>
        </div>
        <div class="features-grid">
          ${buildFeatureItem("WiFi", data.wifi, data.wifiFee)}
          ${buildFeatureItem("Accessibilité", data.wheelchair)}
          ${buildFeatureItem("Climatisation", data.airConditioning)}
          ${buildFeatureItem("Places", data.seating)}
        </div>
      </div>
    `;
  });

  html += "</div>";
  html += `
    <div class="comparison-graph-card">
      <h3>Score Global</h3>
      <div class="score-comparison">
  `;

  places.forEach(({ data, id }) => {
    const score = calculatePlaceScore(data);
    const isBest = bestPlace && bestPlace.id === id;
    const percentage = score;

    html += `
      <div class="score-item">
        <div class="score-item-header">
          <div class="score-item-name">
            ${data.title}
            ${isBest ? '<span class="best-badge"><img src="assets/icons/best.svg" alt="Meilleur choix" width="20" height="20">Meilleur</span>' : ""}
          </div>
          <div class="score-item-value">${score}/100</div>
        </div>
        <div class="score-bar-container">
          <div class="score-bar ${isBest ? "best" : ""}" style="width: ${percentage}%">
            ${percentage}%
          </div>
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  html += buildCriteriaComparison(places, bestPlace);

  return html;
};

const showComparisonRecommendation = (places) => {
  const recommendationDiv = document.getElementById(
    "comparison-recommendation",
  );

  if (places.length < 2) {
    recommendationDiv.classList.remove("show");
    return;
  }

  const { place: bestPlace, score: bestScore } = getBestPlace(places);

  let reasons = [];
  const data = bestPlace.data;

  if (data.wifi && data.wifiFee === "gratuit") reasons.push("WiFi gratuit");
  if (data.wheelchair === "accessible") reasons.push("accessible PMR");
  if (data.airConditioning) reasons.push("climatisé");
  if (data.seating?.indoor && data.seating?.outdoor)
    reasons.push("places intérieures et terrasse");
  if (data.operator === "Public") reasons.push("établissement public");

  recommendationDiv.innerHTML = `
    <h3>Recommandation intelligente</h3>
    <p><strong>${bestPlace.data.title}</strong> semble être le meilleur choix avec un score de <strong>${bestScore}/100</strong>.</p>
    ${reasons.length > 0 ? `<p>Points forts : ${reasons.join(", ")}.</p>` : ""}
  `;
  recommendationDiv.classList.add("show");
};

const openComparisonModal = () => {
  const modal = document.getElementById("comparison-modal");
  const places = state.comparison.selectedPlaces;

  document.getElementById("comparison-modal-count").textContent = places.length;
  document.getElementById("comparison-graphs").innerHTML =
    buildComparisonGraphs(places);

  showComparisonRecommendation(places);

  modal.classList.add("modal-open");
  document.body.style.overflow = "hidden";
};

const closeComparisonModal = () => {
  const modal = document.getElementById("comparison-modal");
  modal.classList.remove("modal-open");
  document.body.style.overflow = "";
};

const clearComparison = () => {
  state.comparison.selectedPlaces = [];
  updateComparisonCount();
  updateMarkerHighlight();

  document.querySelectorAll(".tile-checkbox").forEach((checkbox) => {
    checkbox.checked = false;
  });

  closeComparisonModal();
};
const initializeComparison = () => {
  updateComparisonCount();
};

// =============================================================================
// DATA PROCESSING
// =============================================================================

const processFeatureData = (feature, additionalFields = {}) => {
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
      phone: props.phone || props["contact:phone"],
      email: props.email || props["contact:email"],
      website: props.website || props["contact:website"],
      description: props.description,
      wifi: hasWifi(props),
      wifiFee: getWifiFeeStatus(props),
      wheelchair: getWheelchairStatus(props),
      operator: getOperatorType(props),
      temporarilyClosed: isTemporarilyClosed(props),
      closedDescription: props["closed:description"],
      wikipedia: props.wikipedia,
      wikidata: props.wikidata,
      address: formatAddress(props),
      ...additionalFields(props),
    },
    feature,
  );
};

const processGeoJSONData = (data, additionalFields = () => ({})) => {
  if (!data?.features) return;

  data.features.forEach((feature) => {
    if (!hasValidProperties(feature) || !hasValidGeometry(feature)) return;
    processFeatureData(feature, additionalFields);
  });
};

const processCoworkingData = (data) =>
  processGeoJSONData(data, (props) => ({
    seating: getSeatingInfo(props, "Coworking"),
    airConditioning: props.air_conditioning === "yes",
    smoking: props.smoking,
  }));

const processLibraryData = (data) =>
  processGeoJSONData(data, (props) => ({
    seating: getSeatingInfo(props, "Library"),
    websiteUrl: props.website || props["contact:website"],
  }));

const processCofeeData = (data) =>
  processGeoJSONData(data, (props) => ({
    seating: getSeatingInfo(props, "Cofee"),
    airConditioning: props.air_conditioning === "yes",
    smoking: props.smoking,
  }));

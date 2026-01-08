window.onload = () => {
    let map = L.map("map").setView([48.8566, 2.3522], 13);
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
        addMarkersFromGeoJSON(map, data, "./assets/icons/markers/Coworking_Temp.png");

        data.features.forEach((feature) => {
            if (feature.properties?.name) createTileForOverpassData(feature);
        });
    });

    fetchLibraryData().then((data) => {
        addMarkersFromGeoJSON(map, data, "./assets/icons/markers/Book.png");

        data.features.forEach((feature) => {
            createTileForOpenData(feature);
        });
    });

    fetchCofeeData().then((data) => {
        addMarkersFromGeoJSON(map, data, "./assets/icons/markers/Cofee.png");

        data.features.forEach((feature) => {
            createTileForOverpassData(feature);
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

const createTileForOpenData = (feature) => {
    let properties = feature?.properties;
    let type = properties?.spotType;
    let div = document.createElement("div");
    div.className = "tile";
    let title = document.createElement("h3");
    title.textContent = properties?.nometablissement || "Sans titre";
    div.appendChild(title);
    if (type) {
        let typeElement = document.createElement("p");
        typeElement.textContent = `Type: ${type}`;
        div.appendChild(typeElement);
    }
    if (properties?.heuresouverture) {
        let hoursElement = document.createElement("p");
        hoursElement.textContent = `Horaires: ${properties.heuresouverture}`;
        div.appendChild(hoursElement);
    }
    if (properties?.telephone) {
        let phoneElement = document.createElement("p");
        phoneElement.textContent = `Téléphone: ${properties.telephone}`;
        div.appendChild(phoneElement);
    }
    if (properties?.nomrue && properties?.codepostal && properties?.comune) {
        let addressElement = document.createElement("p");
        addressElement.textContent = `${properties.nomrue}, ${properties.codepostal} ${properties.comune}`;
        div.appendChild(addressElement);
    }
    if (properties?.hasWifi) {
        let wifiElement = document.createElement("p");
        wifiElement.textContent = "Wifi: Oui";
        div.appendChild(wifiElement);
    }
    if (properties?.accesweb) {
        let button = document.createElement("button");
        button.textContent = "Site web";
        button.addEventListener("click", () =>
            window.open(properties.accesweb, "_blank"),
        );
        div.appendChild(button);
    }
    addContentToSpotsContainer(div);
};

function addContentToSpotsContainer(content) {
    let spotsContainer = document.querySelector(".spots");
    spotsContainer.appendChild(content);
}

const createTileForOverpassData = (feature) => {
    let properties = feature?.properties;
    let type = properties?.spotType;
    let div = document.createElement("div");
    div.className = "tile";
    let title = document.createElement("h3");
    title.textContent = properties?.name;
    div.appendChild(title);

    if (type) {
        let typeElement = document.createElement("p");
        typeElement.textContent = `Type: ${type}`;
        div.appendChild(typeElement);
    }

    if (properties?.opening_hours) {
        let opening_hours = document.createElement("p");
        opening_hours.textContent = `Horaires: ${properties.opening_hours}`;
        div.appendChild(opening_hours);
    }

    if (properties?.phone) {
        let phone = document.createElement("p");
        phone.textContent = `Téléphone: ${properties.phone}`;
        div.appendChild(phone);
    }

    if (properties?.website) {
        let website = document.createElement("a");
        website.href = properties.website;
        website.textContent = properties.website;
        div.appendChild(website);
    }

    if (properties?.description) {
        let description = document.createElement("p");
        description.textContent = properties.description;
        div.appendChild(description);
    }

    addContentToSpotsContainer(div);

    return div;
};

function addMarkersFromGeoJSON(map, geojson, iconUrl) {

    if (!geojson) return L.layerGroup().addTo(map);

    const features = Array.isArray(geojson) ? geojson : (geojson.features || []);

    const group = L.layerGroup().addTo(map);




    features.forEach((feature) => {
        if (!feature?.geometry) return;

        const { type, coordinates } = feature.geometry;

        if (type === "Point" && Array.isArray(coordinates) && coordinates.length >= 2) {
            const [lng, lat] = coordinates;

            const marker = L.marker([lat, lng], {title :feature.properties.name}).addTo(group);
            marker.bindPopup(feature.properties.name || feature.properties.nometablissement || "Sans nom");
            marker.setIcon(L.icon({
                iconUrl,
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32],
            }));


        }
    });

    return group;
}
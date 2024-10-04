// Initialize the map
const map = L.map('map').setView([20, 0], 2); // Initial view
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

const geocoder = L.Control.geocoder().addTo(map);

// Store previous grid layer and marker
let previousGridLayer;
let currentMarker;

// Function to fetch TLE data dynamically from the provided URLs
const tleUrls = {
    l7: "https://tle.ivanstanojevic.me/api/tle/25682",
    l8: "https://tle.ivanstanojevic.me/api/tle/39084",
    l9: "https://tle.ivanstanojevic.me/api/tle/49260"
};

// Fetch TLE data and calculate satellite pass times
async function fetchTLEAndUpdate() {
    const tleData = {};
    try {
        for (const [sat, url] of Object.entries(tleUrls)) {
            const response = await fetch(url);
            const data = await response.json(); // Ensure response is JSON
            tleData[sat] = [data.line1, data.line2];
        }
        console.log("Fetched TLE Data:", tleData);
        return tleData;
    } catch (error) {
        console.error('Error fetching TLE data:', error);
    }
}

// Calculate next satellite pass times based on TLE data
async function calculateNextPassTimes(lat, lon) {
    const tleData = await fetchTLEAndUpdate();

    const now = new Date();
    const timeInterval = 10 * 60; // 10-minute intervals
    const maxChecks = 12; // Check for next 2 hours

    for (const [satName, tle] of Object.entries(tleData)) {
        let nextPassTime = null;
        for (let i = 0; i < maxChecks; i++) {
            const checkTime = new Date(now.getTime() + i * timeInterval * 1000);
            const satrec = satellite.twoline2satrec(tle[0], tle[1]);
            const positionAndVelocity = satellite.propagate(satrec, checkTime);
            if (positionAndVelocity.position) {
                const geodetic = satellite.eciToGeodetic(positionAndVelocity.position, satellite.gstime(checkTime));
                const satLat = satellite.degreesLat(geodetic.latitude);
                const satLon = satellite.degreesLong(geodetic.longitude);
                const distance = getDistanceFromLatLon(lat, lon, satLat, satLon);

                if (distance < 1000) { // Threshold for satellite overhead
                    nextPassTime = checkTime;
                    break;
                }
            }
        }

        if (nextPassTime) {
            const formattedTime = nextPassTime.toLocaleString();
            document.getElementById(`pass-${satName}`).innerText = `${satName.toUpperCase()}: Next pass at ${formattedTime}`;
            placeSatelliteOnMap(lat, lon, satName); // Show satellite position on the map
        } else {
            document.getElementById(`pass-${satName}`).innerText = `${satName.toUpperCase()}: No upcoming pass detected.`;
        }
    }
}

// Function to update the map with new coordinates
function updateMap(lat, lon) {
    if (previousGridLayer) {
        map.removeLayer(previousGridLayer);
    }
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], map.getZoom());

    previousGridLayer = createGrid(lat, lon);

    calculateNextPassTimes(lat, lon);
}

// Create a grid on the map around the selected coordinates
function createGrid(lat, lon) {
    const gridGroup = L.layerGroup().addTo(map);
    const offset = 0.05;
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            const box = L.rectangle(
                [[lat + i * offset - 0.025, lon + j * offset - 0.025], [lat + i * offset + 0.025, lon + j * offset + 0.025]],
                { color: "red", weight: 1 }
            ).addTo(gridGroup);
        }
    }
    return gridGroup;
}

// Place the satellite's current position on the map
function placeSatelliteOnMap(lat, lon, satName) {
    L.marker([lat, lon], { icon: L.icon({ iconUrl: 'satellite-icon.png', iconSize: [25, 25] }) })
        .addTo(map)
        .bindPopup(`${satName} is here!`)
        .openPopup();
}

// Get current location and update map
document.getElementById('getCurrentLocation').onclick = function () {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lon;
            updateMap(lat, lon);
        });
    } else {
        alert("Geolocation is not supported by this browser.");
    }
};

// Distance calculation
function getDistanceFromLatLon(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Download TLE Data
document.getElementById('downloadTLE').onclick = function () {
    fetchTLEAndUpdate().then(tleData => {
        const tleContent = Object.entries(tleData).map(([satName, tleLines]) => 
            `${satName.toUpperCase()}:\n${tleLines.join('\n')}\n\n`
        ).join('');

        const blob = new Blob([tleContent], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'tle_data.txt';
        link.click();
    });
};

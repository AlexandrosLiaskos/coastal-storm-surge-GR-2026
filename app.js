/* global L */

const state = {
  insights: null,
  events: [],
  filteredEvents: [],
  layers: {
    peripheries: null,
    municipalities: null,
    decentr: null,
    events: L.layerGroup(),
    basemap: null
  },
  map: null,
  selectedMarker: null
};

const hotClassColors = {
  "Πολύ Υψηλή": "#0d4d88",
  "Υψηλή": "#3372a9",
  "Μέση": "#7aa7cd",
  "Χαμηλή": "#b8d0e6",
  "Καμία Καταγραφή": "#eef3f9",
  "Άγνωστο": "#d9dde2"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function eventColor(eventClass) {
  return eventClass === "Natura High" ? "#c23a2f" : "#2f4f74";
}

function styleHotClass(feature, baseWeight) {
  const cls = feature.properties.HOT_CLASS || "Άγνωστο";
  return {
    color: "#5e7289",
    weight: baseWeight,
    fillColor: hotClassColors[cls] || hotClassColors["Άγνωστο"],
    fillOpacity: 0.46
  };
}

function initMap() {
  const map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView([38.45, 24.15], 7);

  state.map = map;
  state.layers.basemap = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    { maxZoom: 18 }
  );

  state.layers.events.addTo(map);
}

function setHeader() {
  const title = document.getElementById("report-title");
  const subtitle = document.getElementById("report-subtitle");
  if (state.insights?.title) title.textContent = state.insights.title;
  if (state.insights?.subtitle) subtitle.textContent = state.insights.subtitle;
}

function setStaticKpis() {
  const totals = state.insights?.totals || {};
  const naturaPct = totals.natura_yes_pct ?? 0;
  document.getElementById("kpi-events").textContent = totals.events ?? "-";
  document.getElementById("kpi-natura").textContent = `${totals.natura_yes ?? "-"} (${naturaPct}%)`;
  document.getElementById("kpi-peripheries").textContent = totals.affected_peripheries ?? "-";
  document.getElementById("kpi-municipalities").textContent = totals.affected_municipalities ?? "-";
}

function populateFilters() {
  const regionSel = document.getElementById("region-filter");
  const durationSel = document.getElementById("duration-filter");

  const regions = [...new Set(state.events.map(f => f.properties["ΠΕΡΙΦΕΡΕΙΑ"]).filter(Boolean))].sort();
  const durations = [...new Set(state.events.map(f => f.properties["ΔΙΑΡΚΕΙΑ_ΕΚΤΑΚΤΗΣ_ΑΝΑΓΚΗΣ"]).filter(Boolean))].sort();

  for (const v of regions) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    regionSel.appendChild(opt);
  }

  for (const v of durations) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    durationSel.appendChild(opt);
  }
}

function updateRankLists() {
  const topPerEl = document.getElementById("top-peripheries");
  const topEvtEl = document.getElementById("top-events");
  topPerEl.innerHTML = "";
  topEvtEl.innerHTML = "";

  const topPer = state.insights?.top_peripheries || [];
  const topEvents = state.insights?.top_events || [];

  for (const item of topPer.slice(0, 6)) {
    const li = document.createElement("li");
    li.innerHTML =
      `<strong>${escapeHtml(item.REGION_GR || item.name || "-")}</strong> · ` +
      `Γεγ. ${escapeHtml(item.TOTAL_EVT || item.total_evt || 0)} · ` +
      `Natura ${escapeHtml(item.NATURA_PCT || item.natura_pct || 0)}%`;
    topPerEl.appendChild(li);
  }

  for (const item of topEvents.slice(0, 8)) {
    const li = document.createElement("li");
    li.innerHTML =
      `<strong>${escapeHtml(item["ΠΑΡΑΚΤΙΑ_ΠΕΡΙΟΧΗ"] || item.area_name || "-")}</strong>` +
      `<br><span>${escapeHtml(item["ΠΕΡΙΦΕΡΕΙΑ"] || item.region || "-")}</span>`;
    topEvtEl.appendChild(li);
  }
}

function addPolygonLayers(per, mun, dec) {
  state.layers.peripheries = L.geoJSON(per, {
    style: feature => styleHotClass(feature, 1.0)
  }).addTo(state.map);

  state.layers.municipalities = L.geoJSON(mun, {
    style: feature => ({
      ...styleHotClass(feature, 0.5),
      fillOpacity: 0.33
    })
  });

  state.layers.decentr = L.geoJSON(dec, {
    style: feature => ({
      ...styleHotClass(feature, 1.8),
      fillOpacity: 0.16
    })
  }).addTo(state.map);

  const bounds = state.layers.peripheries.getBounds();
  if (bounds.isValid()) {
    state.map.fitBounds(bounds.pad(0.03));
  }
}

function matchesFilter(props) {
  const region = document.getElementById("region-filter").value;
  const natura = document.getElementById("natura-filter").value;
  const duration = document.getElementById("duration-filter").value;
  const search = document.getElementById("search-filter").value.trim().toLowerCase();

  if (region && props["ΠΕΡΙΦΕΡΕΙΑ"] !== region) return false;
  if (natura && String(props["ΕΝΤΟΣ_NATURA2000"]).toUpperCase() !== natura) return false;
  if (duration && props["ΔΙΑΡΚΕΙΑ_ΕΚΤΑΚΤΗΣ_ΑΝΑΓΚΗΣ"] !== duration) return false;
  if (search) {
    const blob = [
      props["ΠΑΡΑΚΤΙΑ_ΠΕΡΙΟΧΗ"],
      props["ΠΕΡΙΦΕΡΕΙΑ"],
      props["ΔΗΜΟΣ"],
      props["ΚΟΙΝΟΤΗΤΑ"],
      props["SHORT_DAMAGE"]
    ].join(" ").toLowerCase();
    if (!blob.includes(search)) return false;
  }
  return true;
}

function updateFilteredKpi() {
  document.getElementById("kpi-filtered").textContent = state.filteredEvents.length;
}

function popupHtml(props) {
  const area = escapeHtml(props["ΠΑΡΑΚΤΙΑ_ΠΕΡΙΟΧΗ"] || "-");
  const region = escapeHtml(props["ΠΕΡΙΦΕΡΕΙΑ"] || "-");
  const shortDamage = escapeHtml(props["SHORT_DAMAGE"] || "");
  return (
    `<h3 class="popup-title">${area}</h3>` +
    `<p class="popup-body"><strong>${region}</strong><br>${shortDamage}</p>`
  );
}

function renderMarkers() {
  state.layers.events.clearLayers();
  state.filteredEvents = state.events.filter(f => matchesFilter(f.properties));

  for (const feature of state.filteredEvents) {
    const [lon, lat] = feature.geometry.coordinates;
    const props = feature.properties;
    const cls = props.EVENT_CLASS;
    const isHigh = cls === "Natura High";

    const marker = L.circleMarker([lat, lon], {
      radius: isHigh ? 8 : 6,
      color: "#ffffff",
      weight: 1.2,
      fillColor: eventColor(cls),
      fillOpacity: isHigh ? 0.97 : 0.8
    });

    marker.bindPopup(popupHtml(props));
    marker.on("click", () => {
      if (state.selectedMarker) state.selectedMarker.setStyle({ weight: 1.2 });
      state.selectedMarker = marker;
      marker.setStyle({ weight: 2.2 });
      showEventDetail(props);
    });

    state.layers.events.addLayer(marker);
  }

  updateFilteredKpi();
}

function setLayerToggles() {
  const togglePer = document.getElementById("toggle-peripheries");
  const toggleMun = document.getElementById("toggle-municipalities");
  const toggleDec = document.getElementById("toggle-decentr");
  const toggleBase = document.getElementById("toggle-basemap");

  togglePer.addEventListener("change", () => {
    if (togglePer.checked) state.layers.peripheries.addTo(state.map);
    else state.map.removeLayer(state.layers.peripheries);
  });

  toggleMun.addEventListener("change", () => {
    if (toggleMun.checked) state.layers.municipalities.addTo(state.map);
    else state.map.removeLayer(state.layers.municipalities);
  });

  toggleDec.addEventListener("change", () => {
    if (toggleDec.checked) state.layers.decentr.addTo(state.map);
    else state.map.removeLayer(state.layers.decentr);
  });

  toggleBase.addEventListener("change", () => {
    if (toggleBase.checked) state.layers.basemap.addTo(state.map);
    else state.map.removeLayer(state.layers.basemap);
  });
}

function wireFilters() {
  const ids = ["region-filter", "natura-filter", "duration-filter", "search-filter"];
  for (const id of ids) {
    document.getElementById(id).addEventListener("input", renderMarkers);
    document.getElementById(id).addEventListener("change", renderMarkers);
  }
  document.getElementById("clear-filters").addEventListener("click", () => {
    document.getElementById("region-filter").value = "";
    document.getElementById("natura-filter").value = "";
    document.getElementById("duration-filter").value = "";
    document.getElementById("search-filter").value = "";
    renderMarkers();
  });
}

function imageExists(path) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(path);
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

async function resolveEventImages(eventId) {
  const id = String(eventId);
  const candidates = [
    `assets/images/${id}.jpg`,
    `assets/images/${id}.png`,
    `assets/images/${id}.webp`,
    `assets/images/${id}-1.jpg`,
    `assets/images/${id}-2.jpg`,
    `assets/images/${id}-3.jpg`,
    `assets/images/${id}-1.png`,
    `assets/images/${id}-2.png`
  ];
  const tested = await Promise.all(candidates.map(imageExists));
  return tested.filter(Boolean);
}

function detailHtml(props) {
  const area = escapeHtml(props["ΠΑΡΑΚΤΙΑ_ΠΕΡΙΟΧΗ"] || "-");
  const region = escapeHtml(props["ΠΕΡΙΦΕΡΕΙΑ"] || "-");
  const municipality = escapeHtml(props["ΔΗΜΟΣ"] || "-");
  const duration = escapeHtml(props["ΔΙΑΡΚΕΙΑ_ΕΚΤΑΚΤΗΣ_ΑΝΑΓΚΗΣ"] || "-");
  const declaration = escapeHtml(props["ΗΜΕΡΟΜΗΝΙΑ_ΚΗΡΥΞΗΣ"] || "-");
  const eventDate = escapeHtml(props["ΗΜΕΡΟΜΗΝΙΑ_ΣΥΜΒΑΝΤΟΣ"] || "-");
  const ada = escapeHtml(props["ΑΔΑ_ΚΩΔΙΚΟΣ"] || "-");
  const classLabel = props.EVENT_CLASS === "Natura High"
    ? '<span class="chip danger">Natura High</span>'
    : '<span class="chip">Standard</span>';
  const shortDamage = escapeHtml(props["SHORT_DAMAGE"] || "");
  const fullDamage = escapeHtml(props["ΠΕΡΙΓΡΑΦΗ_ΖΗΜΙΩΝ"] || "");

  return `
    <h3 class="detail-title">${area}</h3>
    <div class="detail-meta">
      ${classLabel}
      <span class="chip">${region}</span>
      <span class="chip">${municipality}</span>
      <span class="chip">Διάρκεια: ${duration}</span>
    </div>
    <p><strong>Τι συνέβη:</strong> ${shortDamage}</p>
    <p><strong>Ημ/νία συμβάντος:</strong> ${eventDate}<br>
       <strong>Ημ/νία κήρυξης:</strong> ${declaration}<br>
       <strong>Κωδικός ΑΔΑ:</strong> ${ada}</p>
    <details>
      <summary><strong>Αναλυτική περιγραφή ζημιών</strong></summary>
      <p>${fullDamage}</p>
    </details>
  `;
}

async function showEventDetail(props) {
  const detail = document.getElementById("event-detail");
  const gallery = document.getElementById("event-gallery");
  detail.classList.remove("empty");
  detail.innerHTML = detailHtml(props);
  gallery.innerHTML = "";

  const images = await resolveEventImages(props.EVENT_ID);
  if (!images.length) {
    gallery.innerHTML = "<p class='event-detail empty'>Δεν βρέθηκαν εικόνες για αυτό το συμβάν ακόμα.</p>";
    return;
  }
  for (const src of images) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = `Συμβάν ${props.EVENT_ID}`;
    gallery.appendChild(img);
  }
}

async function loadData() {
  const [events, per, mun, dec, insights] = await Promise.all([
    fetch("./data/events.geojson").then(r => r.json()),
    fetch("./data/peripheries.geojson").then(r => r.json()),
    fetch("./data/municipalities.geojson").then(r => r.json()),
    fetch("./data/decentralized.geojson").then(r => r.json()),
    fetch("./data/insights.json").then(r => r.json())
  ]);

  state.events = events.features || [];
  state.insights = insights || {};
  setHeader();
  setStaticKpis();
  populateFilters();
  updateRankLists();
  addPolygonLayers(per, mun, dec);
  renderMarkers();
  setLayerToggles();
  wireFilters();
}

async function boot() {
  initMap();
  try {
    await loadData();
  } catch (err) {
    // Keep error text simple and visible in UI.
    const panel = document.getElementById("event-detail");
    panel.classList.remove("empty");
    panel.innerHTML = `<strong>Σφάλμα φόρτωσης δεδομένων:</strong> ${escapeHtml(err.message || String(err))}`;
  }
}

boot();


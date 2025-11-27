// js/app.js

// ==== CONFIGURAÇÃO DOS CENÁRIOS ====
const SCENARIOS = {
  A_climate_only: {
    label: "A – Climate only",
    file: "data/scenarios/A_climate_only.csv",
  },
  B_vaccination_up: {
    label: "B – Vaccination up",
    file: "data/scenarios/B_vaccination_up.csv",
  },
  C_vaccination_down: {
    label: "C – Vaccination down",
    file: "data/scenarios/C_vaccination_down.csv",
  },
  D_population_up: {
    label: "D – Population up",
    file: "data/scenarios/D_population_up.csv",
  },
  E_population_down: {
    label: "E – Population down",
    file: "data/scenarios/E_population_down.csv",
  },
  F_landuse_agroexpansion: {
    label: "F – Land-use agro expansion",
    file: "data/scenarios/F_landuse_agroexpansion.csv",
  },
  G_landuse_conservation: {
    label: "G – Land-use conservation",
    file: "data/scenarios/G_landuse_conservation.csv",
  },
};

// Caminho para o GeoJSON de municípios
const GEOJSON_URL = "data/br_municipios_2022_simplified.geojson";

// ==== VARIÁVEIS GLOBAIS ====
let map;
let geojsonLayer;
let riskByMunicipio = {}; // { cod_mun6: risk_prob }
let muniIndex = []; // [{ name, cod_mun7, cod_mun6 }]
let currentScenarioKey = "A_climate_only";

// Elementos da UI
const scenarioSelect = document.getElementById("scenarioSelect");
const searchInput = document.getElementById("municipalitySearch");
const suggestionsDiv = document.getElementById("searchSuggestions");

const infoName = document.getElementById("infoName");
const infoCode = document.getElementById("infoCode");
const infoRisk = document.getElementById("infoRisk");

// ==== FUNÇÃO PARA COR DE RISCO (GRADIENTE VERMELHO) ====
function getColor(r) {
  if (r === null || isNaN(r)) return "#f0f0f0";
  // valores típicos de risco são baixos – ajustamos a escala
  return r > 0.15
    ? "#800026"
    : r > 0.10
    ? "#BD0026"
    : r > 0.07
    ? "#E31A1C"
    : r > 0.04
    ? "#FC4E2A"
    : r > 0.02
    ? "#FD8D3C"
    : r > 0.01
    ? "#FEB24C"
    : r > 0
    ? "#FED976"
    : "#FFEDA0";
}

// ==== STYLE FUNCTION PARA GEOJSON ====
function styleFeature(feature) {
  // CD_MUN_STR (7 dígitos); nosso CSV tem 6 dígitos
  const cod7 = String(feature.properties.CD_MUN_STR || feature.properties.CD_MUN || "").padStart(7, "0");
  const cod6 = cod7.slice(0, 6);

  const risk = riskByMunicipio[cod6] ?? null;

  return {
    fillColor: getColor(risk),
    weight: 0.3,
    opacity: 1,
    color: "#555",
    fillOpacity: risk === null ? 0.2 : 0.8,
  };
}

// ==== HANDLERS DE INTERAÇÃO EM CADA POLÍGONO ====
function onEachFeature(feature, layer) {
  const muniName = feature.properties.NM_MUN || "Unknown";
  const cod7 = String(feature.properties.CD_MUN_STR || feature.properties.CD_MUN || "").padStart(7, "0");
  const cod6 = cod7.slice(0, 6);

  layer.on("click", () => {
    const risk = riskByMunicipio[cod6];
    const riskText = risk != null ? risk.toFixed(4) : "No data";

    // Atualiza painel
    infoName.textContent = muniName;
    infoCode.textContent = cod7;
    infoRisk.textContent = riskText;

    // Popup Leaflet
    layer.bindPopup(
      `<strong>${muniName}</strong><br/>IBGE: ${cod7}<br/>Risk: ${riskText}`
    ).openPopup();
  });
}

// ==== CARREGAR CSV DE CENÁRIO ====
async function loadScenarioCSV(scenarioKey) {
  const scen = SCENARIOS[scenarioKey];
  riskByMunicipio = {};

  const resp = await fetch(scen.file);
  const text = await resp.text();

  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idxCod = header.indexOf("cod_mun");
  const idxRisk = header.indexOf("risk_prob");

  if (idxCod === -1 || idxRisk === -1) {
    console.error("CSV must contain cod_mun and risk_prob columns");
    return;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",");
    const cod = cols[idxCod].padStart(6, "0");
    const risk = parseFloat(cols[idxRisk]);
    if (!isNaN(risk)) {
      riskByMunicipio[cod] = risk;
    }
  }

  // Reestiliza o layer com o novo cenário
  if (geojsonLayer) {
    geojsonLayer.setStyle(styleFeature);
  }
}

// ==== INICIALIZA MAPA ====
async function initMap() {
  // 1. Mapa base
  map = L.map("map").setView([-15.8, -47.9], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a>',
  }).addTo(map);

  // 2. Carrega GeoJSON de municípios
  const resp = await fetch(GEOJSON_URL);
  const geojson = await resp.json();

  // 3. Index para busca
  muniIndex = geojson.features.map((f) => {
    const name = f.properties.NM_MUN || "Unknown";
    const cod7 = String(f.properties.CD_MUN_STR || f.properties.CD_MUN || "").padStart(7, "0");
    return {
      name,
      cod_mun7: cod7,
      cod_mun6: cod7.slice(0, 6),
      feature: f,
    };
  });

  // 4. Cria camada GeoJSON (sem risco ainda)
  geojsonLayer = L.geoJSON(geojson, {
    style: styleFeature,
    onEachFeature: onEachFeature,
  }).addTo(map);

  map.fitBounds(geojsonLayer.getBounds());

  // 5. Preenche dropdown de cenários
  Object.entries(SCENARIOS).forEach(([key, cfg]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = cfg.label;
    if (key === currentScenarioKey) opt.selected = true;
    scenarioSelect.appendChild(opt);
  });

  // 6. Carrega cenário inicial
  await loadScenarioCSV(currentScenarioKey);

  // 7. Event listeners
  scenarioSelect.addEventListener("change", async (e) => {
    currentScenarioKey = e.target.value;
    await loadScenarioCSV(currentScenarioKey);
  });

  setupSearch();
}

// ==== BUSCA DE MUNICÍPIO + AUTOCOMPLETE ====
function setupSearch() {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    suggestionsDiv.innerHTML = "";
    if (!query || query.length < 2) {
      suggestionsDiv.style.display = "none";
      return;
    }

    const matches = muniIndex
      .filter((m) => m.name.toLowerCase().includes(query))
      .slice(0, 15); // limita

    if (!matches.length) {
      suggestionsDiv.style.display = "none";
      return;
    }

    matches.forEach((m) => {
      const div = document.createElement("div");
      div.className = "suggestion-item";
      div.textContent = `${m.name} (${m.cod_mun7})`;
      div.addEventListener("click", () => {
        searchInput.value = m.name;
        suggestionsDiv.style.display = "none";
        zoomToMunicipio(m);
      });
      suggestionsDiv.appendChild(div);
    });

    suggestionsDiv.style.display = "block";
  });

  document.addEventListener("click", (e) => {
    if (!suggestionsDiv.contains(e.target) && e.target !== searchInput) {
      suggestionsDiv.style.display = "none";
    }
  });
}

function zoomToMunicipio(muni) {
  // encontra o layer correspondente
  let targetLayer = null;
  geojsonLayer.eachLayer((layer) => {
    const props = layer.feature.properties;
    const cod7 = String(props.CD_MUN_STR || props.CD_MUN || "").padStart(7, "0");
    if (cod7 === muni.cod_mun7) {
      targetLayer = layer;
    }
  });

  if (targetLayer) {
    const risk = riskByMunicipio[muni.cod_mun6];
    const riskText = risk != null ? risk.toFixed(4) : "No data";

    infoName.textContent = muni.name;
    infoCode.textContent = muni.cod_mun7;
    infoRisk.textContent = riskText;

    map.fitBounds(targetLayer.getBounds(), { maxZoom: 8 });
    targetLayer.bindPopup(
      `<strong>${muni.name}</strong><br/>IBGE: ${muni.cod_mun7}<br/>Risk: ${riskText}`
    ).openPopup();
  }
}

// ==== START ====
initMap().catch((err) => {
  console.error("Error initializing map:", err);
});

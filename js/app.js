// js/app.js

// ==== CONFIGURAÇÃO DOS CENÁRIOS ====
const SCENARIOS = {
  A_climate_only: {
    label: "A – Climate only",
    file: "data/scenarios/A_climate_only.csv",
    desc: "Future climate (2021–2040, MIROC6 SSP2-4.5) applied to all municipalities; vaccination, population and land-use held at baseline levels."
  },
  B_vaccination_up: {
    label: "B – Vaccination up",
    file: "data/scenarios/B_vaccination_up.csv",
    desc: "Same future climate as A, but vaccination coverage increased by 20% in all municipalities."
  },
  C_vaccination_down: {
    label: "C – Vaccination down",
    file: "data/scenarios/C_vaccination_down.csv",
    desc: "Future climate with a 20% reduction in vaccination coverage, amplifying risk in susceptible areas."
  },
  D_population_up: {
    label: "D – Population up",
    file: "data/scenarios/D_population_up.csv",
    desc: "Future climate combined with a 15% increase in population size, increasing exposed population."
  },
  E_population_down: {
    label: "E – Population down",
    file: "data/scenarios/E_population_down.csv",
    desc: "Future climate with a 10% reduction in population, simulating demographic decline."
  },
  F_landuse_agroexpansion: {
    label: "F – Land-use agro expansion",
    file: "data/scenarios/F_landuse_agroexpansion.csv",
    desc: "Future climate with agricultural expansion: pasture +20%, urban area +10%, forest -5%."
  },
  G_landuse_conservation: {
    label: "G – Land-use conservation",
    file: "data/scenarios/G_landuse_conservation.csv",
    desc: "Future climate with a conservation scenario: forest cover +10% and pasture –10%."
  },
};

// Caminho para o GeoJSON
const GEOJSON_URL = "data/br_municipios_2022_simplified.geojson";

// ==== VARIÁVEIS GLOBAIS ====
let map;
let geojsonLayer;
let riskByMunicipio = {}; // { cod_mun6: risk_prob }
let muniIndex = []; // Busca rápida
let currentScenarioKey = "A_climate_only";

// Elementos da UI
const scenarioSelect = document.getElementById("scenarioSelect");
const searchInput = document.getElementById("municipalitySearch");
const suggestionsDiv = document.getElementById("searchSuggestions");
const scenarioDescDiv = document.getElementById("scenarioDescription");

const infoName = document.getElementById("infoName");
const infoCode = document.getElementById("infoCode");
const infoRisk = document.getElementById("infoRisk");

// ==== CORES DO RISCO ====
function getColor(r) {
  if (r === null || isNaN(r)) return "#f0f0f0";
  // Ajuste estes limites conforme a distribuição real dos seus dados
  return r > 0.25 ? "#800026" :
         r > 0.15 ? "#BD0026" :
         r > 0.10 ? "#E31A1C" :
         r > 0.05 ? "#FC4E2A" :
         r > 0.02 ? "#FD8D3C" :
         r > 0.01 ? "#FEB24C" :
         r > 0    ? "#FFEDA0" :
                    "#FFEDA0";
}

// ==== ESTILO DO MAPA ====
function styleFeature(feature) {
  // O GeoJSON tem 7 dígitos (ex: 1100015). Convertemos para 6 (110001).
  const cod7 = String(feature.properties.CD_MUN_STR || feature.properties.CD_MUN || "").padStart(7, "0");
  const cod6 = cod7.slice(0, 6);

  const risk = riskByMunicipio[cod6] ?? null;

  return {
    fillColor: getColor(risk),
    weight: 0.5,
    opacity: 1,
    color: "#666",
    fillOpacity: risk === null ? 0.3 : 0.9, 
  };
}

// ==== INTERAÇÃO (CLIQUE) ====
function onEachFeature(feature, layer) {
  const muniName = feature.properties.NM_MUN || "Unknown";
  const cod7 = String(feature.properties.CD_MUN_STR || feature.properties.CD_MUN || "").padStart(7, "0");
  const cod6 = cod7.slice(0, 6);

  layer.on("click", () => {
    const risk = riskByMunicipio[cod6];
    const riskText = risk != null ? risk.toFixed(4) : "No data";

    // Atualiza barra lateral
    if(infoName) infoName.textContent = muniName;
    if(infoCode) infoCode.textContent = cod7;
    if(infoRisk) infoRisk.textContent = riskText;

    // Popup
    layer.bindPopup(
      `<strong>${muniName}</strong><br/>Code: ${cod7}<br/>Risk: ${riskText}`
    ).openPopup();
  });
}

// ==== CARREGAR CSV (A CORREÇÃO ESTÁ AQUI) ====
async function loadScenarioCSV(scenarioKey) {
  const scen = SCENARIOS[scenarioKey];
  riskByMunicipio = {};

  // Atualiza descrição visual
  if (scenarioDescDiv) scenarioDescDiv.textContent = scen.desc;

  try {
    const resp = await fetch(scen.file);
    if (!resp.ok) throw new Error("CSV not found: " + scen.file);
    const text = await resp.text();

    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(",");
    
    // Tenta achar colunas de forma flexível
    let idxCod = header.indexOf("cod_mun");
    if (idxCod === -1) idxCod = header.indexOf("CD_MUN");
    
    let idxRisk = header.indexOf("risk_prob");
    if (idxRisk === -1) idxRisk = header.indexOf("risk");

    if (idxCod === -1 || idxRisk === -1) {
      console.error("CSV Headers missing (need cod_mun and risk_prob). Found:", header);
      return;
    }

    console.log(`Carregando ${scen.label}...`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(",");

      // --- CORREÇÃO DO CÓDIGO ---
      // Se vier "0110001", parseInt transforma em 110001 (número), 
      // e String transforma em "110001" (texto sem zero à esquerda).
      let rawCod = cols[idxCod];
      let cleanCod = String(parseInt(rawCod, 10)); 
      
      // Garante 6 dígitos (caso o código seja realmente curto, ex: SP 35xxxx)
      // Mas para o seu caso de 0110001 -> vira 110001 (6 digitos) perfeito.
      if (cleanCod.length === 6) {
         // Código válido
      } else {
         // Fallback se algo der errado
         cleanCod = cleanCod.padStart(6, "0"); 
      }
      
      const risk = parseFloat(cols[idxRisk]);

      if (!isNaN(risk)) {
        riskByMunicipio[cleanCod] = risk;
      }
    }
    
    console.log(`Dados carregados: ${Object.keys(riskByMunicipio).length} municípios com risco.`);

    // Re-pintar o mapa
    if (geojsonLayer) {
      geojsonLayer.setStyle(styleFeature);
    }

  } catch (err) {
    console.error("Erro ao carregar CSV:", err);
  }
}

// ==== INICIALIZAÇÃO GERAL ====
async function initMap() {
  // 1. Mapa Base
  map = L.map("map").setView([-15.0, -55.0], 4); // Centro do Brasil
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19
  }).addTo(map);

  // 2. Carrega GeoJSON
  try {
    const resp = await fetch(GEOJSON_URL);
    if (!resp.ok) throw new Error("GeoJSON not found");
    const geojson = await resp.json();

    // 3. Cria índice para busca
    muniIndex = geojson.features.map((f) => {
      const name = f.properties.NM_MUN || "Unknown";
      const cod7 = String(f.properties.CD_MUN_STR || f.properties.CD_MUN || "").padStart(7, "0");
      return {
        name: name,
        cod_mun7: cod7,
        cod_mun6: cod7.slice(0, 6),
        feature: f,
      };
    });

    // 4. Cria camada no mapa
    geojsonLayer = L.geoJSON(geojson, {
      style: styleFeature,
      onEachFeature: onEachFeature,
    }).addTo(map);
    
    map.fitBounds(geojsonLayer.getBounds());

  } catch (err) {
    console.error("Erro fatal no GeoJSON:", err);
    return;
  }

  // 5. Preenche Dropdown
  Object.entries(SCENARIOS).forEach(([key, cfg]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = cfg.label;
    if (key === currentScenarioKey) opt.selected = true;
    scenarioSelect.appendChild(opt);
  });

  // 6. Carrega cenário inicial
  await loadScenarioCSV(currentScenarioKey);

  // 7. Listeners
  scenarioSelect.addEventListener("change", (e) => {
    currentScenarioKey = e.target.value;
    loadScenarioCSV(currentScenarioKey);
  });

  setupSearch();
}

// ==== LÓGICA DE BUSCA ====
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
      .slice(0, 10);

    if (matches.length === 0) {
      suggestionsDiv.style.display = "none";
      return;
    }

    matches.forEach((m) => {
      const div = document.createElement("div");
      div.className = "suggestion-item";
      div.textContent = `${m.name} (${m.cod_mun7})`;
      div.onclick = () => {
        searchInput.value = m.name;
        suggestionsDiv.style.display = "none";
        zoomToMunicipio(m);
      };
      suggestionsDiv.appendChild(div);
    });
    suggestionsDiv.style.display = "block";
  });

  // Esconder sugestões ao clicar fora
  document.addEventListener("click", (e) => {
    if (!suggestionsDiv.contains(e.target) && e.target !== searchInput) {
      suggestionsDiv.style.display = "none";
    }
  });
}

function zoomToMunicipio(muni) {
  // Acha o layer específico
  geojsonLayer.eachLayer((layer) => {
    const props = layer.feature.properties;
    const cod7 = String(props.CD_MUN_STR || props.CD_MUN || "").padStart(7, "0");
    
    if (cod7 === muni.cod_mun7) {
      map.fitBounds(layer.getBounds(), { maxZoom: 9 });
      layer.fire("click"); // Simula clique para abrir popup e atualizar painel
    }
  });
}

// Start
initMap();

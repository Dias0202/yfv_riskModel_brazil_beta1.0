// ======================
// CONFIGURAÇÃO BÁSICA
// ======================

const GEOJSON_URL = "data/br_municipios_2022_simplified.geojson";
const DATASET_URL = "data/datasetFinal.csv";

// Lista de todas as variáveis que queremos carregar
const ALL_VARIABLES = [
  "yfv_ocorreu",
  "vac_coverage",
  "Forest_formation-mean_normalized",
  "Pasture-mean_normalized",
  "Urban_area-mean_normalized",
  "tmax_mean",   
  "ppt_mean",    
  "pop_density_last"
];
// Descrições das variáveis
const VARIABLE_DESCRIPTIONS = {
  yfv_ocorreu:
    "Binary indicator (0/1) of Yellow Fever occurrence.",
  vac_coverage:
    "Vaccination coverage rate (0-1).",
  "Forest_formation-mean_normalized":
    "Normalized mean of forest formation coverage.",
  "Pasture-mean_normalized":
    "Normalized mean of pasture area.",
  "Urban_area-mean_normalized":
    "Normalized mean of urban area.",
  // NOVAS DESCRIÇÕES
  "tmax_mean":
    "Average Maximum Temperature (°C). Simulates warming in future scenarios.",
  "ppt_mean":
    "Average Precipitation (mm). Simulates rainfall patterns.",
  // FIM NOVAS DESCRIÇÕES
  "pop_ibge_cluster":
    "Estimated absolute population count (IBGE) for the municipality in the selected period.",
  forest_loss_rate_proxy:
    "Proxy for forest loss rate."
};

// Períodos temporais
const CLUSTERS = {
  C1_1994_1999: "1994–1999",
  C2_2000_2008: "2000–2008",
  C3_2009_2014: "2009–2014",
  C4_2015_2019: "2015–2019",
  C5_2020_2025: "2020–2025"
};

// ======================
// VARIÁVEIS GLOBAIS
// ======================

let map;
let geojsonLayer;
let datasetData = {};       // { cod_mun6: { cluster: { variable: value } } }
let variableStats = {};     // { variable: {min,max,q05,q25,q50,q75,q95} }

let currentVariable = "yfv_ocorreu";
let currentCluster = "C1_1994_1999";

// Para lembrar município clicado
let currentSelectedMunicipality = null;
let currentSelectedLayer = null;

// Elementos da UI
const variableSelect = document.getElementById("variableSelect");
const clusterSelect = document.getElementById("clusterSelect");
const variableDescDiv = document.getElementById("variableDescription");

const infoName = document.getElementById("infoName");
const infoCode = document.getElementById("infoCode");
const infoVariable = document.getElementById("infoVariable");
const infoValue = document.getElementById("infoValue");

// ======================
// INICIALIZAÇÃO
// ======================

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupEventListeners();
});

function setupEventListeners() {
  if (variableSelect) {
    variableSelect.addEventListener("change", (e) => {
      currentVariable = e.target.value;
      updateVariableDescription();
      refreshMapColors();
      updateSelectedMunicipalityDisplay();
    });
  }

  if (clusterSelect) {
    clusterSelect.addEventListener("change", (e) => {
      currentCluster = e.target.value;
      refreshMapColors();
      updateSelectedMunicipalityDisplay();
    });
  }
}

function updateVariableDescription() {
  if (variableDescDiv) {
    variableDescDiv.textContent =
      VARIABLE_DESCRIPTIONS[currentVariable] || "No description available.";
  }
}

// ======================
// CARREGAR DADOS + ESTATÍSTICAS POR VARIÁVEL
// ======================

async function loadDataset() {
  console.log("📊 Carregando dataset completo...");

  try {
    const response = await fetch(DATASET_URL);
    if (!response.ok) throw new Error("Dataset CSV not found");
    const text = await response.text();

    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) {
      console.error("Dataset CSV vazio");
      return;
    }

    const header = lines[0].split(",");
    const columnIndices = {};

    columnIndices.cod_mun = header.indexOf("cod_mun");
    columnIndices.cluster = header.indexOf("cluster");

    ALL_VARIABLES.forEach((variable) => {
      columnIndices[variable] = header.indexOf(variable);
    });

    console.log("Índices das colunas:", columnIndices);

    if (columnIndices.cod_mun === -1 || columnIndices.cluster === -1) {
      console.error("Colunas cod_mun ou cluster não encontradas no CSV");
      return;
    }

    const tempData = {};
    const valuesByVar = {};
    ALL_VARIABLES.forEach((v) => {
      valuesByVar[v] = [];
    });

    let loadedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");
      const codMunRaw = row[columnIndices.cod_mun];
      const cluster = row[columnIndices.cluster]?.trim();
      if (!codMunRaw || !cluster) continue;

      // deixa só dígitos (por segurança) e usa 6 dígitos (padrão IBGE base)
      const codMunClean = codMunRaw.trim().replace(/\D/g, "");
      if (!codMunClean) continue;
      const codMun = codMunClean; // ex: "110001"

      if (!tempData[codMun]) {
        tempData[codMun] = {};
      }

      const values = {};
      ALL_VARIABLES.forEach((variable) => {
        const colIndex = columnIndices[variable];
        let value = null;

        if (colIndex !== -1 && colIndex < row.length) {
          const rawValue = row[colIndex]?.trim();
          if (rawValue !== "" && rawValue != null) {
            const num = Number(rawValue);
            if (Number.isFinite(num)) {
              value = num;
            }
          }
        }

        values[variable] = value;
        if (value !== null) {
          valuesByVar[variable].push(value);
        }
      });

      tempData[codMun][cluster] = values;
      loadedCount++;

      if (loadedCount <= 5) {
        console.log(`Amostra ${loadedCount}:`, codMun, cluster, values);
      }
    }

    datasetData = tempData;
    console.log(
      `✅ Dataset carregado: ${Object.keys(datasetData).length} municípios, ${loadedCount} registros`
    );

    // ---- Calcula estatísticas por variável (quantis) ----
    variableStats = {};

    function quantile(sortedArr, q) {
      if (!sortedArr.length) return null;
      const pos = (sortedArr.length - 1) * q;
      const base = Math.floor(pos);
      const rest = pos - base;
      if (sortedArr[base + 1] !== undefined) {
        return (
          sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base])
        );
      }
      return sortedArr[base];
    }

    ALL_VARIABLES.forEach((variable) => {
      const arr = valuesByVar[variable];
      if (!arr || !arr.length) return;

      arr.sort((a, b) => a - b);

      const stats = {
        min: arr[0],
        max: arr[arr.length - 1],
        q05: quantile(arr, 0.05),
        q25: quantile(arr, 0.25),
        q50: quantile(arr, 0.5),
        q75: quantile(arr, 0.75),
        q95: quantile(arr, 0.95)
      };

      variableStats[variable] = stats;
      console.log(`📐 Stats ${variable}:`, stats);
    });
  } catch (error) {
    console.error("❌ Erro ao carregar dataset:", error);
  }
}

// ======================
// INICIALIZAR MAPA
// ======================

async function initMap() {
  await loadDataset();

  map = L.map("map").setView([-15.0, -55.0], 4);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19
    }
  ).addTo(map);

  try {
    const response = await fetch(GEOJSON_URL);
    if (!response.ok) throw new Error("GeoJSON not found");
    const geojson = await response.json();

    geojsonLayer = L.geoJSON(geojson, {
      style: styleFeature,
      onEachFeature: onEachFeature
    }).addTo(map);

    map.fitBounds(geojsonLayer.getBounds());
    updateVariableDescription();

    console.log("✅ Mapa inicializado com sucesso");
  } catch (error) {
    console.error("❌ Erro ao carregar GeoJSON:", error);
  }
}

// ======================
// ESTILO DO MAPA
// ======================

function styleFeature(feature) {
  const props = feature.properties || {};
  const cod7 = String(props.CD_MUN_STR || props.CD_MUN || "").padStart(7, "0");
  const cod6 = cod7.slice(0, 6);

  const value = getVariableValue(cod6, currentCluster, currentVariable);
  const fillColor = getColorForVariable(value, currentVariable);

  return {
    fillColor: fillColor,
    weight: 0.5,
    opacity: 1,
    color: "#666",
    fillOpacity: value === null ? 0.3 : 0.9
  };
}

function getVariableValue(cod6, cluster, variable) {
  const muniData = datasetData[cod6];
  if (!muniData) return null;

  const clusterData = muniData[cluster];
  if (!clusterData) return null;

  const value = clusterData[variable];
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

// ======================
// ESCALA DE CORES (COM QUANTIS)
// ======================

function getColorForVariable(value, variable) {
  if (value === null || Number.isNaN(value)) return "#f8f8f8";

  // 1) Ocorrência binária de FA
  if (variable === "yfv_ocorreu") {
    return value === 1 ? "#e31a1c" : "#f0f0f0";
  }

  // 2) Cobertura vacinal – paleta azul específica (0–1)
  if (variable === "vac_coverage") {
    if (value >= 0.95) return "#08306b";
    if (value >= 0.80) return "#2171b5";
    if (value >= 0.60) return "#6baed6";
    if (value >= 0.40) return "#bdd7e7";
    if (value > 0) return "#eff3ff";
    return "#f8f8f8";
  }

  // 3) Clima (tmax e ppt)
  if (variable === "tmax_mean") {
     // Temperatura: quanto mais quente, mais vermelho
     if (value >= 32) return "#b2182b";
     if (value >= 30) return "#d6604d";
     if (value >= 28) return "#f4a582";
     if (value >= 26) return "#fddbc7";
     return "#f7f7f7";
  }
  if (variable === "ppt_mean") {
     // Chuva: quanto mais chuva, mais azul
     if (value >= 200) return "#053061";
     if (value >= 150) return "#2166ac";
     if (value >= 100) return "#4393c3";
     if (value >= 50)  return "#92c5de";
     return "#f7f7f7";
  }

  // 4) Demais variáveis contínuas: escala por quantis (0.05–0.95)
  const stats = variableStats[variable];
  if (!stats) {
    // fallback genérico
    if (value > 0.8) return "#800026";
    if (value > 0.6) return "#bd0026";
    if (value > 0.4) return "#e31a1c";
    if (value > 0.2) return "#fc4e2a";
    if (value > 0.0) return "#fd8d3c";
    return "#ffeda0";
  }

  let v = value;
  // clip entre q05 e q95 pra ignorar outliers extremos
  if (v < stats.q05) v = stats.q05;
  if (v > stats.q95) v = stats.q95;

  const { q25, q50, q75, q95 } = stats;

  // Paleta tipo "Reds" (ColorBrewer-like)
  if (v <= q25) return "#fff5eb";
  if (v <= q50) return "#fee6ce";
  if (v <= q75) return "#fdae6b";
  if (v <= q95) return "#e6550d";
  return "#a63603";
}

// ======================
// INTERAÇÃO COM O MAPA
// ======================

function onEachFeature(feature, layer) {
  const props = feature.properties || {};
  const name = props.NM_MUN || "Unknown";
  const cod7 = String(props.CD_MUN_STR || props.CD_MUN || "").padStart(7, "0");
  const cod6 = cod7.slice(0, 6);

  layer.on("click", () => {
    currentSelectedMunicipality = { cod6, name, cod7 };
    currentSelectedLayer = layer;

    updateSelectedMunicipalityDisplay();

    const value = getVariableValue(cod6, currentCluster, currentVariable);
    const valueText = value === null ? "No data" : value.toFixed(4);
    const variableName =
      variableSelect && variableSelect.options[variableSelect.selectedIndex]
        ? variableSelect.options[variableSelect.selectedIndex].text
        : currentVariable;

    layer
      .bindPopup(
        `<strong>${name}</strong><br/>
         Code: ${cod7}<br/>
         ${variableName}: ${valueText}<br/>
         Period: ${CLUSTERS[currentCluster]}`
      )
      .openPopup();
  });
}

function updateSelectedMunicipalityDisplay() {
  if (!currentSelectedMunicipality) return;

  const { cod6, name, cod7 } = currentSelectedMunicipality;
  const value = getVariableValue(cod6, currentCluster, currentVariable);
  const valueText = value === null ? "No data" : value.toFixed(4);
  const variableName =
    variableSelect && variableSelect.options[variableSelect.selectedIndex]
      ? variableSelect.options[variableSelect.selectedIndex].text
      : currentVariable;

  if (infoName) infoName.textContent = name;
  if (infoCode) infoCode.textContent = cod7;
  if (infoVariable) infoVariable.textContent = variableName;
  if (infoValue) infoValue.textContent = valueText;

  if (currentSelectedLayer && currentSelectedLayer.getPopup()) {
    currentSelectedLayer.setPopupContent(
      `<strong>${name}</strong><br/>
       Code: ${cod7}<br/>
       ${variableName}: ${valueText}<br/>
       Period: ${CLUSTERS[currentCluster]}`
    );
  }

  console.log(
    `✅ Display atualizado: ${name}, ${variableName} (${currentCluster}): ${valueText}`
  );
}

// ======================
// ATUALIZAÇÃO DO MAPA
// ======================

function refreshMapColors() {
  if (geojsonLayer) {
    geojsonLayer.setStyle(styleFeature);
    updateVariableDescription();
    updateSelectedMunicipalityDisplay();
    console.log(
      `🔄 Mapa atualizado: ${currentVariable} (${CLUSTERS[currentCluster]})`
    );
  }
}

// ======================
// FUNÇÃO DE DEBUG
// ======================

function debugData(codMun) {
  console.log(`=== DEBUG: ${codMun} ===`);
  console.log("Dados carregados:", datasetData[codMun]);
  if (datasetData[codMun]) {
    Object.keys(datasetData[codMun]).forEach((cluster) => {
      console.log(`Cluster ${cluster}:`, datasetData[codMun][cluster]);
    });
  }
}


window.debugData = debugData;




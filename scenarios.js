// ======================
// CONFIGURAÇÃO BÁSICA
// ======================

// GeoJSON dos municípios (simplificado em QGIS).
const GEOJSON_URL = "data/br_municipios_2022_simplified.geojson";

// Pasta onde estão os CSVs dos cenários.
// Exemplo de arquivos esperados:
//   data/scenarios/A_climate_only.csv
//   data/scenarios/B_vaccination_up.csv
//   ...
const SCENARIOS_BASE_PATH = "data/scenarios";

// Descrição dos cenários (texto exibido abaixo de "Selected municipality")
const SCENARIO_DESCRIPTIONS = {
  A_climate_only:
    "Future climate (2021–2040, MIROC6 SSP2-4.5) applied to all municipalities; vaccination, population and land-use held at baseline levels.",
  B_vaccination_up:
    "Same future climate as A, but vaccination coverage increased by 20% in all municipalities (risk concentrated where structural drivers persist).",
  C_vaccination_down:
    "Future climate with a 20% reduction in vaccination coverage, amplifying risk in areas that are already environmentally suitable.",
  D_population_up:
    "Future climate combined with a 15% increase in population size, increasing exposed population especially in peri-urban and expanding areas.",
  E_population_down:
    "Future climate with a 10% reduction in population, simulating demographic decline or effective migration away from high-risk areas.",
  F_landuse_agroexpansion:
    "Future climate with agricultural expansion: pasture +20%, urban area +10%, and a small loss of forest cover (–5%), increasing risk in frontier municipalities.",
  G_landuse_conservation:
    "Future climate with a conservation scenario: forest cover +10% and pasture –10%, reducing the structural suitability for sylvatic YF transmission."
};

// ======================
// VARIÁVEIS GLOBAIS
// ======================

let mapScenario = null;
let baseGeoJSONData = null; // GeoJSON em memória
let scenarioLayer = null;   // camada atual
let riskLookup = {};        // { cod7: risk_prob }  <-- IMPORTANTE: 7 dígitos

// ======================
// INICIALIZAÇÃO
// ======================

document.addEventListener("DOMContentLoaded", () => {
  initScenarioMap();
  const select = document.getElementById("scenario-select");
  if (select) {
    select.addEventListener("change", updateScenarioFromSelect);
  }
});

// ======================
// CARREGAR GEOJSON UMA VEZ
// ======================

async function initScenarioMap() {
  try {
    const res = await fetch(GEOJSON_URL);
    if (!res.ok) {
      console.error("Erro ao carregar GeoJSON:", res.status, res.statusText);
      return;
    }
    baseGeoJSONData = await res.json();

    // Cria o mapa SEM mapa de fundo (sem tileLayer)
    mapScenario = L.map("scenario-map", {
      zoomControl: true,
      attributionControl: false
    });

    // Ajusta o mapa para enquadrar o Brasil
    const tmpLayer = L.geoJSON(baseGeoJSONData);
    mapScenario.fitBounds(tmpLayer.getBounds());

    // Desenha o primeiro cenário (selecionado no <select>)
    updateScenarioFromSelect();
  } catch (err) {
    console.error("Falha ao inicializar mapa de cenário:", err);
  }
}

// ======================
// CARREGAR CSV DE UM CENÁRIO
// ======================

async function loadScenarioCSV(scenId) {
  const csvPath = `${SCENARIOS_BASE_PATH}/${scenId}.csv`;
  console.log("Carregando CSV do cenário:", csvPath);

  const res = await fetch(csvPath);
  if (!res.ok) {
    console.error("Erro ao carregar CSV do cenário:", res.status, res.statusText);
    riskLookup = {};
    return;
  }

  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    console.warn("CSV vazio ou sem linhas de dados.");
    riskLookup = {};
    return;
  }

  const header = lines[0].split(",");
  // Tenta achar coluna de código de município
  let idxCod = header.indexOf("cod_mun");
  if (idxCod === -1) {
    idxCod = header.indexOf("CD_MUN");
  }

  // Tenta achar coluna de risco
  let idxRisk = header.indexOf("risk_prob");
  if (idxRisk === -1) {
    idxRisk = header.indexOf("risk");
    if (idxRisk === -1 && header.length > 1) {
      idxRisk = 1; // fallback: segunda coluna
    }
  }

  if (idxCod === -1 || idxRisk === -1) {
    console.error(
      "CSV não tem colunas esperadas (cod_mun / risk_prob). Cabeçalho encontrado:",
      header
    );
    riskLookup = {};
    return;
  }

  const tmpLookup = {};

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (row.length <= Math.max(idxCod, idxRisk)) continue;

    let cod = row[idxCod].trim();
    let risk = parseFloat(row[idxRisk]);

    if (!cod || isNaN(risk)) continue;

    // AGORA: usamos 7 dígitos, igual ao GeoJSON (CD_MUN / CD_MUN_STR)
    cod = cod.replace(/\D/g, "");    // só dígitos
    cod = cod.padStart(7, "0");      // garante 7 dígitos

    tmpLookup[cod] = risk;
  }

  riskLookup = tmpLookup;
  console.log(
    "Risks carregados para cenário",
    scenId,
    "(",
    Object.keys(riskLookup).length,
    "municípios )"
  );
}

// ======================
// ATUALIZAR CENÁRIO SELECIONADO
// ======================

async function updateScenarioFromSelect() {
  if (!baseGeoJSONData || !mapScenario) return;

  const select = document.getElementById("scenario-select");
  const scenId = select ? select.value : "A_climate_only";

  // Atualiza texto de descrição do cenário
  const descElem = document.getElementById("scenario-description");
  if (descElem) {
    descElem.textContent = SCENARIO_DESCRIPTIONS[scenId] || "";
  }

  // Carrega CSV e monta lookup de risco
  await loadScenarioCSV(scenId);

  // Remove camada anterior se existir
  if (scenarioLayer) {
    mapScenario.removeLayer(scenarioLayer);
  }

  // Cria nova camada com estilo baseado em riskLookup
  scenarioLayer = L.geoJSON(baseGeoJSONData, {
    style: styleFeatureByRisk,
    onEachFeature: onEachFeatureScenario
  }).addTo(mapScenario);

  // Garante que o mapa esteja enquadrado
  if (scenarioLayer.getBounds().isValid()) {
    mapScenario.fitBounds(scenarioLayer.getBounds());
  }
}

// ======================
// ESTILO DAS FEATURES
// ======================

function styleFeatureByRisk(feature) {
  const props = feature.properties || {};
  let cod7 = null;

  if (props.CD_MUN_STR) {
    cod7 = String(props.CD_MUN_STR);
  } else if (props.CD_MUN) {
    cod7 = String(props.CD_MUN);
  } else if (props.cod_mun) {
    cod7 = String(props.cod_mun);
  }

  if (cod7) {
    cod7 = cod7.replace(/\D/g, "").padStart(7, "0");
  }

  const risk = cod7 ? riskLookup[cod7] : null;

  const fillColor = risk == null ? "#f0f0f0" : riskColorScale(risk);

  return {
    fillColor: fillColor,
    weight: 0.3,
    opacity: 1,
    color: "#999999",
    fillOpacity: risk == null ? 0.7 : 0.9
  };
}

// Escala simples de cor para risco (vermelho em gradiente)
function riskColorScale(risk) {
  // risco esperado ~0–0.3, mas pode ir acima em hotspots
  if (risk >= 0.25) return "#800026";
  if (risk >= 0.15) return "#BD0026";
  if (risk >= 0.10) return "#E31A1C";
  if (risk >= 0.05) return "#FC4E2A";
  if (risk >= 0.02) return "#FD8D3C";
  if (risk > 0) return "#FEB24C";
  return "#FFEDA0";
}

// ======================
// INTERAÇÃO: CLIQUE NO MUNICÍPIO
// ======================

function onEachFeatureScenario(feature, layer) {
  const props = feature.properties || {};
  const name = props.NM_MUN || "Unknown";

  let cod7 = null;
  if (props.CD_MUN_STR) {
    cod7 = String(props.CD_MUN_STR);
  } else if (props.CD_MUN) {
    cod7 = String(props.CD_MUN);
  } else if (props.cod_mun) {
    cod7 = String(props.cod_mun);
  }

  if (cod7) {
    cod7 = cod7.replace(/\D/g, "").padStart(7, "0");
  }

  const risk = cod7 ? riskLookup[cod7] : null;

  const nameElem = document.getElementById("municipality-name");
  const riskElem = document.getElementById("risk-value");

  if (nameElem) nameElem.textContent = name;
  if (riskElem) {
    riskElem.textContent = risk == null ? "No data" : risk.toFixed(3);
  }

  // Popup opcional no mapa
  if (risk == null) {
    layer.bindPopup(`${name}<br><em>No data</em>`).openPopup();
  } else {
    layer
      .bindPopup(`${name}<br>Predicted risk: ${risk.toFixed(3)}`)
      .openPopup();
  }
}

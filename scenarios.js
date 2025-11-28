// ======================
// CONFIGURAÇÃO BÁSICA
// ======================

const GEOJSON_URL = "data/br_municipios_2022_simplified.geojson";
const SCENARIOS_BASE_PATH = "data/scenarios";

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
let baseGeoJSONData = null;
let scenarioLayer = null;
let riskLookup = {};
let currentSelectedLayer = null;

// MEMÓRIA DA SELEÇÃO ATUAL
let currentSelection = {
  cod6: null,
  name: null,
  cod7: null
};

// ======================
// INICIALIZAÇÃO
// ======================

document.addEventListener("DOMContentLoaded", () => {
  initScenarioMap();
  populateScenarioSelect();
});

function populateScenarioSelect() {
  const select = document.getElementById("scenarioSelect");
  if (!select) return;

  // Limpa opções existentes
  select.innerHTML = '';

  // Adiciona todas as opções de cenário
  Object.keys(SCENARIO_DESCRIPTIONS).forEach(key => {
    const option = document.createElement("option");
    option.value = key;
    
    // Formata o nome para exibição (remove underscores e capitaliza)
    const displayName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    option.textContent = displayName;
    
    select.appendChild(option);
  });

  // Adiciona event listener
  select.addEventListener("change", updateScenarioFromSelect);
}

// ======================
// FUNÇÃO UTILITÁRIA: PADRONIZAR CÓDIGO
// ======================
function getCod6(rawValue) {
    if (!rawValue) return null;
    let str = String(rawValue).trim();
    
    // 1. Remove tudo que não é número
    str = str.replace(/\D/g, "");
    
    // 2. Se for código estranho com zero na frente (ex: "0110001"), remove o zero via Int
    let num = parseInt(str, 10);
    str = String(num);

    // 3. Garante minimo de 6 digitos com zeros a esquerda se necessario
    str = str.padStart(6, "0");

    // 4. Pega APENAS os 6 PRIMEIROS dígitos (padrão IBGE curto)
    return str.slice(0, 6);
}

// ======================
// 1. CARREGAR GEOJSON
// ======================

async function initScenarioMap() {
  try {
    const res = await fetch(GEOJSON_URL);
    if (!res.ok) {
      console.error("Erro GeoJSON:", res.status);
      return;
    }
    baseGeoJSONData = await res.json();

    // CORREÇÃO: Usa o ID correto do mapa - "map" em vez de "scenario-map"
    mapScenario = L.map("map", {
      zoomControl: true,
      attributionControl: false
    });

    const tmpLayer = L.geoJSON(baseGeoJSONData);
    mapScenario.fitBounds(tmpLayer.getBounds());

    updateScenarioFromSelect();
  } catch (err) {
    console.error("Erro init:", err);
    console.log("Scenario changed to:", scenId);
    console.log("Current selection:", currentSelection);
    console.log("Risk for selection:", riskLookup[currentSelection.cod6]);
  }
}

// ======================
// 2. CARREGAR CSV
// ======================

async function loadScenarioCSV(scenId) {
  const csvPath = `${SCENARIOS_BASE_PATH}/${scenId}.csv`;

  try {
    const res = await fetch(csvPath);
    if (!res.ok) throw new Error("404 CSV");
    const text = await res.text();
    
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) {
        riskLookup = {}; 
        return;
    }

    const header = lines[0].split(",");
    
    // Achar colunas
    let idxCod = header.indexOf("cod_mun");
    if (idxCod === -1) idxCod = header.indexOf("CD_MUN");
    
    let idxRisk = header.indexOf("risk_prob");
    if (idxRisk === -1) idxRisk = header.indexOf("risk");
    if (idxRisk === -1 && header.length > 1) idxRisk = 1;

    if (idxCod === -1 || idxRisk === -1) {
      riskLookup = {};
      return;
    }

    const tmpLookup = {};
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");
      if (row.length <= Math.max(idxCod, idxRisk)) continue;

      let codRaw = row[idxCod];
      let risk = parseFloat(row[idxRisk]);
      
      if (!codRaw || isNaN(risk)) continue;

      let cod6 = getCod6(codRaw);
      
      if (cod6) {
          tmpLookup[cod6] = risk;
      }
    }
    riskLookup = tmpLookup;

  } catch (err) {
    console.error("Erro CSV:", err);
    riskLookup = {};
  }
}

// ======================
// 3. ATUALIZAR CENÁRIO (Lógica Principal) - CORRIGIDO
// ======================

async function updateScenarioFromSelect() {
  if (!baseGeoJSONData || !mapScenario) return;

  const select = document.getElementById("scenarioSelect");
  const scenId = select ? select.value : "A_climate_only";

  // Atualiza descrição
  const descElem = document.getElementById("scenarioDescription");
  if (descElem) descElem.textContent = SCENARIO_DESCRIPTIONS[scenId] || "";

  // Carrega dados do cenário
  await loadScenarioCSV(scenId);

  // Remove camada antiga
  if (scenarioLayer) {
    mapScenario.removeLayer(scenarioLayer);
    scenarioLayer = null;
    currentSelectedLayer = null;
  }

  // Cria nova camada
  scenarioLayer = L.geoJSON(baseGeoJSONData, {
    style: styleFeatureByRisk,
    onEachFeature: onEachFeatureScenario
  }).addTo(mapScenario);

  // ATUALIZAÇÃO CRÍTICA: Se há seleção anterior, atualiza a exibição
  if (currentSelection.cod6) {
    updateDisplayForSelectedMunicipality();
    
    // Encontra e seleciona o layer correspondente na NOVA camada
    setTimeout(() => {
        findAndSelectCurrentMunicipality();
    }, 200);
  }
}

// ======================
// NOVA FUNÇÃO: ENCONTRAR E SELECIONAR MUNICÍPIO ATUAL
// ======================

function findAndSelectCurrentMunicipality() {
  if (!scenarioLayer || !currentSelection.cod6) return;
  
  let foundLayer = null;
  
  scenarioLayer.eachLayer((layer) => {
    if (foundLayer) return;
    
    const props = layer.feature.properties;
    const rawProp = props.CD_MUN_STR || props.CD_MUN || props.cod_mun || "";
    const layerCod6 = getCod6(rawProp);
    
    if (layerCod6 === currentSelection.cod6) {
      foundLayer = layer;
      currentSelectedLayer = layer;
      
      // Atualiza o popup com os novos dados
      const newRisk = riskLookup[currentSelection.cod6];
      const riskText = newRisk == null ? "No data" : newRisk.toFixed(3);
      
      // Fecha qualquer popup existente
      mapScenario.closePopup();
      
      // Abre novo popup
      setTimeout(() => {
        layer.bindPopup(`${currentSelection.name}<br>Predicted risk: ${riskText}`).openPopup();
      }, 100);
    }
  });
}

// ======================
// 4. ATUALIZAR DISPLAY DA SELEÇÃO
// ======================

function updateDisplayForSelectedMunicipality() {
  // CORREÇÃO: Usa os IDs corretos do HTML
  const nameElem = document.getElementById("infoName");
  const codeElem = document.getElementById("infoCode");
  const riskElem = document.getElementById("infoRisk");
  
  if (!nameElem || !codeElem || !riskElem) {
    console.error("Elementos não encontrados - verifique os IDs no HTML");
    return;
  }
  
  // Busca o risco ATUAL no lookup do cenário atual
  const risk = riskLookup[currentSelection.cod6];
  const riskText = risk == null ? "No data" : risk.toFixed(3);
  
  nameElem.textContent = currentSelection.name || "-";
  codeElem.textContent = currentSelection.cod6 || "-";
  riskElem.textContent = riskText;
}

// ======================
// 5. ESTILO E CORES
// ======================

function styleFeatureByRisk(feature) {
  const props = feature.properties || {};
  const rawProp = props.CD_MUN_STR || props.CD_MUN || props.cod_mun || "";
  const cod6 = getCod6(rawProp);

  const risk = cod6 ? riskLookup[cod6] : null;
  const fillColor = risk == null ? "#f0f0f0" : riskColorScale(risk);

  return {
    fillColor: fillColor,
    weight: 0.3,
    opacity: 1,
    color: "#999999",
    fillOpacity: risk == null ? 0.7 : 0.9
  };
}

function riskColorScale(risk) {
  if (risk >= 0.25) return "#800026";
  if (risk >= 0.15) return "#BD0026";
  if (risk >= 0.10) return "#E31A1C";
  if (risk >= 0.05) return "#FC4E2A";
  if (risk >= 0.02) return "#FD8D3C";
  if (risk > 0) return "#FEB24C";
  return "#FFEDA0";
}

// ======================
// 6. EVENTO DE CLIQUE - CORRIGIDO
// ======================

function onEachFeatureScenario(feature, layer) {
  layer.on("click", (e) => {
    const props = feature.properties || {};
    const name = props.NM_MUN || "Unknown";
    const rawProp = props.CD_MUN_STR || props.CD_MUN || props.cod_mun || "";
    const cod6 = getCod6(rawProp);

    // ATUALIZA SELEÇÃO ATUAL
    currentSelection = {
      cod6: cod6,
      name: name,
      cod7: rawProp
    };

    // ATUALIZA REFERÊNCIA DIRETA AO LAYER
    currentSelectedLayer = layer;

    // ATUALIZA DISPLAY IMEDIATAMENTE
    updateDisplayForSelectedMunicipality();

    // ABRE POPUP
    const risk = riskLookup[cod6];
    const riskText = risk == null ? "No data" : risk.toFixed(3);
    
    // Fecha popup anterior se existir
    mapScenario.closePopup();
    
    // Abre novo popup
    layer.bindPopup(`${name}<br>Predicted risk: ${riskText}`).openPopup();
    
    // Para propagação do evento
    e.originalEvent.stopPropagation();
  });
}

// ======================
// 7. FUNÇÃO DE DEBUG (opcional)
// ======================

function debugSelection() {
  console.log("=== DEBUG SELECTION ===");
  console.log("Current Selection:", currentSelection);
  console.log("Current Risk Lookup has key?", riskLookup[currentSelection.cod6]);
  console.log("Scenario Layer exists?", !!scenarioLayer);
  console.log("Current Selected Layer:", currentSelectedLayer);
  
  
}

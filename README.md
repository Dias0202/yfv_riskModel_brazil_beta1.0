# Yellow Fever Risk Modelling – Brazil (Beta 1.0)

![Project Status](https://img.shields.io/badge/Status-Beta_1.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Data](https://img.shields.io/badge/Data-Open_Science-orange)

An interactive platform projecting the risk of **Sylvatic Yellow Fever (YF)** outbreaks across Brazilian municipalities for the period **2021–2040**. 

This project integrates machine learning, climate projections (SSP2-4.5), and socio-demographic dynamics to help researchers and public health officials visualize how climate change, vaccination coverage, and deforestation may drive future viral spillover.

### 🌐 [Access the Live Dashboard Here](https://dias0202.github.io/yfv_riskModel_brazil_beta1.0/index.html)

---

## 🎯 Key Features

* **Predictive Modelling:** Based on a **Random Forest** algorithm trained on 20 years of historical data (2001–2020), achieving a **ROC-AUC of 0.93**.
* **Future Scenarios (2021–2040):** Explore 7 different future realities based on the **SSP2-4.5** climate pathway, varying drivers such as:
    * 📈 **Vaccination:** Impacts of increasing or decreasing herd immunity.
    * 🌡️ **Climate Only:** Pure effect of warming (+1.5°C) and precipitation changes.
    * 🚜 **Land Use:** Effects of agro-expansion vs. forest conservation.
* **Interactive Maps:** Granular, municipality-level risk visualization using Leaflet.js.
* **Data Transparency:** Full documentation of variables (Climate, Demography, Land Use) and sources.

---

## 🧬 Methodology & Science

The core of this project is a **binary classification model** that predicts the probability of a YF event (human case or epizootic) occurring in a municipality.

### The Model
* **Algorithm:** Random Forest Classifier.
* **Optimization:** Thresholds were optimized using the **F2-Score** to prioritize **Recall (Sensitivity)**. In public health surveillance, missing an outbreak (False Negative) is costlier than a preventive alert (False Positive).
* **Performance:**
    * **ROC-AUC:** 0.93
    * **Recall:** ~72% (on test set)

### Simulation Framework
Since future biological data is unavailable, we applied **mathematical proxies** to baseline data to simulate the **IPCC SSP2-4.5** scenario:
1.  **Temperature:** `+1.5°C` baseline increase.
2.  **Precipitation:** `-5%` reduction (stress testing drought trends).
3.  **VPD:** `+5%` increase in atmospheric water demand.

---

## 📂 Data Sources

We utilized high-resolution public datasets aggregated to the municipality level:

| Category | Source | Description |
| :--- | :--- | :--- |
| **Epidemiology** | SINAN / Ministry of Health | Historical confirmed cases and epizootics. |
| **Climate** | TerraClimate | Temperature, Precipitation, VPD, Wind Speed. |
| **Land Use** | MapBiomas (via Abdalla & Augusto) | Normalized indices for Forest, Pasture, Urban areas. |
| **Demography** | IBGE | Population estimates and density. |
| **Vaccination** | PNI / DATASUS | Yellow Fever vaccination coverage. |

For a full variable dictionary, please visit the [Data & Documentation](https://dias0202.github.io/yfv_riskModel_brazil_beta1.0/about.html) page.

---

## 🚀 How to Run Locally

This is a static web project (HTML/CSS/JS). You don't need a backend server to run the visualization, but you will need Python if you wish to retrain the model.

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/Dias0202/yfv_riskModel_brazil_beta1.0.git](https://github.com/Dias0202/yfv_riskModel_brazil_beta1.0.git)
    ```

2.  **Open the dashboard:**
    * Navigate to the folder and simply open `index.html` in your web browser.
    * *Note:* For some browsers, strict CORS policies might block loading the CSV data locally. It is recommended to use a simple local server:
        ```bash
        # Python 3
        python -m http.server 8000
        # Then go to http://localhost:8000
        ```

---

## 📁 Repository Structure
  css/ # Stylesheets 
  data/ # Datasets
  scenarios/ # CSV files for specific future scenarios (A-G)
  datasetFinal.csv # Baseline historical data for visualization 
  *.geojson # Simplified geometry for Brazilian municipalities 
  img/ # Logos, charts, and plots
  js/ # Application logic (Leaflet maps, interaction) 
  *.html # Main site pages (index, scenarios, model, etc.) 
  README.md # Project documentation
---

## 🤝 Authors & Acknowledgments

**Lead Developer & Researcher:**
* **Gabriel Dias Moreira, PhD** - [Contact](mailto:gabriel.dias05082000@gmail.com)

**Affiliations:**
* Virus Laboratory - UFMG (Universidade Federal de Minas Gerais)
* FAPEMIG (Funding Agency)

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

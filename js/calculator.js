import { saveSettingsAndInventory } from './storage.js';
import { productTypes, addNewProductRow, updateProductRowLabelsOnTypeChange, syncSaltElectrolysisWithDisinfectant } from './products.js';
import { updateLSIUI, updateBiologicalStatusUI, updateGlobalHeaderStatus } from './charts.js';

// Ré-exportation pour compatibilité avec le reste de l'application
export { productTypes, addNewProductRow, updateProductRowLabelsOnTypeChange, syncSaltElectrolysisWithDisinfectant };

const DEFAULT_RANGES = {
    ph: { min: 7.2, max: 7.6 },
    tac: { min: 80, max: 120 },
    chlLibre: { min: 2.0, max: 4.0 },
    chlTotal: { min: 2.0, max: 4.5 },
    stab: { min: 20, max: 50 },
    th: { min: 150, max: 250 }
};

export function toggleSettingsInputVisibility() {
    ['Ph', 'ChlLibre', 'ChlTotal', 'Tac', 'Stab', 'Th'].forEach(param => {
        const el = document.getElementById(`target${param}Container`);
        const chk = document.getElementById(`enable${param}`);
        if (el && chk) el.style.display = chk.checked ? 'block' : 'none';
    });
}

export function buildDynamicMeasuresForm() {
    const grid = document.getElementById('measuresFormGrid');
    if (!grid) return;
    
    const fields = [
        { key: 'Temp', id: 'tempVal', label: '🌡️ Température (°C)', full: true, step: 0.5 },
        { key: 'Ph', id: 'phVal', label: '🧪 pH', step: 0.1 },
        { key: 'ChlLibre', id: 'chlLibreVal', label: '✨ Chlore libre (ppm)', step: 0.1 },
        { key: 'ChlTotal', id: 'chlTotalVal', label: '🧪 Chlore total (ppm)', step: 0.1 },
        { key: 'Tac', id: 'tacVal', label: '⚖️ Alcalinité (TAC)', step: 5 },
        { key: 'Stab', id: 'stabVal', label: '🛡️ Stabilisant (ppm)', step: 5 },
        { key: 'Th', id: 'thVal', label: '💎 Dureté (TH)', step: 10 }
    ];

    grid.innerHTML = fields
        .filter(f => localStorage.getItem(`spa_enable${f.key}`) !== 'false')
        .map(f => `<div class="form-group ${f.full ? 'full-width' : ''}"><label for="${f.id}">${f.label}</label><input type="number" inputmode="decimal" id="${f.id}" step="${f.step}"></div>`)
        .join('');

    grid.oninput = () => {
        const measurements = {
            temp: parseFloat(document.getElementById('tempVal')?.value),
            ph: parseFloat(document.getElementById('phVal')?.value),
            chlLibre: parseFloat(document.getElementById('chlLibreVal')?.value),
            chlTotal: parseFloat(document.getElementById('chlTotalVal')?.value),
            tac: parseFloat(document.getElementById('tacVal')?.value),
            stab: parseFloat(document.getElementById('stabVal')?.value),
            th: parseFloat(document.getElementById('thVal')?.value)
        };
        updateLSIUI(measurements);
        updateGlobalHeaderStatus(measurements);
    };
}

export function computeDose(productType, diff) {
    const savedProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');
    const product = savedProducts.find(p => p.type === productType);
    
    if (!product || product.m <= 0 || product.d <= 0 || product.v <= 0) return { value: 0, unit: 'g' };
    
    const spaVol = parseFloat(localStorage.getItem('spa_vol')) || 1.5;
    const rawDose = (product.m / (product.d * product.v)) * diff * spaVol;

    if (['unit', 'tablet'].includes(product.unit)) {
        return { value: Math.max(1, Math.round(rawDose / product.m)), unit: 'tablet' };
    }
    if (product.unit === 'kg' && rawDose >= 1000) {
        return { value: Math.round((rawDose / 1000) * 100) / 100, unit: 'kg' };
    }

    return { value: Math.round(rawDose), unit: 'g' };
}

export function convertDoseUnits(value, fromUnit, toUnit, productM = 1) {
    if (isNaN(value)) return 0;
    
    // Étape 1 : Normalisation en grammes (ou unités de base)
    let valueInGrams = value;
    if (fromUnit === 'kg') {
        valueInGrams = value * 1000;
    } else if (['tablet', 'unit'].includes(fromUnit)) {
        valueInGrams = value * productM;
    }

    // Étape 2 : Conversion vers l'unité demandée
    if (toUnit === 'kg') {
        return valueInGrams / 1000;
    } else if (['tablet', 'unit'].includes(toUnit)) {
        return productM > 0 ? Math.max(1, Math.round(valueInGrams / productM)) : valueInGrams;
    }
    
    // Par défaut en grammes
    return Math.round(valueInGrams);
}

export function calculateLSI(ph, tempC, tac, th, tds = 1000) {
    if ([ph, tempC, tac, th].some(v => v === null || v === undefined || isNaN(v))) return null;

    const tf = (tempC * 0.0123) + 0.5;
    const cf = Math.log10(Math.max(th, 1)) - 0.4;
    const af = Math.log10(Math.max(tac, 1));
    const tdsFactor = tds >= 1000 ? 12.2 : 12.1;

    return Math.round((ph + tf + cf + af - tdsFactor) * 100) / 100;
}

export function getOrEstimateLSI(measurements) {
    const ph = parseFloat(measurements?.ph);
    const tac = parseFloat(measurements?.tac);
    if (isNaN(ph) || isNaN(tac)) return null;

    const temp = !isNaN(parseFloat(measurements?.temp)) ? parseFloat(measurements.temp) : 37;
    const th = !isNaN(parseFloat(measurements?.th)) ? parseFloat(measurements.th) : 200;

    return calculateLSI(ph, temp, tac, th);
}

export function getConsecutiveLowCount(measurements) {
    const currentCl = parseFloat(measurements?.chlLibre ?? measurements?.chlorine ?? measurements?.bromine);
    const minTarget = parseFloat(localStorage.getItem('spa_chlLibreTargetMin')) || 2.0;
    const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
    
    let count = (!isNaN(currentCl) && currentCl < minTarget) ? 1 : 0;
    for (const log of history.slice(0, 3)) {
        const pastCl = parseFloat(log.chlLibre);
        if (!isNaN(pastCl)) {
            if (pastCl < minTarget) count++;
            else break;
        }
    }
    return { currentCl, count };
}
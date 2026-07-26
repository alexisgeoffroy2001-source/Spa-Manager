import { exportBackupToJSON, importBackupFromJSON, requestStoragePersistence, initTheme, handleThemeSelection, applyTheme, updateOnlineStatus, getLastMeasurement, loadSettingsAndInventory, saveSettingsAndInventory } from './storage.js';
import { toggleSettingsInputVisibility, buildDynamicMeasuresForm, computeDose } from './calculator.js';
import { productTypes, addNewProductRow, updateProductRowLabelsOnTypeChange, syncSaltElectrolysisWithDisinfectant, renderInventory } from './products.js';
import { renderMaintenanceTaskList, saveMaintenanceTasksFromDOM, markMaintenanceTaskAsCompleted, displayAddTaskModal, validateAndAddNewTask, handleMaintenancePresetSelection, requestNotificationPermission, evaluateAndTriggerMaintenanceAlerts } from './maintenance.js';
import { updateChartTimeFilter, renderHistoryTable, wipeHistoryData, renderMultiMetricsCharts, updateLSIUI, updateBiologicalStatusUI, updateGlobalHeaderStatus } from './charts.js';

// --- ÉTAT DE NAVIGATION & PAGINATION ---
let currentTreatmentPage = 1;
window.currentMeasuresPage = 1; // Exposé globalement pour la synchro avec charts.js
const itemsPerPage = 5;

// --- GESTION PWA ---
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    toggleInstallButton(true);
});

document.addEventListener('DOMContentLoaded', () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) {
        toggleInstallButton(false);
    }
    
    // --- INITIALISATION AU CHARGEMENT DU DOM ---
    initTheme();
    registerServiceWorker();
    requestStoragePersistence();
    updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    localStorage.removeItem('spa_last_measurements');

    if (!localStorage.getItem('spa_initialized')) {
        localStorage.setItem('spa_initialized', 'true');
    }
    
    loadSettingsAndInventory();
    initTheme();
    buildDynamicMeasuresForm();
    renderMaintenanceTaskList();
    renderTreatmentLogs();
    evaluateAndTriggerMaintenanceAlerts();

    if (localStorage.getItem('spa_results_visible') === 'block') {
        restoreLastResults();
    }

    refreshGlobalUI();

    // --- MISE EN PLACE DES ECOUTEURS D'ÉVÉNEMENTS ---
    initEventListeners();
});

function toggleInstallButton(show) {
    const installBtn = document.getElementById('btnInstallApp');
    const installedNotice = document.getElementById('pwaInstalledNotice');
    if (installBtn) installBtn.style.display = show ? 'block' : 'none';
    if (installedNotice) installedNotice.style.display = show ? 'none' : 'block';
}

async function installPWA() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    if (isIOS) {
        alert("Pour installer l'application sur iOS :\n\n1. Appuyez sur le bouton de partage [↑]\n2. Sélectionnez 'Sur l'écran d'accueil' 📲");
        return;
    }

    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            toggleInstallButton(false);
        }
        deferredPrompt = null;
    } else {
        alert("Installation directe non supportée. Utilisez le menu du navigateur (⋮) pour 'Ajouter à l'écran d'accueil'.");
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error('Échec SW:', err));
    }
}

function refreshGlobalUI() {
    const lastMeasurements = getLastMeasurement() || {};
    updateLSIUI(lastMeasurements);
    updateBiologicalStatusUI(lastMeasurements);
    updateGlobalHeaderStatus(lastMeasurements);
}

function restoreLastResults() {
    const resultsCard = document.getElementById('resultsCard');
    const stepsContainer = document.getElementById('treatmentSteps');
    const banner = document.getElementById('balancedWaterBanner');

    if (resultsCard) resultsCard.style.display = 'block';
    if (stepsContainer && localStorage.getItem('spa_last_steps')) {
        stepsContainer.innerHTML = localStorage.getItem('spa_last_steps');
    }
    if (banner && localStorage.getItem('spa_last_banner')) {
        banner.style.display = localStorage.getItem('spa_last_banner');
    }
}

function switchPage(pageId, title, element) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');
    if (element) element.classList.add('active');
    
    const headerTitle = document.querySelector('.app-title');
    if (headerTitle && title) headerTitle.innerText = title;

    switch (pageId) {
        case 'measures':
            buildDynamicMeasuresForm();
            break;
        case 'charts':
            renderMultiMetricsCharts();
            renderHistoryTable();
            break;
        case 'maintenance':
            renderMaintenanceTaskList();
            refreshGlobalUI();
            break;
        case 'treatment':
            renderTreatmentLogs();
            renderInventory();
            break;
    }
}

// --- CENTRALISATION DES ECOUTEURS D'EVENEMENTS ---
function initEventListeners() {
    // 1. Navigation (Barre de menu du bas)
    const navItems = document.querySelectorAll('nav .nav-item');
    const pageMapping = ['measures', 'treatment', 'charts', 'maintenance', 'targets'];
    const titleMapping = ['Saisie des Mesures', 'Actions & Produits', 'Suivi & Historique', 'Entretien du Spa', 'Réglages & Cibles'];

    navItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            switchPage(pageMapping[index], titleMapping[index], item);
        });
    });

    // 2. Mesures & Calcul
    const measuresCardBtn = document.querySelector('#page-measures button[type="button"]');
    if (measuresCardBtn) measuresCardBtn.addEventListener('click', calculateAndSave);

    // 3. Traitements & Validation
    const validateTreatmentBtn = document.getElementById('validateTreatmentBtn');
    if (validateTreatmentBtn) validateTreatmentBtn.addEventListener('click', validateAppliedTreatment);

    // Pagination Traitement
    const prevTreatment = document.querySelector('#treatmentPagination button:first-child');
    const nextTreatment = document.querySelector('#treatmentPagination button:last-child');
    if (prevTreatment) prevTreatment.addEventListener('click', () => changePage(-1, 'treatment'));
    if (nextTreatment) nextTreatment.addEventListener('click', () => changePage(1, 'treatment'));

    // 4. Graphiques & Filtres temporels
    document.querySelectorAll('#page-charts .chart-selectors input[type="checkbox"]').forEach(chk => {
        chk.addEventListener('change', renderMultiMetricsCharts);
    });

    const filter7 = document.getElementById('filter-7');
    const filter15 = document.getElementById('filter-15');
    const filter30 = document.getElementById('filter-30');
    const filter0 = document.getElementById('filter-0');

    if (filter7) filter7.addEventListener('click', () => updateChartTimeFilter(7, renderMultiMetricsCharts));
    if (filter15) filter15.addEventListener('click', () => updateChartTimeFilter(15, renderMultiMetricsCharts));
    if (filter30) filter30.addEventListener('click', () => updateChartTimeFilter(30, renderMultiMetricsCharts));
    if (filter0) filter0.addEventListener('click', () => updateChartTimeFilter(0, renderMultiMetricsCharts));

    // Pagination Mesures & Effacer historique
    const prevMeasures = document.getElementById('prevMeasuresPageBtn') || document.querySelector('#measuresPagination button:first-child');
    const nextMeasures = document.getElementById('nextMeasuresPageBtn') || document.querySelector('#measuresPagination button:last-child');
    
    if (prevMeasures) {
        prevMeasures.addEventListener('click', () => {
            window.currentMeasuresPage = Math.max(1, (window.currentMeasuresPage || 1) - 1);
            renderHistoryTable();
        });
    }
    if (nextMeasures) {
        nextMeasures.addEventListener('click', () => {
            window.currentMeasuresPage = (window.currentMeasuresPage || 1) + 1;
            renderHistoryTable();
        });
    }

    const wipeHistoryBtn = document.querySelector('#page-charts .btn-danger');
    if (wipeHistoryBtn) {
        wipeHistoryBtn.addEventListener('click', () => wipeHistoryData(renderHistoryTable));
    }

    // 5. Entretien & Maintenance (Correction Ajout de tâche)
    const addMaintenanceTaskBtn = document.getElementById('openAddTaskModalBtn') || document.querySelector('#page-maintenance .btn-success');
    if (addMaintenanceTaskBtn) {
        addMaintenanceTaskBtn.addEventListener('click', displayAddTaskModal);
    }

    const saveMaintenanceBtn = document.querySelector('#page-maintenance button:not(.btn-success)');
    if (saveMaintenanceBtn) saveMaintenanceBtn.addEventListener('click', saveMaintenanceTasksFromDOM);

    // 6. Gestion des Produits & Inventaire (Correction Ajout de produit)
    const addNewProductBtn = document.getElementById('addNewProductBtn');
    if (addNewProductBtn) {
        addNewProductBtn.addEventListener('click', () => {
            addNewProductRow();
            saveSettingsAndInventory();
        });
    }

    // 7. Réglages & Paramètres (Correction Changement de Thème)
    const volInput = document.getElementById('vol');
    if (volInput) volInput.addEventListener('input', saveSettingsAndInventory);

    const disinfectantSelect = document.getElementById('disinfectantType');
    if (disinfectantSelect) {
        disinfectantSelect.addEventListener('change', () => {
            syncSaltElectrolysisWithDisinfectant();
            saveSettingsAndInventory();
        });
    }

    ['enableTemp', 'enablePh', 'enableChlLibre', 'enableChlTotal', 'enableTac', 'enableStab', 'enableTh'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                toggleSettingsInputVisibility();
                saveSettingsAndInventory();
            });
        }
    });

    ['phTargetMin', 'phTargetMax', 'chlLibreTargetMin', 'chlLibreTargetMax', 'chlTotalTargetMin', 'chlTotalTargetMax', 'tacTargetMin', 'tacTargetMax', 'stabTargetMin', 'stabTargetMax', 'thTargetMin', 'thTargetMax'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', saveSettingsAndInventory);
    });

    // Gestion propre du sélecteur de thème
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.addEventListener('change', handleThemeSelection);
    }

    const notifBtn = document.querySelector('#page-targets .btn-secondary');
    if (notifBtn) notifBtn.addEventListener('click', requestNotificationPermission);

    const installBtn = document.getElementById('btnInstallApp');
    if (installBtn) installBtn.addEventListener('click', installPWA);

    // Sauvegarde & Restauration
    const exportBtn = document.querySelector('#page-targets .grid button:first-child');
    const importTriggerBtn = document.querySelector('#page-targets .grid button:last-child');
    const importFileInput = document.getElementById('importFile');
    const resetAllBtn = document.querySelector('#page-targets .btn-danger');

    if (exportBtn) exportBtn.addEventListener('click', exportBackupToJSON);
    if (importTriggerBtn && importFileInput) {
        importTriggerBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', importBackupFromJSON);
    }
    if (resetAllBtn) resetAllBtn.addEventListener('click', () => wipeHistoryData(renderHistoryTable));
}

// --- CALCULATEUR & TRAITEMENTS ---

function formatDoseLabel(doseObj) {
    if (doseObj.unit === 'kg') return `${doseObj.value} kg`;
    if (doseObj.unit === 'tablet') return `${doseObj.value} ${doseObj.value > 1 ? 'pastilles' : 'pastille'}`;
    return `${doseObj.value}g`;
}

function calculateAndSave() {
    const measurements = {
        date: new Date().toISOString().split('T')[0],
        temp: parseFloat(document.getElementById('tempVal')?.value),
        ph: parseFloat(document.getElementById('phVal')?.value),
        chlLibre: parseFloat(document.getElementById('chlLibreVal')?.value),
        chlTotal: parseFloat(document.getElementById('chlTotalVal')?.value),
        tac: parseFloat(document.getElementById('tacVal')?.value),
        stab: parseFloat(document.getElementById('stabVal')?.value),
        th: parseFloat(document.getElementById('thVal')?.value),
        note: document.getElementById('eventNote')?.value.trim() || ''
    };
    
    updateLSIUI(measurements);

    const hasValues = Object.entries(measurements).some(([key, val]) => key !== 'date' && !isNaN(val)) || measurements.note !== '';
    if (!hasValues) {
        alert("Veuillez saisir au moins une mesure ou une note.");
        return;
    }

    const stepsContainer = document.getElementById('treatmentSteps');
    if (!stepsContainer) return;
    stepsContainer.innerHTML = '';
    
    let actionsCount = 0;
    const savedProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');
    const disinfectantType = localStorage.getItem('spa_disinfectant') || 'chlore';

    const limits = {
        phMin: parseFloat(localStorage.getItem('spa_phTargetMin')) || 7.2,
        phMax: parseFloat(localStorage.getItem('spa_phTargetMax')) || 7.6,
        tacMin: parseFloat(localStorage.getItem('spa_tacTargetMin')) || 80,
        tacMax: parseFloat(localStorage.getItem('spa_tacTargetMax')) || 120,
        chlMin: parseFloat(localStorage.getItem('spa_chlLibreTargetMin')) || 2.0
    };

    function generateStepHTML(stepNum, title, prodKey, prodName, diffVal, advice, customDoseData = null) {
        const product = savedProducts.find(p => p.type === prodKey);
        
        if (!product || (!customDoseData && (!product.m || !product.d || !product.v))) {
            return `<div class="treatment-step" style="border-left: 4px var(--danger);"><div><strong>${stepNum}. ${title}</strong><br><span style="color: var(--danger);">⚠️ Produit "${prodName}" non configuré.</span></div></div>`;
        }

        const doseObj = customDoseData || computeDose(prodKey, diffVal);
        const currentStock = parseFloat(product.stock) || 0;
        let requiredInStockUnit = doseObj.value;

        if (doseObj.unit === 'g' && product.unit === 'kg') requiredInStockUnit /= 1000;

        if (currentStock <= 0) {
            actionsCount++;
            return `<div class="treatment-step" style="border-left: 4px solid var(--danger);" data-prod-type="${prodKey}" data-dose="0">
                <input type="checkbox" disabled>
                <div><strong>${stepNum}. ${title} - Stock épuisé !</strong><br><span style="color: var(--danger);">⚠️ Stock de ${prodName} vide (0). Requis : ${formatDoseLabel(doseObj)}.</span></div>
            </div>`;
        }

        actionsCount++;
        const isInsufficient = currentStock < requiredInStockUnit;
        const borderColor = isInsufficient ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)';
        
        let doseToApply = doseObj;
        if (isInsufficient) {
            doseToApply = { value: currentStock, unit: product.unit };
        }

        return `<div class="treatment-step" style="border-left: 4px solid ${borderColor};" data-prod-type="${prodKey}" data-dose="${doseToApply.value}" data-unit="${doseToApply.unit}">
            <input type="checkbox" checked>
            <div><strong>${stepNum}. ${title}</strong><br>Ajouter <strong>${formatDoseLabel(doseToApply)}</strong> de ${prodName} ${isInsufficient ? '<span style="color: var(--warning);">⚠️ Stock partiel</span>' : ''}. <em>(${advice})</em></div>
        </div>`;
    }

    let stepsHTML = '';

    // 1. TAC
    if (!isNaN(measurements.tac) && measurements.tac < limits.tacMin && localStorage.getItem('spa_enableTac') !== 'false') {
        stepsHTML += generateStepHTML(1, `TAC trop bas (${measurements.tac})`, 'tac_plus', 'TAC+', limits.tacMin - measurements.tac, "Attendre 2-4h avant le pH");
    }

    // 2. pH
    if (!isNaN(measurements.ph) && localStorage.getItem('spa_enablePh') !== 'false') {
        if (measurements.ph > limits.phMax) {
            stepsHTML += generateStepHTML(2, `pH trop haut (${measurements.ph})`, 'ph_minus', 'pH-', Math.round((measurements.ph - limits.phMax) * 10) / 10, "Attendre 30 min-1h");
        } else if (measurements.ph < limits.phMin) {
            stepsHTML += generateStepHTML(2, `pH trop bas (${measurements.ph})`, 'ph_plus', 'pH+', Math.round((limits.phMin - measurements.ph) * 10) / 10, "Attendre 30 min-1h");
        }
    }

    // 3. Désinfectant
    if (!isNaN(measurements.chlLibre) && measurements.chlLibre < limits.chlMin && localStorage.getItem('spa_enableChlLibre') !== 'false') {
        const diffChl = limits.chlMin - measurements.chlLibre;
        if (disinfectantType === 'sel') {
            const saltProduct = savedProducts.find(p => p.type === 'salt_electrolysis');
            const spaVol = parseFloat(localStorage.getItem('spa_vol')) || 1.5;
            
            const calcSalt = saltProduct && saltProduct.d > 0 
                ? Math.round((saltProduct.m / saltProduct.d) * diffChl * spaVol) 
                : Math.round(500 * diffChl);
            
            const baseHours = saltProduct ? parseFloat(saltProduct.v) || 2.0 : 2.0;
            const baseDelta = saltProduct ? parseFloat(saltProduct.d) || 1.0 : 1.0;
            
            let calcHours = 0;
            if (baseDelta > 0) {
                calcHours = Math.round((baseHours / baseDelta) * diffChl * spaVol * 10) / 10;
            }
            if (calcHours <= 0) calcHours = 0.5;

            const saltAdvice = `Ajouter ${calcSalt}g de sel, puis lancer l'électrolyse pendant ${calcHours}h`;
            stepsHTML += generateStepHTML(3, `Traitement Sel & Électrolyse`, 'salt_electrolysis', 'Électrolyseur / Sel', diffChl, saltAdvice, { value: calcSalt, unit: 'g' });
        } else {
            const prodConfig = {
                brome: { key: 'brome', name: 'Brome', wait: 'Dissolution complète' },
                oxygene: { key: 'oxygene', name: 'Oxygène Actif', wait: 'Baignade après 15 min' },
                chlore: { key: 'chlore_choc', name: 'Chlore Choc', wait: '15-30 min' }
            }[disinfectantType] || { key: 'chlore_choc', name: 'Chlore', wait: '15-30 min' };

            stepsHTML += generateStepHTML(3, `Désinfectant bas (${measurements.chlLibre} ppm)`, prodConfig.key, prodConfig.name, diffChl, prodConfig.wait);
        }
    }

    stepsContainer.innerHTML = stepsHTML;

    // Enregistrement historique
    const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
    history.unshift(measurements);
    localStorage.setItem('spa_history', JSON.stringify(history));

    const banner = document.getElementById('balancedWaterBanner');
    const validateBtn = document.getElementById('validateTreatmentBtn');

    if (actionsCount === 0) {
        if (banner) banner.style.display = 'block';
        if (validateBtn) validateBtn.style.display = 'none';
    } else {
        if (banner) banner.style.display = 'none';
        if (validateBtn) {
            validateBtn.style.display = 'block';
            validateBtn.innerText = "✅ Enregistrer les produits appliqués";
            validateBtn.style.background = "var(--success)";
            validateBtn.disabled = false;
        }
    }

    // Reset du formulaire de mesures
    document.getElementById('eventNote').value = '';
    ['tempVal', 'phVal', 'chlLibreVal', 'chlTotalVal', 'tacVal', 'stabVal', 'thVal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    localStorage.setItem('spa_last_steps', stepsContainer.innerHTML);
    if (banner) localStorage.setItem('spa_last_banner', banner.style.display);
    localStorage.setItem('spa_results_visible', 'block');

    const treatmentNavItem = document.querySelectorAll('nav .nav-item')[1];
    switchPage('treatment', 'Actions & Produits', treatmentNavItem);
}

// --- VALIDATION ET MISE À JOUR DU STOCK ---
function validateAppliedTreatment() {
    const steps = document.querySelectorAll('.treatment-step');
    if (steps.length === 0) return;

    const appliedList = [];
    const stockUpdates = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');

    steps.forEach(step => {
        const checkbox = step.querySelector('input[type="checkbox"]');
        if (!checkbox || !checkbox.checked) return;

        const targetType = step.dataset.prodType;
        const doseVal = parseFloat(step.dataset.dose);
        const doseUnit = step.dataset.unit;
        const textDiv = step.querySelector('div');

        if (targetType && !isNaN(doseVal)) {
            appliedList.push(textDiv.innerText.replace(/\n/g, ' - '));
            const prodConfig = stockUpdates.find(p => p.type === targetType);
            
            if (prodConfig) {
                if (prodConfig.unit === 'unit' || prodConfig.unit === 'tablet') {
                    prodConfig.stock = Math.max(0, Math.round((prodConfig.stock - doseVal) * 10) / 10);
                } else if (prodConfig.unit === 'kg') {
                    const doseInKg = doseUnit === 'g' ? doseVal / 1000 : doseVal;
                    prodConfig.stock = Math.max(0, Math.round((prodConfig.stock - doseInKg) * 10) / 10);
                } else {
                    const doseInGrams = doseUnit === 'kg' ? doseVal * 1000 : doseVal;
                    prodConfig.stock = Math.max(0, Math.round(prodConfig.stock - doseInGrams));
                }
            }
        }
    });

    // 1. Sauvegarde des stocks mis à jour dans le localStorage
    localStorage.setItem('spa_dynamic_products', JSON.stringify(stockUpdates));
    
    // 2. Rafraîchissement immédiat de l'inventaire affiché à l'écran
    loadSettingsAndInventory()
    renderInventory();  

    if (appliedList.length > 0) {
        const treatmentSummary = appliedList.join(" | ");
        const treatmentLogs = JSON.parse(localStorage.getItem('spa_treatment_logs') || '[]');
        
        treatmentLogs.unshift({
            date: new Date().toLocaleDateString('fr-FR') + ' ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            details: treatmentSummary
        });
        localStorage.setItem('spa_treatment_logs', JSON.stringify(treatmentLogs));
        renderTreatmentLogs();

        const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
        if (history.length > 0) {
            const noteText = "Traitement appliqué : " + treatmentSummary;
            history[0].note = history[0].note ? `${history[0].note} | ${noteText}` : noteText;
            localStorage.setItem('spa_history', JSON.stringify(history));
        }

        document.getElementById('treatmentSteps').innerHTML = '';
        const btn = document.getElementById('validateTreatmentBtn');
        if (btn) btn.style.display = 'none';

        localStorage.setItem('spa_last_steps', '');
        // Le pop-up (alert) a été supprimé ici pour une transition fluide.
    }
}

// --- PAGINATION (MUTUALISÉE) ---
function changePage(direction, type) {
    const isTreatment = type === 'treatment';
    const logs = JSON.parse(localStorage.getItem(isTreatment ? 'spa_treatment_logs' : 'spa_history') || '[]');
    const totalPages = Math.ceil(logs.length / itemsPerPage);

    if (isTreatment) {
        currentTreatmentPage = Math.max(1, Math.min(totalPages, currentTreatmentPage + direction));
        renderTreatmentLogs();
    } else {
        window.currentMeasuresPage = Math.max(1, Math.min(totalPages, (window.currentMeasuresPage || 1) + direction));
        renderHistoryTable();
    }
}

function renderTreatmentLogs() {
    const container = document.getElementById('treatmentLogsContainer');
    const paginationEl = document.getElementById('treatmentPagination');
    const indicatorEl = document.getElementById('treatmentPageIndicator');
    if (!container) return;
    
    const logs = JSON.parse(localStorage.getItem('spa_treatment_logs') || '[]');
    if (logs.length === 0) {
        container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Aucun traitement enregistré.</p>`;
        if (paginationEl) paginationEl.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(logs.length / itemsPerPage);
    if (currentTreatmentPage > totalPages) currentTreatmentPage = totalPages;

    const paginatedLogs = logs.slice((currentTreatmentPage - 1) * itemsPerPage, currentTreatmentPage * itemsPerPage);

    container.innerHTML = paginatedLogs.map(log => `
        <div class="treatment-log-item"><div><strong>${log.date}</strong><br>${log.details}</div></div>
    `).join('');

    if (paginationEl && indicatorEl) {
        paginationEl.style.display = logs.length > itemsPerPage ? 'flex' : 'none';
        indicatorEl.textContent = `Page ${currentTreatmentPage}/${totalPages}`;
    }
}
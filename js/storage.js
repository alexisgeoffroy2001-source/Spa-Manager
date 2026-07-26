import { toggleSettingsInputVisibility, addNewProductRow, syncSaltElectrolysisWithDisinfectant, renderInventory, evaluateProductStockAlert} from './calculator.js';

export const STORAGE_KEYS = {
    HISTORY: 'spa_history',
    PRODUCTS: 'spa_dynamic_products',
    SETTINGS: 'spa_settings',
    THEME: 'spa_theme'
};

export function getMeasurementHistory() {
    const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
}

export function getLastMeasurement() {
    const history = getMeasurementHistory();
    return history[0] || null;
}

export function saveMeasurement(newMeasure) {
    const history = getMeasurementHistory();
    history.unshift(newMeasure);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
}

export function exportBackupToJSON() {
    const backupObj = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('spa_')) {
            backupObj[key] = localStorage.getItem(key);
        }
    }

    const jsonString = JSON.stringify(backupObj, null, 2);
    const blobUrl = URL.createObjectURL(new Blob([jsonString], { type: 'application/json' }));

    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = blobUrl;
    downloadAnchor.download = `spa_manager_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(blobUrl);
}

export function importBackupFromJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsedData = JSON.parse(e.target.result);
            if (typeof parsedData !== 'object' || parsedData === null) throw new Error("Format JSON invalide.");

            let keysImported = 0;

            if (parsedData.measurements || parsedData.settings || parsedData.inventory) {
                if (parsedData.measurements) localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(parsedData.measurements));
                if (parsedData.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(parsedData.settings));
                if (parsedData.inventory) localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(parsedData.inventory));
                keysImported = 3;
            } else {
                Object.entries(parsedData).forEach(([key, value]) => {
                    if (key.startsWith('spa_')) {
                        localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value);
                        keysImported++;
                    }
                });
            }

            if (keysImported === 0) throw new Error("Aucune donnée valide trouvée.");

            alert("Importation réussie des données ! L'application va se recharger.");
            window.location.reload();
        } catch (error) {
            console.error("Erreur d'importation :", error);
            alert("Erreur : Le fichier sélectionné est corrompu ou ne respecte pas le format de Spa Manager.");
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

export async function requestStoragePersistence() {
    try {
        if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
            await navigator.storage.persist();
        }
    } catch (err) {
        console.error("Erreur de demande de persistance du stockage :", err);
    }
}

export function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'auto';
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = savedTheme;

    applyTheme(savedTheme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem(STORAGE_KEYS.THEME) === 'auto') applyTheme('auto');
    });
}

export function handleThemeSelection() {
    const select = document.getElementById('themeSelect');
    if (select) applyTheme(select.value);
}

export function applyTheme(theme) {
    const root = document.documentElement;
    const isDark = theme === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : (theme === 'dark');

    root.classList.toggle('dark-mode', isDark);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

export function updateOnlineStatus() {
    const badge = document.getElementById('offlineBadge');
    if (!badge) return;

    const isOnline = navigator.onLine;
    badge.innerText = isOnline ? "🌐 En ligne" : "⚡ Hors-ligne";
    badge.className = `offline-badge ${isOnline ? 'online' : ''}`;
}

export function saveSettingsAndInventory() {
    const vol = document.getElementById('vol');
    if (vol) localStorage.setItem('spa_vol', vol.value);
    
    const dis = document.getElementById('disinfectantType');
    if (dis) localStorage.setItem('spa_disinfectant', dis.value);

    // Sauvegarde des cases à cocher de l'onglet Réglages
    const checkboxKeys = ['Temp', 'Ph', 'ChlLibre', 'ChlTotal', 'Tac', 'Stab', 'Th'];
    checkboxKeys.forEach(param => {
        const checkbox = document.getElementById(`enable${param}`);
        if (checkbox) {
            localStorage.setItem(`spa_enable${param}`, checkbox.checked ? 'true' : 'false');
        }
    });

    // Sauvegarde des seuils min/max
    ['ph', 'tac', 'chlLibre', 'chlTotal', 'stab', 'th'].forEach(param => {
        const minEl = document.getElementById(`${param}TargetMin`);
        const maxEl = document.getElementById(`${param}TargetMax`);
        if (minEl) localStorage.setItem(`spa_${param}TargetMin`, minEl.value);
        if (maxEl) localStorage.setItem(`spa_${param}TargetMax`, maxEl.value);
    });

    // --- SAUVEGARDE ROBUSTE DES PRODUITS DYNAMIQUES ---
    const productBoxes = document.querySelectorAll('#dynamicProductsList .product-config-box');
    const existingProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');
    
    const productsArray = Array.from(productBoxes).map(box => {
        const typeSelect = box.querySelector('.prod-type');
        const type = typeSelect ? typeSelect.value : 'ph_minus';
        
        const currentStock = parseFloat(box.querySelector('.prod-stock')?.value) || 0;
        
        // Récupération sécurisée du stock initial (soit depuis le dataset, soit depuis l'historique)
        const previousProduct = existingProducts.find(p => p.type === type);
        let initialStock = previousProduct?.initialStock;
        if (initialStock === undefined || initialStock === null) {
            initialStock = currentStock > 0 ? currentStock : 1000;
        }
        
        return {
            type: type,
            m: parseFloat(box.querySelector('.prod-m')?.value) || 0,
            d: parseFloat(box.querySelector('.prod-d')?.value) || 1,
            v: parseFloat(box.querySelector('.prod-v')?.value) || 1,
            stock: currentStock,
            initialStock: initialStock,
            unit: box.querySelector('.prod-unit')?.value || 'g'
        };
    });

    localStorage.setItem('spa_dynamic_products', JSON.stringify(productsArray));
    console.log("[SAVE] Produits enregistrés :", productsArray);
}

export function loadSettingsAndInventory() {
    const vol = document.getElementById('vol');
    if (vol) vol.value = localStorage.getItem('spa_vol') || 1.5;
    
    const dis = document.getElementById('disinfectantType');
    if (dis) dis.value = localStorage.getItem('spa_disinfectant') || 'chlore';

    // Restauration des cases à cocher de l'onglet Réglages
    const checkboxKeys = ['Temp', 'Ph', 'ChlLibre', 'ChlTotal', 'Tac', 'Stab', 'Th'];
    checkboxKeys.forEach(param => {
        const checkbox = document.getElementById(`enable${param}`);
        if (checkbox) {
            const savedValue = localStorage.getItem(`spa_enable${param}`);
            if (savedValue === null) {
                checkbox.checked = true;
                localStorage.setItem(`spa_enable${param}`, 'true');
            } else {
                checkbox.checked = (savedValue === 'true');
            }
        }
    });

    // Restauration des seuils min/max
    ['ph', 'tac', 'chlLibre', 'chlTotal', 'stab', 'th'].forEach(param => {
        const minEl = document.getElementById(`${param}TargetMin`);
        const maxEl = document.getElementById(`${param}TargetMax`);
        if (minEl) minEl.value = localStorage.getItem(`spa_${param}TargetMin`) ?? '';
        if (maxEl) maxEl.value = localStorage.getItem(`spa_${param}TargetMax`) ?? '';
    });

    // --- RESTAURATION DES PRODUITS DYNAMIQUES ---
    const savedProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');
    const container = document.getElementById('dynamicProductsList');
    
    if (container) {
        container.innerHTML = ''; // On vide le conteneur pour éviter les doublons
        
        if (savedProducts.length === 0) {
            // S'il n'y a rien en mémoire, on charge un produit par défaut
            if (typeof window.spaApp.addNewProductRow === 'function') {
                window.spaApp.addNewProductRow({ type: 'ph_minus', m: 500, d: 1.0, v: 2.0, stock: 1000, unit: 'g' });
            }
        } else {
            // Sinon, on boucle sur les produits sauvegardés pour les recréer
            savedProducts.forEach(prodData => {
                if (typeof window.spaApp.addNewProductRow === 'function') {
                    window.spaApp.addNewProductRow(prodData);
                }
            });
        }
    }

    // Gestion automatique de l'option "Sel / Électrolyseur" selon le désinfectant choisi
    syncSaltElectrolysisWithDisinfectant();

    // Application de l'affichage visuel des champs selon les cases à cocher
    toggleSettingsInputVisibility()
    
    renderInventory();
}
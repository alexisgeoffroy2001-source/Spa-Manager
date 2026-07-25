export const STORAGE_KEYS = {
    HISTORY: 'spa_history',
    PRODUCTS: 'spa_dynamic_products',
    SETTINGS: 'spa_settings',
    THEME: 'spa_theme'
};

export function getHistory() {
    const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
}

export function getLastMeasurement() {
    const history = getHistory();
    return history[0] || null;
}

export function saveMeasurement(newMeasure) {
    const history = getHistory();
    history.unshift(newMeasure);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
}

export function exportData() {
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

export function importData(event) {
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

export function changeTheme() {
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
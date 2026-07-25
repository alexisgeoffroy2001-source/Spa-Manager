export function exportData() {
    const backupObj = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('spa_')) {
            backupObj[key] = localStorage.getItem(key);
        }
    }

    const jsonString = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", blobUrl);
    downloadAnchor.setAttribute("download", `spa_manager_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    
    // Nettoyage de l'élément et de l'URL d'objet
    downloadAnchor.remove();
    URL.revokeObjectURL(blobUrl);
}

export function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsedData = JSON.parse(e.target.result);

            if (typeof parsedData !== 'object' || parsedData === null) {
                throw new Error("Format JSON invalide.");
            }

            // Gestion rétrocompatible : Import par clés spa_* ou structure legacy
            let keysImported = 0;

            if (parsedData.measurements || parsedData.settings || parsedData.inventory) {
                // Structure structurée legacy
                if (parsedData.measurements) localStorage.setItem('spa_history', JSON.stringify(parsedData.measurements));
                if (parsedData.settings) localStorage.setItem('spa_settings', JSON.stringify(parsedData.settings));
                if (parsedData.inventory) localStorage.setItem('spa_dynamic_products', JSON.stringify(parsedData.inventory));
                keysImported = 3;
            } else {
                // Structure clé/valeur spa_* native
                Object.entries(parsedData).forEach(([key, value]) => {
                    if (key.startsWith('spa_')) {
                        const valToStore = typeof value === 'object' ? JSON.stringify(value) : value;
                        localStorage.setItem(key, valToStore);
                        keysImported++;
                    }
                });
            }

            if (keysImported === 0) {
                throw new Error("Aucune donnée Spa Manager valide trouvée dans le fichier.");
            }

            alert("Importation réussie des données ! L'application va se recharger.");
            window.location.reload();

        } catch (error) {
            console.error("Erreur d'importation :", error);
            alert("Erreur : Le fichier sélectionné est corrompu ou ne respecte pas le format de Spa Manager.");
        } finally {
            // Réinitialiser la valeur du champ pour autoriser le re-chargement du même fichier si nécessaire
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

export async function requestStoragePersistence() {
    if (navigator.storage?.persist) {
        try {
            const isPersisted = await navigator.storage.persisted();
            if (!isPersisted) {
                await navigator.storage.persist();
            }
        } catch (err) {
            console.error("Erreur de demande de persistance du stockage :", err);
        }
    }
}

export function initTheme() {
    const savedTheme = localStorage.getItem('spa_theme') || 'auto';
    
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = savedTheme;
    }

    applyTheme(savedTheme);

    // Écoute des changements de préférence du système (mode sombre / clair)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('spa_theme') === 'auto') {
            applyTheme('auto');
        }
    });
}

export function changeTheme() {
    const select = document.getElementById('themeSelect');
    if (!select) return;
    const theme = select.value;
    applyTheme(theme);
}

export function applyTheme(theme) {
    const root = document.documentElement;
    let isDark = false;

    if (theme === 'auto') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
        isDark = (theme === 'dark');
    }

    if (isDark) {
        root.classList.add('dark-mode');
    } else {
        root.classList.remove('dark-mode');
    }

    localStorage.setItem('spa_theme', theme);
}

export function updateOnlineStatus() {
    const badge = document.getElementById('offlineBadge');
    if (!badge) return;

    if (navigator.onLine) {
        badge.innerText = "🌐 En ligne";
        badge.className = "offline-badge online";
    } else {
        badge.innerText = "⚡ Hors-ligne";
        badge.className = "offline-badge";
    }
}
/**
 * Alerts Management System
 * Handles reading sensor data, generating alerts, and displaying them from Firebase
 */

// Alert type configuration with icons and display names
const alertTypeConfig = {
    critical: {
        icon: 'fa-exclamation-triangle',
        label: 'Critical'
    },
    warning: {
        icon: 'fa-exclamation-circle',
        label: 'Warning'
    },
    info: {
        icon: 'fa-check-circle',
        label: 'Info'
    }
};

// Sensor alert mapping - maps sensor types to alert titles and icons
const sensorAlertMap = {
    co2: {
        title: 'Critical CO2 Level',
        icon: 'fa-wind',
        criticalTitle: 'Critical CO2 Level',
        warningTitle: 'High CO2 Level'
    },
    temperature: {
        title: 'High Temperature',
        icon: 'fa-temperature-high',
        criticalTitle: 'Critical Temperature',
        warningTitle: 'High Temperature'
    },
    humidity: {
        title: 'High Humidity',
        icon: 'fa-droplet',
        criticalTitle: 'Critical Humidity',
        warningTitle: 'High Humidity'
    },
    dust: {
        title: 'Dust Increased',
        icon: 'fa-smog',
        criticalTitle: 'Critical Dust Level',
        warningTitle: 'High Dust Level'
    },
    gas: {
        title: 'Hazardous Gas Detected',
        icon: 'fa-skull-crossbones',
        criticalTitle: 'Critical Gas Level',
        warningTitle: 'High Gas Level'
    },
    smoke: {
        title: 'Smoke Detected',
        icon: 'fa-fire',
        criticalTitle: 'Critical Smoke Level',
        warningTitle: 'Smoke Detected'
    },
    pressure: {
        title: 'Low Pressure',
        icon: 'fa-gauge',
        criticalTitle: 'Critical Pressure',
        warningTitle: 'Low Pressure'
    }
};

// Current filter state
let currentFilter = 'all';
let alertsListener = null;

/**
 * Generate alerts from current sensor data
 * Checks all rooms and sensors to generate alerts based on thresholds
 */
async function generateAlertsFromSensorData() {
    try {
        // Wait for roomsData to be available
        if (!window.roomsData || !window.sensorConfig) {
            console.warn('[Alerts] roomsData or sensorConfig not available yet');
            return;
        }

        const rooms = window.roomsData;
        const alerts = [];

        // Loop through all rooms
        rooms.forEach(room => {
            if (!room.sensors) return;

            // Check each sensor in the room
            Object.keys(room.sensors).forEach(sensorKey => {
                const sensor = room.sensors[sensorKey];
                const config = window.sensorConfig[sensorKey];
                const alertMap = sensorAlertMap[sensorKey];

                // Skip if no config or alert map
                if (!config || !config.thresholds || !alertMap) return;

                // Only generate alerts for warning or critical status
                if (sensor.status === 'warning' || sensor.status === 'critical') {
                    const alertType = sensor.status === 'critical' ? 'critical' : 'warning';
                    const title = alertType === 'critical' ? alertMap.criticalTitle : alertMap.warningTitle;

                    // Create alert object
                    const alert = {
                        type: alertType,
                        title: title,
                        message: `${room.name} - ${sensor.value} ${sensor.unit}`,
                        roomName: room.name,
                        roomId: room.id,
                        sensorType: sensorKey,
                        sensorValue: sensor.value,
                        sensorUnit: sensor.unit,
                        timestamp: new Date(),
                        icon: alertMap.icon
                    };

                    alerts.push(alert);
                }
            });
        });

        // Save alerts to Firestore
        if (alerts.length > 0 && window.firebaseDb && window.firestoreCollection && window.firestoreAddDoc) {
            for (const alert of alerts) {
                await saveAlertToFirestore(alert);
            }
        }

        return alerts;
    } catch (error) {
        console.error('[Alerts] Error generating alerts:', error);
        return [];
    }
}

/**
 * Save alert to Firestore
 * @param {Object} alert - Alert object to save
 */
async function saveAlertToFirestore(alert) {
    try {
        if (!window.firebaseDb || !window.firestoreCollection || !window.firestoreAddDoc) {
            console.warn('[Alerts] Firebase Firestore not available');
            return;
        }

        // Check if similar alert already exists (same room, sensor, type) within last 5 minutes
        // This prevents duplicate alerts
        const existingAlerts = await getRecentAlerts(5 * 60 * 1000); // 5 minutes
        const isDuplicate = existingAlerts.some(existing => 
            existing.roomId === alert.roomId &&
            existing.sensorType === alert.sensorType &&
            existing.type === alert.type
        );

        if (!isDuplicate) {
            const alertsRef = window.firestoreCollection(window.firebaseDb, 'alerts');
            await window.firestoreAddDoc(alertsRef, {
                type: alert.type,
                title: alert.title,
                message: alert.message,
                roomName: alert.roomName,
                roomId: alert.roomId,
                sensorType: alert.sensorType,
                sensorValue: alert.sensorValue,
                sensorUnit: alert.sensorUnit,
                timestamp: window.firestoreServerTimestamp(),
                icon: alert.icon,
                read: false
            });
        }
    } catch (error) {
        // Handle permission errors gracefully
        if (error.code === 'permission-denied') {
            console.warn('[Alerts] Permission denied - Firestore security rules need to be configured for alerts collection');
        } else {
            console.error('[Alerts] Error saving alert to Firestore:', error);
        }
    }
}

/**
 * Get recent alerts from Firestore
 * @param {number} timeWindow - Time window in milliseconds (optional)
 * @returns {Array} Array of alerts
 */
async function getRecentAlerts(timeWindow = null) {
    try {
        if (!window.firebaseDb || !window.firestoreCollection || !window.firestoreGetDocs || !window.firestoreQuery || !window.firestoreOrderBy) {
            console.warn('[Alerts] Firebase Firestore not available');
            return [];
        }

        const alertsRef = window.firestoreCollection(window.firebaseDb, 'alerts');
        let q = window.firestoreQuery(alertsRef, window.firestoreOrderBy('timestamp', 'desc'));

        // Limit to last 100 alerts for performance
        const querySnapshot = await window.firestoreGetDocs(q);
        const alerts = [];

        querySnapshot.forEach(doc => {
            const data = doc.data();
            const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
            
            // Filter by time window if specified
            if (timeWindow) {
                const now = new Date();
                if (now - timestamp > timeWindow) {
                    return; // Skip alerts outside time window
                }
            }

            alerts.push({
                id: doc.id,
                ...data,
                timestamp: timestamp
            });
        });

        // Limit to 100 most recent
        return alerts.slice(0, 100);
    } catch (error) {
        // Handle permission errors gracefully
        if (error.code === 'permission-denied') {
            console.warn('[Alerts] Permission denied - Firestore security rules need to be configured for alerts collection');
        } else {
            console.error('[Alerts] Error getting alerts from Firestore:', error);
        }
        return [];
    }
}

/**
 * Load and display alerts from Firestore
 */
async function loadAlerts() {
    try {
        const alerts = await getRecentAlerts();
        displayAlerts(alerts);
    } catch (error) {
        console.error('[Alerts] Error loading alerts:', error);
        displayAlerts([]);
    }
}

/**
 * Setup real-time listener for alerts
 */
function setupAlertsListener() {
    try {
        if (!window.firebaseDb || !window.firestoreCollection) {
            console.warn('[Alerts] Firebase Firestore not available');
            return;
        }

        // Clean up existing listener if any
        if (alertsListener) {
            alertsListener();
        }

        // Note: Firestore real-time listeners require onSnapshot which isn't exported
        // For now, we'll poll every 30 seconds or use manual refresh
        // Real-time updates would require adding onSnapshot to firebase-config.js
        
    } catch (error) {
        console.error('[Alerts] Error setting up alerts listener:', error);
    }
}

/**
 * Format time ago string
 * @param {Date} date - Date to format
 * @returns {string} Formatted time string
 */
function formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
        return 'Just now';
    } else if (diffMin < 60) {
        return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    } else if (diffHour < 24) {
        return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    } else {
        return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    }
}

/**
 * Display alerts in the UI
 * @param {Array} alerts - Array of alert objects
 */
function displayAlerts(alerts) {
    const alertsList = document.querySelector('.alerts-list');
    if (!alertsList) {
        console.warn('[Alerts] Alerts list container not found');
        return;
    }

    // Filter alerts based on current filter
    let filteredAlerts = alerts;
    if (currentFilter !== 'all') {
        filteredAlerts = alerts.filter(alert => alert.type === currentFilter);
    }

    // Sort by timestamp (newest first)
    filteredAlerts.sort((a, b) => {
        const timeA = a.timestamp?.getTime ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
        const timeB = b.timestamp?.getTime ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
        return timeB - timeA;
    });

    // Clear existing alerts
    alertsList.innerHTML = '';

    // Display alerts or empty state
    if (filteredAlerts.length === 0) {
        alertsList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 3rem 1rem; color: #666;">
                <i class="fas fa-bell-slash" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>No alerts found</p>
            </div>
        `;
        return;
    }

    // Create alert items
    filteredAlerts.forEach(alert => {
        const alertItem = document.createElement('div');
        alertItem.className = `alert-item ${alert.type}`;
        
        const icon = alert.icon || sensorAlertMap[alert.sensorType]?.icon || 'fa-exclamation-circle';
        const timeAgo = formatTimeAgo(alert.timestamp);

        alertItem.innerHTML = `
            <div class="alert-icon">
                <i class="fas ${icon}"></i>
            </div>
            <div class="alert-content">
                <h4>${alert.title}</h4>
                <p>${alert.message}</p>
                <span class="alert-time"><i class="fas fa-clock"></i> ${timeAgo}</span>
            </div>
            <button class="alert-action">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        alertsList.appendChild(alertItem);
    });
}

/**
 * Initialize alert filters
 */
function initializeFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update filter
            currentFilter = btn.dataset.filter;
            
            // Reload and display alerts
            loadAlerts();
        });
    });
}

/**
 * Initialize alerts system
 */
async function initializeAlerts() {
    try {
        // Wait for Firebase and app data to be ready
        let attempts = 0;
        const maxAttempts = 50; // 50 * 200ms = 10 seconds
        
        await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                attempts++;
                // Check if Firebase and roomsData are available
                const firebaseReady = window.firebaseDb && window.firestoreCollection;
                const appDataReady = window.roomsData && window.sensorConfig;
                
                if ((firebaseReady && appDataReady) || attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 200);
        });

        // Initialize filters
        initializeFilters();

        // Load existing alerts from Firestore first
        await loadAlerts();

        // Setup periodic refresh (every 30 seconds)
        setInterval(() => {
            loadAlerts();
        }, 30000);

        // Generate alerts from current sensor data periodically (every 2 minutes)
        // This ensures alerts are created when sensor values exceed thresholds
        setInterval(async () => {
            if (window.roomsData && window.sensorConfig) {
                await generateAlertsFromSensorData();
                // Reload alerts after generating new ones
                await loadAlerts();
            }
        }, 120000); // 2 minutes

        // Generate initial alerts after a short delay to ensure sensor statuses are updated
        setTimeout(async () => {
            if (window.roomsData && window.sensorConfig) {
                await generateAlertsFromSensorData();
                await loadAlerts();
            }
        }, 3000); // Wait 3 seconds for app.js to initialize sensor statuses

    } catch (error) {
        console.error('[Alerts] Error initializing alerts:', error);
        // Still try to load alerts even if initialization fails
        try {
            await loadAlerts();
        } catch (loadError) {
            console.error('[Alerts] Error loading alerts after initialization failure:', loadError);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAlerts);
} else {
    initializeAlerts();
}


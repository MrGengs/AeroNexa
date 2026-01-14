/**
 * Devices Management Module
 * Handles device list, sensor data updates, and device assignments
 */

// Device data structure
let devicesData = [];
let deviceUpdateInterval = null;
let deviceRealtimeListener = null;

// Initialize devices from Firebase Realtime Database
async function initializeDevices() {
    devicesData = [];
    
    // Wait for Firebase to be ready
    if (!window.rtdb || !window.rtdbRef || !window.rtdbGet || !window.rtdbOnValue) {
        // Wait for Firebase to be ready
        initializeDeviceRealtimeAfterFirebaseReady();
        return;
    }
    
    try {
        // Load all devices from Firebase Realtime Database
        const devicesRef = window.rtdbRef(window.rtdb, 'devices');
        const snapshot = await window.rtdbGet(devicesRef);
        
        if (snapshot.exists()) {
            const devices = snapshot.val();
            
            // Convert Firebase data to device objects
            Object.keys(devices).forEach(deviceId => {
                const deviceData = devices[deviceId];
                
                // Map Firebase structure to device object
                const device = {
                    id: deviceId,
                    name: deviceId.toUpperCase(),
                    assignedToRoom: null,
                    assignedToRoomName: null,
                    sensors: mapSensorDataFromFirebase(deviceData.data_sensor),
                    isRealtime: true, // All devices from RTDB are realtime
                    status: deviceData.camera?.status || 'offline',
                    lastUpdate: deviceData.camera?.lastSeen || new Date().toISOString(),
                    camera: deviceData.camera || {}
                };
                
                devicesData.push(device);
            });
            
            console.log(`[DEVICES] Loaded ${devicesData.length} devices from Realtime Database`);
        } else {
            console.log('[DEVICES] No devices found in Realtime Database');
        }
        
        // Set up real-time listeners for all devices
        setupRealtimeDeviceListeners();
        
    } catch (error) {
        console.error('[DEVICES] Error loading devices from Realtime Database:', error);
        // Fallback to empty list
    }
    
    // Export to window for other modules
    window.devicesData = devicesData;
    
    // Render devices list
    renderDevicesList();
}

/**
 * Map sensor data from Firebase structure to device sensors format
 */
function mapSensorDataFromFirebase(dataSensor) {
    if (!dataSensor) {
        return generateDefaultSensorValues();
    }
    
    // Map Firebase data_sensor to device sensors format
    const sensors = {
        dust: { 
            value: dataSensor.pm25 || 25, 
            unit: 'μg/m³', 
            status: 'normal' 
        },
        co2: { 
            value: dataSensor.co2 || 600, 
            unit: 'ppm', 
            status: 'normal' 
        },
        temperature: { 
            value: dataSensor.temperature || 23.5, 
            unit: '°C', 
            status: 'normal' 
        },
        humidity: { 
            value: dataSensor.humidity || 55, 
            unit: '%', 
            status: 'normal' 
        },
        pressure: { 
            value: 1013.2, 
            unit: 'hPa', 
            status: 'normal' 
        }, // Not in Firebase, use default
        gas: { 
            value: dataSensor.mq2 || 150, 
            unit: 'ppm', 
            status: 'normal' 
        },
        smoke: { 
            value: dataSensor.mq2_raw || 30, 
            unit: 'ppm', 
            status: 'normal' 
        }
    };
    
    // Update sensor statuses based on thresholds
    if (window.sensorConfig) {
        Object.keys(sensors).forEach(sensorKey => {
            const sensor = sensors[sensorKey];
            const config = window.sensorConfig[sensorKey];
            
            if (config && config.thresholds) {
                if (sensorKey === 'pressure') {
                    if (sensor.value < config.thresholds.warning) {
                        sensor.status = 'critical';
                    } else if (sensor.value < config.thresholds.normal) {
                        sensor.status = 'warning';
                    } else {
                        sensor.status = 'normal';
                    }
                } else {
                    if (sensor.value >= config.thresholds.warning) {
                        sensor.status = 'critical';
                    } else if (sensor.value >= config.thresholds.normal) {
                        sensor.status = 'warning';
                    } else {
                        sensor.status = 'normal';
                    }
                }
            }
        });
    }
    
    return sensors;
}

/**
 * Set up real-time listeners for all devices
 */
function setupRealtimeDeviceListeners() {
    if (!window.rtdb || !window.rtdbRef || !window.rtdbOnValue) {
        console.warn('[DEVICES] Realtime Database not available');
        return;
    }
    
    // Set up listener for all devices
    const devicesRef = window.rtdbRef(window.rtdb, 'devices');
    
    deviceRealtimeListener = window.rtdbOnValue(devicesRef, (snapshot) => {
        if (snapshot.exists()) {
            const devices = snapshot.val();
            
            // Update existing devices or add new ones
            Object.keys(devices).forEach(deviceId => {
                const deviceData = devices[deviceId];
                let device = devicesData.find(d => d.id === deviceId);
                
                if (!device) {
                    // New device - add it
                    device = {
                        id: deviceId,
                        name: deviceId.toUpperCase(),
                        assignedToRoom: null,
                        assignedToRoomName: null,
                        sensors: mapSensorDataFromFirebase(deviceData.data_sensor),
                        isRealtime: true,
                        status: deviceData.camera?.status || 'offline',
                        lastUpdate: deviceData.camera?.lastSeen || new Date().toISOString(),
                        camera: deviceData.camera || {}
                    };
                    devicesData.push(device);
                    
                    // Render new device card
                    const devicesList = document.getElementById('devicesList');
                    if (devicesList) {
                        const deviceCard = createDeviceCard(device);
                        devicesList.appendChild(deviceCard);
                    }
                } else {
                    // Update existing device
                    device.sensors = mapSensorDataFromFirebase(deviceData.data_sensor);
                    device.status = deviceData.camera?.status || 'offline';
                    device.lastUpdate = deviceData.camera?.lastSeen || new Date().toISOString();
                    device.camera = deviceData.camera || {};
                    
                    // Update sensor statuses
                    updateDeviceSensorStatuses(device);
                    
                    // Update UI
                    updateDeviceCard(device);
                    
                    // If room sensor modal is open and this device is assigned to that room, update modal
                    if (window.updateRoomSensorModal && typeof window.updateRoomSensorModal === 'function') {
                        const modal = document.getElementById('roomSensorModal');
                        if (modal && window.getComputedStyle(modal).display !== 'none') {
                            // Check if this device is assigned to the currently displayed room
                            const roomId = window.selectedRoomIdForModal;
                            if (roomId) {
                                // Try to find room from window.rooms or from floor plan data
                                let room = null;
                                if (Array.isArray(window.rooms)) {
                                    room = window.rooms.find(r => r && r.id === roomId);
                                } else if (window.floorPlanData && window.floorPlanData.floors) {
                                    // Search through all floors
                                    for (const floor of window.floorPlanData.floors) {
                                        if (floor.rooms) {
                                            room = floor.rooms.find(r => r && r.id === roomId);
                                            if (room) break;
                                        }
                                    }
                                }
                                
                                if (room && room.deviceId === deviceId) {
                                    // Update modal with latest device data
                                    window.updateRoomSensorModal();
                                }
                            }
                        }
                    }
                }
            });
            
            // Remove devices that no longer exist in Firebase
            const firebaseDeviceIds = Object.keys(devices);
            devicesData = devicesData.filter(device => {
                if (!firebaseDeviceIds.includes(device.id)) {
                    // Remove device card from UI
                    const card = document.getElementById(`device-card-${device.id}`);
                    if (card) {
                        card.remove();
                    }
                    return false;
                }
                return true;
            });
            
            // Export updated data
            window.devicesData = devicesData;
        }
    }, (error) => {
        console.error('[DEVICES] Error reading devices data:', error);
    });
    
    console.log('[DEVICES] Real-time device listeners initialized');
}

/**
 * Generate default sensor values if generateRandomSensorValues is not available
 */
function generateDefaultSensorValues() {
    return {
        dust: { value: 25, unit: 'μg/m³', status: 'normal' },
        co2: { value: 600, unit: 'ppm', status: 'normal' },
        temperature: { value: 23.5, unit: '°C', status: 'normal' },
        humidity: { value: 55, unit: '%', status: 'normal' },
        pressure: { value: 1013.2, unit: 'hPa', status: 'normal' },
        gas: { value: 150, unit: 'ppm', status: 'normal' },
        smoke: { value: 30, unit: 'ppm', status: 'normal' }
    };
}

/**
 * Initialize real-time sensor data (legacy - kept for backward compatibility)
 * Now handled by setupRealtimeDeviceListeners()
 */
function initDeviceRealtimeData() {
    // This function is now handled by setupRealtimeDeviceListeners()
    // Kept for backward compatibility
    setupRealtimeDeviceListeners();
}

/**
 * Wait for Firebase to be ready before initializing devices
 */
function initializeDeviceRealtimeAfterFirebaseReady() {
    if (window.rtdb && window.rtdbRef && window.rtdbGet && window.rtdbOnValue) {
        initializeDevices();
        return;
    }
    
    let attempts = 0;
    const maxAttempts = 50; // 50 * 200ms = 10 seconds
    
    const checkInterval = setInterval(() => {
        attempts++;
        
        if (window.rtdb && window.rtdbRef && window.rtdbGet && window.rtdbOnValue) {
            clearInterval(checkInterval);
            initializeDevices();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn('[DEVICES] Firebase Realtime Database not available after 10 seconds');
            // Render empty list
            renderDevicesList();
        }
    }, 200);
}

/**
 * Update sensor statuses for a device based on thresholds
 */
function updateDeviceSensorStatuses(device) {
    if (!window.sensorConfig) return;
    
    Object.keys(device.sensors).forEach(sensorKey => {
        const sensor = device.sensors[sensorKey];
        const config = window.sensorConfig[sensorKey];
        
        if (!config || !config.thresholds) return;
        
        if (sensorKey === 'pressure') {
            // Pressure: lower is worse
            if (sensor.value < config.thresholds.warning) {
                sensor.status = 'critical';
            } else if (sensor.value < config.thresholds.normal) {
                sensor.status = 'warning';
            } else {
                sensor.status = 'normal';
            }
        } else {
            // Other sensors: higher is worse
            if (sensor.value >= config.thresholds.warning) {
                sensor.status = 'critical';
            } else if (sensor.value >= config.thresholds.normal) {
                sensor.status = 'warning';
            } else {
                sensor.status = 'normal';
            }
        }
    });
}

/**
 * Simulate sensor data updates for devices (legacy - no longer needed)
 * Devices now update from Firebase Realtime Database automatically
 */
function simulateDeviceDataUpdate() {
    // No longer needed - devices update from Firebase Realtime Database
    // Only simulate pressure for devices (not available in RTDB)
    devicesData.forEach(device => {
        if (device.isRealtime) {
            // Only simulate pressure (not in Firebase)
            simulateDevicePressure(device);
        }
    });
}

/**
 * Simulate pressure for devices (not available in RTDB)
 */
function simulateDevicePressure(device) {
    const sensor = device.sensors.pressure;
    const config = window.sensorConfig ? window.sensorConfig.pressure : null;
    
    if (!sensor || !config) return;
    
    let baseValue = sensor.value || 1013;
    const minValue = 1000;
    const maxValue = 1020;
    let variationRange = 0.5;
    
    if (Math.random() < 0.1) {
        variationRange = 1.2;
    }
    
    const random = Math.random();
    const variation = (random - 0.5) * 2 * variationRange;
    
    let newValue = baseValue + variation;
    newValue = Math.max(minValue, Math.min(maxValue, newValue));
    
    sensor.value = Math.round(newValue * 10) / 10;
    
    // Update status
    if (config.thresholds) {
        if (sensor.value < config.thresholds.warning) {
            sensor.status = 'critical';
        } else if (sensor.value < config.thresholds.normal) {
            sensor.status = 'warning';
        } else {
            sensor.status = 'normal';
        }
    }
    
    updateDeviceCard(device);
}

/**
 * Start device sensor updates (legacy - pressure only)
 */
function startDeviceUpdates() {
    if (deviceUpdateInterval) {
        clearInterval(deviceUpdateInterval);
    }
    
    // Only update pressure every 5 seconds (not in Firebase)
    deviceUpdateInterval = setInterval(() => {
        simulateDeviceDataUpdate();
    }, 5000);
}

/**
 * Render devices list
 */
function renderDevicesList() {
    const devicesList = document.getElementById('devicesList');
    if (!devicesList) return;
    
    devicesList.innerHTML = '';
    
    devicesData.forEach(device => {
        const deviceCard = createDeviceCard(device);
        devicesList.appendChild(deviceCard);
    });
}

/**
 * Create device card HTML
 */
function createDeviceCard(device) {
    const card = document.createElement('div');
    card.className = 'device-card';
    card.id = `device-card-${device.id}`;
    card.dataset.deviceId = device.id;
    
    // Determine overall device status based on sensors
    const overallStatus = determineDeviceStatus(device.sensors);
    const statusText = overallStatus === 'good' ? 'Good' : overallStatus === 'warning' ? 'Warning' : 'Danger';
    const statusClass = overallStatus;
    
    // Check if device is assigned
    const assignedInfo = device.assignedToRoomName 
        ? `<div class="device-assigned">
            <i class="fas fa-link"></i>
            <span>Assigned to: ${device.assignedToRoomName}</span>
           </div>`
        : `<div class="device-unassigned">
            <i class="fas fa-unlink"></i>
            <span>Not assigned</span>
           </div>`;
    
    // Real-time indicator
    const realtimeIndicator = device.isRealtime 
        ? `<span class="device-realtime-badge">
            <i class="fas fa-satellite-dish"></i>
            Real-time
           </span>`
        : '';
    
    card.innerHTML = `
        <div class="device-card-header">
            <div class="device-info">
                <h3>${device.name}</h3>
                ${realtimeIndicator}
            </div>
            <span class="device-status-badge ${statusClass}">${statusText}</span>
        </div>
        ${assignedInfo}
        <div class="device-sensors">
            <div class="device-sensor-item">
                <i class="fas ${window.sensorConfig?.co2?.icon || 'fa-wind'}"></i>
                <div class="device-sensor-info">
                    <span class="device-sensor-label">CO2</span>
                    <span class="device-sensor-value">${device.sensors.co2.value} ${device.sensors.co2.unit}</span>
                </div>
                <span class="device-sensor-status ${device.sensors.co2.status}">${device.sensors.co2.status}</span>
            </div>
            <div class="device-sensor-item">
                <i class="fas ${window.sensorConfig?.temperature?.icon || 'fa-temperature-half'}"></i>
                <div class="device-sensor-info">
                    <span class="device-sensor-label">Temperature</span>
                    <span class="device-sensor-value">${device.sensors.temperature.value}${device.sensors.temperature.unit}</span>
                </div>
                <span class="device-sensor-status ${device.sensors.temperature.status}">${device.sensors.temperature.status}</span>
            </div>
            <div class="device-sensor-item">
                <i class="fas ${window.sensorConfig?.dust?.icon || 'fa-smog'}"></i>
                <div class="device-sensor-info">
                    <span class="device-sensor-label">Dust</span>
                    <span class="device-sensor-value">${device.sensors.dust.value} ${device.sensors.dust.unit}</span>
                </div>
                <span class="device-sensor-status ${device.sensors.dust.status}">${device.sensors.dust.status}</span>
            </div>
            <div class="device-sensor-item">
                <i class="fas ${window.sensorConfig?.humidity?.icon || 'fa-droplet'}"></i>
                <div class="device-sensor-info">
                    <span class="device-sensor-label">Humidity</span>
                    <span class="device-sensor-value">${device.sensors.humidity.value}${device.sensors.humidity.unit}</span>
                </div>
                <span class="device-sensor-status ${device.sensors.humidity.status}">${device.sensors.humidity.status}</span>
            </div>
        </div>
        <div class="device-footer">
            <span class="device-status-indicator ${device.status}">
                <i class="fas fa-circle"></i>
                ${device.status === 'online' ? 'Online' : 'Offline'}
            </span>
        </div>
    `;
    
    return card;
}

/**
 * Update device card in DOM
 */
function updateDeviceCard(device) {
    const card = document.getElementById(`device-card-${device.id}`);
    if (!card) return;
    
    // Update sensor values
    Object.keys(device.sensors).forEach(sensorKey => {
        const sensor = device.sensors[sensorKey];
        const valueEl = card.querySelector(`.device-sensor-item .device-sensor-value`);
        const statusEl = card.querySelector(`.device-sensor-item .device-sensor-status`);
        
        // Find the correct sensor item by checking the label
        const sensorItems = card.querySelectorAll('.device-sensor-item');
        sensorItems.forEach(item => {
            const label = item.querySelector('.device-sensor-label')?.textContent?.toLowerCase();
            if ((sensorKey === 'co2' && label === 'co2') ||
                (sensorKey === 'temperature' && label === 'temperature') ||
                (sensorKey === 'dust' && label === 'dust') ||
                (sensorKey === 'humidity' && label === 'humidity')) {
                const valueEl = item.querySelector('.device-sensor-value');
                const statusEl = item.querySelector('.device-sensor-status');
                
                if (valueEl) {
                    if (sensorKey === 'temperature' || sensorKey === 'humidity') {
                        valueEl.textContent = `${sensor.value}${sensor.unit}`;
                    } else {
                        valueEl.textContent = `${sensor.value} ${sensor.unit}`;
                    }
                }
                
                if (statusEl) {
                    statusEl.className = `device-sensor-status ${sensor.status}`;
                    statusEl.textContent = sensor.status;
                }
            }
        });
    });
    
    // Update overall status
    const overallStatus = determineDeviceStatus(device.sensors);
    const statusBadge = card.querySelector('.device-status-badge');
    if (statusBadge) {
        statusBadge.className = `device-status-badge ${overallStatus}`;
        statusBadge.textContent = overallStatus === 'good' ? 'Good' : overallStatus === 'warning' ? 'Warning' : 'Danger';
    }
    
    // Update assignment info (assigned/unassigned)
    const assignedInfoContainer = card.querySelector('.device-assigned, .device-unassigned');
    if (assignedInfoContainer) {
        if (device.assignedToRoomName) {
            // Update to assigned state
            assignedInfoContainer.className = 'device-assigned';
            assignedInfoContainer.innerHTML = `
                <i class="fas fa-link"></i>
                <span>Assigned to: ${device.assignedToRoomName}</span>
            `;
        } else {
            // Update to unassigned state
            assignedInfoContainer.className = 'device-unassigned';
            assignedInfoContainer.innerHTML = `
                <i class="fas fa-unlink"></i>
                <span>Not assigned</span>
            `;
        }
    } else {
        // If container doesn't exist, we need to recreate the card
        // This shouldn't happen, but just in case
        const cardParent = card.parentNode;
        if (cardParent) {
            const newCard = createDeviceCard(device);
            cardParent.replaceChild(newCard, card);
        }
    }
}

/**
 * Determine device overall status based on sensors
 */
function determineDeviceStatus(sensors) {
    let criticalCount = 0;
    let warningCount = 0;
    
    Object.values(sensors).forEach(sensor => {
        if (sensor.status === 'critical') {
            criticalCount++;
        } else if (sensor.status === 'warning') {
            warningCount++;
        }
    });
    
    if (criticalCount >= 2 || warningCount >= 5) {
        return 'danger';
    } else if (criticalCount >= 1 || warningCount >= 2) {
        return 'warning';
    } else {
        return 'good';
    }
}

/**
 * Get device by ID
 */
function getDeviceById(deviceId) {
    return devicesData.find(d => d.id === deviceId);
}

/**
 * Check if device is assigned to any room
 */
function isDeviceAssigned(deviceId) {
    const device = getDeviceById(deviceId);
    return device && device.assignedToRoom !== null;
}

/**
 * Assign device to room
 */
function assignDeviceToRoom(deviceId, roomId, roomName) {
    const device = getDeviceById(deviceId);
    if (!device) {
        return { success: false, message: 'Device not found' };
    }
    
    // Check if device is already assigned to another room
    if (device.assignedToRoom && device.assignedToRoom !== roomId) {
        return { success: false, message: `Device is already assigned to ${device.assignedToRoomName}` };
    }
    
    // Assign device
    device.assignedToRoom = roomId;
    device.assignedToRoomName = roomName;
    
    // Export updated data
    window.devicesData = devicesData;
    
    // Update UI if on devices page
    const devicesList = document.getElementById('devicesList');
    if (devicesList) {
        // If devices page is open, update the card
        updateDeviceCard(device);
    }
    
    return { success: true, message: 'Device assigned successfully' };
}

/**
 * Unassign device from room
 */
function unassignDeviceFromRoom(deviceId) {
    const device = getDeviceById(deviceId);
    if (!device) {
        return { success: false, message: 'Device not found' };
    }
    
    device.assignedToRoom = null;
    device.assignedToRoomName = null;
    
    // Export updated data
    window.devicesData = devicesData;
    
    // Update UI if on devices page
    const devicesList = document.getElementById('devicesList');
    if (devicesList) {
        // If devices page is open, update the card
        updateDeviceCard(device);
    }
    
    return { success: true, message: 'Device unassigned successfully' };
}

/**
 * Get available devices (not assigned to any room)
 */
function getAvailableDevices() {
    return devicesData.filter(d => d.assignedToRoom === null);
}

/**
 * Get device assigned to room
 */
function getDeviceByRoomId(roomId) {
    return devicesData.find(d => d.assignedToRoom === roomId);
}

/**
 * Load floor plans from Firebase and restore device assignments
 */
async function loadFloorPlansAndRestoreAssignments() {
    try {
        const userId = window.getCurrentUserUID();
        if (!userId) {
            console.warn('[DEVICES] User not authenticated, cannot load floor plans');
            return;
        }

        const db = window.firebaseDb;
        if (!db) {
            console.warn('[DEVICES] Firebase not available');
            return;
        }

        // Get user document reference, then access the subcollection
        const userDocRef = window.firestoreDoc(db, 'users', userId);
        const collectionRef = window.firestoreCollection(userDocRef, 'floorplans');
        
        // Get all floor plans from user's subcollection
        const querySnapshot = await window.firestoreGetDocs(collectionRef);
        
        // Process all floors and their rooms
        querySnapshot.forEach((doc) => {
            const floorData = doc.data();
            const rooms = floorData.rooms || [];
            
            // Restore device assignments from each room
            rooms.forEach(room => {
                if (room.deviceId) {
                    const device = getDeviceById(room.deviceId);
                    if (device) {
                        // Assign device to room
                        assignDeviceToRoom(room.deviceId, room.id, room.name);
                    }
                }
            });
        });
        
        // Re-render devices list to show updated assignment info
        renderDevicesList();
        
        console.log('[DEVICES] Device assignments restored from floor plans');
    } catch (error) {
        console.error('[DEVICES] Error loading floor plans:', error);
    }
}

// Export functions to window
window.devicesData = devicesData;
window.initializeDevices = initializeDevices;
window.getDeviceById = getDeviceById;
window.isDeviceAssigned = isDeviceAssigned;
window.assignDeviceToRoom = assignDeviceToRoom;
window.unassignDeviceFromRoom = unassignDeviceFromRoom;
window.getAvailableDevices = getAvailableDevices;
window.getDeviceByRoomId = getDeviceByRoomId;
window.loadFloorPlansAndRestoreAssignments = loadFloorPlansAndRestoreAssignments;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth check if needed
    if (window.waitForAuthCheck) {
        window.waitForAuthCheck().then(() => {
            initializeDevices();
            // After devices are initialized, load floor plans and restore assignments
            setTimeout(() => {
                loadFloorPlansAndRestoreAssignments();
            }, 1000); // Wait a bit longer to ensure Firebase is ready
        });
    } else {
        initializeDevices();
        // After devices are initialized, load floor plans and restore assignments
        setTimeout(() => {
            loadFloorPlansAndRestoreAssignments();
        }, 1000); // Wait a bit longer to ensure Firebase is ready
    }
});


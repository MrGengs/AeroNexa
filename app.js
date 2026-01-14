// ===== Sensor Configurations =====
// Must be defined first before generateRandomSensorValues and roomsData
const sensorConfig = {
    dust: {
        name: 'Dust particles',
        icon: 'fa-smog',
        sensor: 'PMS5003',
        thresholds: { normal: 35, warning: 55 }
    },
    co2: {
        name: 'Carbon Dioxide',
        icon: 'fa-wind',
        sensor: 'MH-Z19',
        thresholds: { normal: 1000, warning: 1400 }
    },
    temperature: {
        name: 'Room Temperature',
        icon: 'fa-temperature-half',
        sensor: 'BME280',
        thresholds: { normal: 26, warning: 29 }
    },
    humidity: {
        name: 'Humidity',
        icon: 'fa-droplet',
        sensor: 'BME280',
        thresholds: { normal: 60, warning: 70 }
    },
    pressure: {
        name: 'Air Pressure',
        icon: 'fa-gauge',
        sensor: 'BME280',
        thresholds: { normal: 1009, warning: 1006 }
    },
    gas: {
        name: 'Hazardous Gas',
        icon: 'fa-skull-crossbones',
        sensor: 'MQ-2',
        thresholds: { normal: 200, warning: 300 }
    },
    smoke: {
        name: 'Smoke',
        icon: 'fa-cloud',
        sensor: 'MQ-2',
        thresholds: { normal: 50, warning: 80 }
    }
};

// ===== Generate Random Initial Values =====
/**
 * Generate random initial sensor values with varied status distribution
 * This ensures rooms start with different statuses (good, warning, danger)
 * Uses actual thresholds from sensorConfig for accuracy
 */
function generateRandomSensorValues(targetStatus = 'random') {
    // Determine target status distribution: 80% normal, 15% warning, 5% critical
    // This makes rooms more likely to be green (normal) than red (critical)
    let statusDist = targetStatus;
    if (targetStatus === 'random') {
        const rand = Math.random();
        if (rand < 0.80) statusDist = 'normal';      // 80% normal
        else if (rand < 0.95) statusDist = 'warning'; // 15% warning
        else statusDist = 'critical';                 // 5% critical
    }
    
    // Generate values based on target status using actual thresholds
    const sensors = {};
    Object.keys(sensorConfig).forEach(sensorKey => {
        const config = sensorConfig[sensorKey];
        if (!config || !config.thresholds) return;
        
        const thresholds = config.thresholds;
        let value, status;
        
        // Randomly mix statuses for more realistic variation within each sensor
        // But make it more likely to be normal (80% normal, 15% warning, 5% critical per sensor)
        const mixRand = Math.random();
        if (mixRand < 0.80) {
            // 80% chance: Use normal status
            status = 'normal';
        } else if (mixRand < 0.95) {
            // 15% chance: Use warning status
            status = 'warning';
        } else {
            // 5% chance: Use critical status (or target status if specified)
            status = (targetStatus !== 'random' && targetStatus === 'critical') ? 'critical' : 'warning';
        }
        
        // Generate value within the selected status range based on actual thresholds
        if (sensorKey === 'pressure') {
            // Pressure: lower is worse (inverse logic)
            if (status === 'normal') {
                // Normal: >= normal threshold (higher values)
                value = thresholds.normal + Math.random() * (1020 - thresholds.normal);
            } else if (status === 'warning') {
                // Warning: between warning and normal threshold
                value = thresholds.warning + Math.random() * (thresholds.normal - thresholds.warning);
            } else {
                // Critical: < warning threshold (lower values)
                value = 1000 + Math.random() * (thresholds.warning - 1000);
            }
        } else {
            // Other sensors: higher is worse (normal logic)
            if (status === 'normal') {
                // Normal: < normal threshold (lower values)
                value = (sensorKey === 'dust' ? 5 : 
                        sensorKey === 'co2' ? 400 :
                        sensorKey === 'temperature' ? 18 :
                        sensorKey === 'humidity' ? 30 :
                        sensorKey === 'gas' ? 50 : 10) + 
                       Math.random() * thresholds.normal;
            } else if (status === 'warning') {
                // Warning: between normal and warning threshold
                value = thresholds.normal + Math.random() * (thresholds.warning - thresholds.normal);
            } else {
                // Critical: >= warning threshold (higher values)
                const maxValue = sensorKey === 'dust' ? 100 :
                                sensorKey === 'co2' ? 2000 :
                                sensorKey === 'temperature' ? 35 :
                                sensorKey === 'humidity' ? 90 :
                                sensorKey === 'gas' ? 400 : 150;
                value = thresholds.warning + Math.random() * (maxValue - thresholds.warning);
            }
        }
        
        // Round appropriately
        if (sensorKey === 'temperature' || sensorKey === 'humidity' || sensorKey === 'pressure') {
            value = Math.round(value * 10) / 10;
        } else {
            value = Math.round(value);
        }
        
        // Set unit based on sensor type
        const units = {
            dust: 'μg/m³',
            co2: 'ppm',
            temperature: '°C',
            humidity: '%',
            pressure: 'hPa',
            gas: 'ppm',
            smoke: 'ppm'
        };
        
        sensors[sensorKey] = {
            value: value,
            unit: units[sensorKey],
            status: status // Will be recalculated by updateSensorStatuses, but set initial for consistency
        };
    });
    
    return sensors;
}

// ===== Dummy Data for Rooms =====
// Initialize with varied statuses - mostly normal (green) rooms
const roomsData = [
    {
        id: 1,
        name: 'Meeting Room A',
        sensors: generateRandomSensorValues('normal'), // Good room
        starred: true // Room dengan camera stream aktif
    },
    {
        id: 2,
        name: 'Meeting Room B',
        sensors: generateRandomSensorValues('normal'), // Good room (changed from warning)
        starred: false // Room tanpa camera stream
    },
    {
        id: 3,
        name: 'Team Work Room',
        sensors: generateRandomSensorValues('normal'), // Good room
        starred: false // Room tanpa camera stream
    },
    {
        id: 4,
        name: 'Server Room',
        sensors: generateRandomSensorValues('normal'), // Good room
        starred: false // Room tanpa camera stream
    },
    {
        id: 5,
        name: 'Director Room',
        sensors: generateRandomSensorValues('normal'), // Good room
        starred: false // Room tanpa camera stream
    },
    {
        id: 6,
        name: 'Pantry Room',
        sensors: generateRandomSensorValues('warning'), // Warning room (changed from critical)
        starred: false // Room tanpa camera stream
    },
    {
        id: 7,
        name: 'Archive Room',
        sensors: generateRandomSensorValues('normal'), // Good room (changed from warning)
        starred: false // Room tanpa camera stream
    },
    {
        id: 8,
        name: 'Lobby',
        sensors: generateRandomSensorValues('normal'), // Good room
        starred: false // Room tanpa camera stream
    }
];

// ===== Global Variables =====
let charts = {};

// Track status change time for each sensor to prevent rapid status changes
// Format: { roomId: { sensorKey: { status: 'normal', changeTime: timestamp } } }
let sensorStatusTimers = {};

// Export roomsData and sensorConfig to window for floor plan editor
window.roomsData = roomsData;
window.sensorConfig = sensorConfig;
window.determineRoomStatus = determineRoomStatus;
window.generateAIRecommendations = generateAIRecommendations;

// ===== Load Real-time Sensor Data from Firebase Realtime Database =====
// User can select which room uses realtime data (only one room at a time)
// Default: room 1 (Meeting Room A) uses realtime data
let realtimeSensorRoomId = 1; // Room ID that uses realtime data (stored in localStorage)
let realtimeSensorListener = null;
let lastRealtimeSensorValues = null; // Store last values to only log on changes
let lastLogTime = 0; // Throttle logging to once per 5 seconds

// Load saved realtime room ID from localStorage on page load
if (typeof Storage !== 'undefined') {
    const savedRoomId = localStorage.getItem('realtimeSensorRoomId');
    if (savedRoomId !== null) {
        realtimeSensorRoomId = parseInt(savedRoomId);
    }
}

/**
 * Load and set up real-time sensor data for room 1 (Meeting Room A)
 * Maps data from Realtime Database to roomsData[0]
 */
function initRealtimeSensorData() {
    try {
        if (!window.rtdb || !window.rtdbRef || !window.rtdbOnValue) {
            console.warn('Realtime Database not available');
            return;
        }

        // Reference to /sensor path in Realtime Database
        const sensorRef = window.rtdbRef(window.rtdb, 'sensor');
        
        // Set up listener for real-time updates
        realtimeSensorListener = window.rtdbOnValue(sensorRef, (snapshot) => {
            if (snapshot.exists()) {
                const sensorData = snapshot.val();
                
                // Find the room that uses realtime data (based on user selection)
                // Search for room with matching ID in roomsData
                const realtimeRoom = roomsData.find(r => r.id === realtimeSensorRoomId);
                if (realtimeRoom) {
                    // Update sensor values from Realtime Database
                    // Map pm25 to dust (PM2.5 is dust particles)
                    if (sensorData.pm25 !== undefined && sensorData.pm25 !== null) {
                        realtimeRoom.sensors.dust.value = Math.round(sensorData.pm25);
                    }
                    
                    // CO2 from Realtime Database (can be 0 if sensor not ready)
                    if (sensorData.co2 !== undefined && sensorData.co2 !== null) {
                        realtimeRoom.sensors.co2.value = Math.round(sensorData.co2);
                    }
                    
                    // Temperature from Realtime Database
                    if (sensorData.temperature !== undefined && sensorData.temperature !== null) {
                        realtimeRoom.sensors.temperature.value = Math.round(sensorData.temperature * 10) / 10;
                    }
                    
                    // Humidity from Realtime Database
                    if (sensorData.humidity !== undefined && sensorData.humidity !== null) {
                        realtimeRoom.sensors.humidity.value = Math.round(sensorData.humidity * 10) / 10;
                    }
                    
                    // Gas from mq2 (processed value)
                    if (sensorData.mq2 !== undefined && sensorData.mq2 !== null) {
                        realtimeRoom.sensors.gas.value = Math.round(sensorData.mq2);
                    }
                    
                    // Smoke from mq2_raw (raw value, more sensitive for smoke)
                    if (sensorData.mq2_raw !== undefined && sensorData.mq2_raw !== null) {
                        realtimeRoom.sensors.smoke.value = Math.round(sensorData.mq2_raw);
                    }
                    
                    // Pressure remains dummy (simulated, not available in Realtime Database)
                    // Will be simulated separately in simulatePressureForRealtimeRoom()
                    
                    // Update sensor statuses based on new values
                    updateSensorStatusForRoom(realtimeRoom);
                    
                    // Export updated data to window for floor plan editor
                    window.roomsData = roomsData;
                    
                    // Update UI if needed
                    updateUIForRealtimeData();
                    
                    // Log updated values only if values changed significantly or every 5 seconds
                    const currentTime = Date.now();
                    const currentValues = {
                        dust: realtimeRoom.sensors.dust.value,
                        co2: realtimeRoom.sensors.co2.value,
                        temperature: realtimeRoom.sensors.temperature.value,
                        humidity: realtimeRoom.sensors.humidity.value,
                        gas: realtimeRoom.sensors.gas.value,
                        smoke: realtimeRoom.sensors.smoke.value
                    };
                    
                    // Check if values changed significantly (more than 1% or 1 unit)
                    const hasChanged = !lastRealtimeSensorValues || 
                        Object.keys(currentValues).some(key => {
                            const oldVal = lastRealtimeSensorValues[key] || 0;
                            const newVal = currentValues[key] || 0;
                            const diff = Math.abs(newVal - oldVal);
                            // Significant change: more than 1 unit or 1% of value
                            return diff > 1 || (oldVal > 0 && diff / oldVal > 0.01);
                        });
                    
                    // Log only if values changed significantly or every 5 seconds
                    if (hasChanged || (currentTime - lastLogTime > 5000)) {
                        console.log(`[RTDB] Real-time sensor data updated for ${realtimeRoom.name} (Room ID: ${realtimeRoom.id}):`, {
                            dust: `${realtimeRoom.sensors.dust.value} ${realtimeRoom.sensors.dust.unit} (${realtimeRoom.sensors.dust.status})`,
                            co2: `${realtimeRoom.sensors.co2.value} ${realtimeRoom.sensors.co2.unit} (${realtimeRoom.sensors.co2.status})`,
                            temperature: `${realtimeRoom.sensors.temperature.value}${realtimeRoom.sensors.temperature.unit} (${realtimeRoom.sensors.temperature.status})`,
                            humidity: `${realtimeRoom.sensors.humidity.value}${realtimeRoom.sensors.humidity.unit} (${realtimeRoom.sensors.humidity.status})`,
                            gas: `${realtimeRoom.sensors.gas.value} ${realtimeRoom.sensors.gas.unit} (${realtimeRoom.sensors.gas.status})`,
                            smoke: `${realtimeRoom.sensors.smoke.value} ${realtimeRoom.sensors.smoke.unit} (${realtimeRoom.sensors.smoke.status})`,
                            pressure: `${realtimeRoom.sensors.pressure.value} ${realtimeRoom.sensors.pressure.unit} (static, not from RTDB)`
                        });
                        lastRealtimeSensorValues = { ...currentValues };
                        lastLogTime = currentTime;
                    }
                } else {
                    console.warn(`[RTDB] Room with ID ${realtimeSensorRoomId} not found in roomsData`);
                }
            } else {
                console.warn('[RTDB] No sensor data found in Realtime Database');
            }
        }, (error) => {
            console.error('[RTDB] Error reading sensor data:', error);
        });
        
        console.log(`[RTDB] Real-time sensor listener initialized for room ID: ${realtimeSensorRoomId}`);
    } catch (error) {
        console.error('[RTDB] Error initializing real-time sensor data:', error);
    }
}

/**
 * Update sensor status for a specific room based on thresholds
 */
function updateSensorStatusForRoom(room) {
    Object.keys(room.sensors).forEach(sensorKey => {
        const sensor = room.sensors[sensorKey];
        const config = sensorConfig[sensorKey];
        
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
 * Update UI elements that display sensor data
 */
function updateUIForRealtimeData() {
    // Update room sensor modal if it's open
    if (window.updateRoomSensorModal && typeof window.updateRoomSensorModal === 'function') {
        try {
            window.updateRoomSensorModal();
        } catch (e) {
            // Silent fail if modal not open
        }
    }
    
    // Update floor plan room statuses if dashboard is open
    if (window.updateAllRoomStatuses && typeof window.updateAllRoomStatuses === 'function') {
        try {
            window.updateAllRoomStatuses();
        } catch (e) {
            // Silent fail if floor plan not loaded
        }
    }
    
    // Update dashboard if it's the current page
    const currentPage = getCurrentPage();
    if (currentPage === 'dashboard.html' || currentPage === '') {
        if (typeof renderDashboard === 'function') {
            try {
                renderDashboard();
            } catch (e) {
                // Silent fail
            }
        }
    }
}

/**
 * Initialize real-time sensor data after Firebase is ready
 * Tries multiple times if Firebase not ready yet
 */
function initializeRealtimeSensorAfterFirebaseReady() {
    // Try immediately if Firebase is already ready
    if (window.rtdb && window.rtdbRef && window.rtdbOnValue) {
        initRealtimeSensorData();
        return;
    }
    
    // Wait for Firebase to be ready (check every 200ms, max 5 seconds)
    let attempts = 0;
    const maxAttempts = 25; // 25 * 200ms = 5 seconds
    
    const checkInterval = setInterval(() => {
        attempts++;
        
        if (window.rtdb && window.rtdbRef && window.rtdbOnValue) {
            clearInterval(checkInterval);
            initRealtimeSensorData();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn('[RTDB] Firebase Realtime Database not available after 5 seconds, using dummy data for room 1');
        }
    }, 200);
}

/**
 * Clean up real-time listener when needed
 */
function cleanupRealtimeSensorListener() {
    if (realtimeSensorListener && window.rtdbOff && window.rtdbRef && window.rtdb) {
        try {
            const sensorRef = window.rtdbRef(window.rtdb, 'sensor');
            window.rtdbOff(sensorRef, 'value', realtimeSensorListener);
            realtimeSensorListener = null;
            console.log('[RTDB] Real-time sensor listener cleaned up');
        } catch (error) {
            console.error('[RTDB] Error cleaning up listener:', error);
        }
    }
}

// ===== Set Realtime Sensor Room =====
/**
 * Set which room should use realtime data from Realtime Database
 * Only one room can use realtime data at a time
 * @param {number} roomId - The room ID that should use realtime data
 */
function setRealtimeSensorRoom(roomId) {
    // Validate room exists
    const room = roomsData.find(r => r.id === roomId);
    if (!room) {
        console.warn(`[RTDB] Cannot set realtime sensor room: Room with ID ${roomId} not found`);
        return false;
    }
    
    const previousRoomId = realtimeSensorRoomId;
    realtimeSensorRoomId = roomId;
    
    // Save to localStorage
    if (typeof Storage !== 'undefined') {
        localStorage.setItem('realtimeSensorRoomId', roomId.toString());
    }
    
    console.log(`[RTDB] Realtime sensor room changed from ${previousRoomId} to ${roomId} (${room.name})`);
    
    // Restart realtime listener if it's already initialized
    if (realtimeSensorListener) {
        cleanupRealtimeSensorListener();
        // Wait a bit before reinitializing
        setTimeout(() => {
            initRealtimeSensorData();
        }, 100);
    }
    
    return true;
}

// ===== Get Realtime Sensor Room ID =====
/**
 * Get the current room ID that uses realtime data
 * @returns {number} The room ID
 */
function getRealtimeSensorRoomId() {
    return realtimeSensorRoomId;
}

// Export functions to window
window.initRealtimeSensorData = initRealtimeSensorData;
window.cleanupRealtimeSensorListener = cleanupRealtimeSensorListener;
window.setRealtimeSensorRoom = setRealtimeSensorRoom;
window.getRealtimeSensorRoomId = getRealtimeSensorRoomId;

// ===== AI Recommendation Engine =====
function generateAIRecommendations(sensors) {
    const recommendations = [];

    if (sensors.co2.status === 'critical') {
        recommendations.push({
            icon: 'fa-wind',
            text: 'CO2 level is very high! Immediately open windows and doors for air circulation. Consider turning on exhaust fan or blower.'
        });
    } else if (sensors.co2.status === 'warning') {
        recommendations.push({
            icon: 'fa-door-open',
            text: 'CO2 level is increasing. Open windows or activate ventilation system to increase fresh air flow.'
        });
    }

    if (sensors.dust.status === 'critical') {
        recommendations.push({
            icon: 'fa-broom',
            text: 'Dust has reached dangerous levels! Perform thorough cleaning and activate air purifier. Reduce activities that generate dust.'
        });
    } else if (sensors.dust.status === 'warning') {
        recommendations.push({
            icon: 'fa-filter',
            text: 'Dust particles are high. Turn on air purifier and check AC filter. Consider room cleaning.'
        });
    }

    if (sensors.temperature.value > 29) {
        recommendations.push({
            icon: 'fa-snowflake',
            text: 'Temperature is too high! Turn on AC or increase cooling settings for optimal comfort.'
        });
    } else if (sensors.temperature.value < 20) {
        recommendations.push({
            icon: 'fa-fire',
            text: 'Temperature is too low. Adjust AC settings or use room heater for comfort.'
        });
    }

    if (sensors.humidity.status === 'critical') {
        recommendations.push({
            icon: 'fa-water',
            text: 'Humidity is very high! Activate dehumidifier to prevent mold and bacteria growth.'
        });
    } else if (sensors.humidity.status === 'warning') {
        recommendations.push({
            icon: 'fa-wind',
            text: 'Humidity is increasing. Increase air circulation and consider using dehumidifier.'
        });
    } else if (sensors.humidity.value < 40) {
        recommendations.push({
            icon: 'fa-spray-can',
            text: 'Humidity is too low. Use humidifier to increase humidity to optimal level (40-60%).'
        });
    }

    if (sensors.gas.status === 'critical') {
        recommendations.push({
            icon: 'fa-exclamation-triangle',
            text: 'WARNING: Hazardous gas detected at high level! Evacuate the room and check for gas leak source immediately!'
        });
    } else if (sensors.gas.status === 'warning') {
        recommendations.push({
            icon: 'fa-search',
            text: 'Gas detection is increasing. Check area for possible leaks and increase ventilation.'
        });
    }

    if (sensors.smoke.status === 'critical') {
        recommendations.push({
            icon: 'fa-fire-extinguisher',
            text: 'DANGER: Smoke detected at high level! Check for possible fire and activate safety protocol!'
        });
    } else if (sensors.smoke.status === 'warning') {
        recommendations.push({
            icon: 'fa-eye',
            text: 'Smoke detected. Check room for smoke source and ensure there are no hazardous activities.'
        });
    }

    if (sensors.pressure.value < 1006) {
        recommendations.push({
            icon: 'fa-cloud',
            text: 'Air pressure is low. This may affect comfort. Ensure HVAC system is functioning optimally.'
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            icon: 'fa-check-circle',
            text: 'Air quality is in optimal condition! Maintain this condition with regular maintenance and good air circulation.'
        });
    }

    return recommendations;
}

// ===== Determine Room Status =====
function determineRoomStatus(sensors) {
    let criticalCount = 0;
    let warningCount = 0;
    let normalCount = 0;
    const totalSensors = Object.keys(sensors).length;

    // Count sensors by status
    Object.values(sensors).forEach(sensor => {
        if (sensor.status === 'critical') {
            criticalCount++;
        } else if (sensor.status === 'warning') {
            warningCount++;
        } else {
            normalCount++;
        }
    });

    // Determine status based on count:
    // - Red (danger): 2+ critical sensors OR 5+ warnings (more lenient to favor green)
    // - Yellow (warning): 1 critical OR 2-4 warnings
    // - Green (good): All normal OR 1 warning (more lenient to favor green)
    
    if (criticalCount >= 2) {
        // 2 or more critical sensors = danger (red)
        return 'danger';
    } else if (warningCount >= 5) {
        // 5 or more warnings = danger (red)
        return 'danger';
    } else if (criticalCount >= 1 || warningCount >= 2) {
        // 1 critical OR 2-4 warnings = warning (yellow)
        return 'warning';
    } else {
        // All normal OR 1 warning = good (green) - more lenient
        return 'good';
    }
}

// ===== Update Sensor Status Based on Thresholds =====
function updateSensorStatuses() {
    const currentTime = Date.now();
    const MIN_NORMAL_DURATION = 10000; // 10 seconds minimum for normal status
    const MIN_STATUS_DURATION = 3000; // 3 seconds minimum for any status change (except recovery from critical)
    
    roomsData.forEach(room => {
        // Skip the room that uses real-time data if Realtime Database listener is active
        // Realtime room status is managed by updateSensorStatusForRoom() when Realtime Database updates
        // Only skip if realtimeSensorListener is active (means Realtime Database is being used)
        if (room.id === realtimeSensorRoomId && realtimeSensorListener) {
            return; // Skip status update for realtime room, it's managed by Realtime Database listener
        }
        
        // Initialize timer tracking for this room if not exists
        if (!sensorStatusTimers[room.id]) {
            sensorStatusTimers[room.id] = {};
        }
        
        Object.keys(room.sensors).forEach(sensorKey => {
            const sensor = room.sensors[sensorKey];
            const config = sensorConfig[sensorKey];

            if (!config || !config.thresholds) return;
            
            // Get current timer for this sensor
            const timerKey = `${room.id}_${sensorKey}`;
            let statusTimer = sensorStatusTimers[room.id][sensorKey];
            
            // Initialize timer if not exists
            if (!statusTimer) {
                statusTimer = {
                    status: sensor.status || 'normal',
                    changeTime: currentTime
                };
                sensorStatusTimers[room.id][sensorKey] = statusTimer;
            }
            
            // Calculate time since last status change
            const timeSinceChange = currentTime - statusTimer.changeTime;
            const currentStatus = statusTimer.status;
            
            // Determine what the new status should be based on value
            let newStatus;
            if (sensorKey === 'pressure') {
                if (sensor.value < config.thresholds.warning) {
                    newStatus = 'critical';
                } else if (sensor.value < config.thresholds.normal) {
                    newStatus = 'warning';
                } else {
                    newStatus = 'normal';
                }
            } else {
                if (sensor.value >= config.thresholds.warning) {
                    newStatus = 'critical';
                } else if (sensor.value >= config.thresholds.normal) {
                    newStatus = 'warning';
                } else {
                    newStatus = 'normal';
                }
            }
            
            // Apply status change rules:
            // 1. If currently normal, must stay normal for at least 10 seconds
            // 2. If currently critical, can recover to warning/normal immediately (allow recovery)
            // 3. Other status changes need at least 3 seconds
            if (currentStatus === 'normal') {
                // Normal status: must stay normal for at least 10 seconds
                if (newStatus !== 'normal' && timeSinceChange < MIN_NORMAL_DURATION) {
                    // Keep normal status, don't change yet
                    sensor.status = 'normal';
                    return; // Don't update timer
                }
            } else if (currentStatus === 'critical') {
                // Critical status: can recover immediately (allow recovery to warning/normal)
                // But if trying to go to critical again, need at least 3 seconds
                if (newStatus === 'critical' && timeSinceChange < MIN_STATUS_DURATION) {
                    // Keep critical status if trying to stay critical
                    sensor.status = 'critical';
                    return; // Don't update timer
                }
                // Allow recovery from critical to warning/normal immediately
            } else {
                // Warning status: need at least 3 seconds before changing
                if (newStatus !== currentStatus && timeSinceChange < MIN_STATUS_DURATION) {
                    // Keep current status
                    sensor.status = currentStatus;
                    return; // Don't update timer
                }
            }
            
            // Status change is allowed, update status and timer
            if (sensor.status !== newStatus) {
                sensor.status = newStatus;
                statusTimer.status = newStatus;
                statusTimer.changeTime = currentTime;
            }
        });
    });
    
    // Always export updated data to window for floor plan editor
    window.roomsData = roomsData;
}

// ===== Create Room Card HTML =====
function createRoomCard(room) {
    const status = determineRoomStatus(room.sensors);
    const statusText = status === 'good' ? 'Good' : status === 'warning' ? 'Warning' : 'Danger';

    const roomCard = document.createElement('div');
    roomCard.className = 'room-card';
    roomCard.onclick = () => showRoomDetail(room.id);
    roomCard.dataset.status = status;

    roomCard.innerHTML = `
        <div class="room-card-header">
            <h3>${room.name}</h3>
            <span class="room-badge ${status}">${statusText}</span>
        </div>
        <div class="room-sensors">
            <div class="sensor-mini">
                <i class="fas ${sensorConfig.co2.icon}"></i>
                <div class="sensor-mini-info">
                    <div class="sensor-mini-label">CO2</div>
                    <div class="sensor-mini-value">${room.sensors.co2.value} ${room.sensors.co2.unit}</div>
                </div>
            </div>
            <div class="sensor-mini">
                <i class="fas ${sensorConfig.temperature.icon}"></i>
                <div class="sensor-mini-info">
                    <div class="sensor-mini-label">Temp</div>
                    <div class="sensor-mini-value">${room.sensors.temperature.value}${room.sensors.temperature.unit}</div>
                </div>
            </div>
            <div class="sensor-mini">
                <i class="fas ${sensorConfig.dust.icon}"></i>
                <div class="sensor-mini-info">
                    <div class="sensor-mini-label">Dust</div>
                    <div class="sensor-mini-value">${room.sensors.dust.value} ${room.sensors.dust.unit}</div>
                </div>
            </div>
            <div class="sensor-mini">
                <i class="fas ${sensorConfig.humidity.icon}"></i>
                <div class="sensor-mini-info">
                    <div class="sensor-mini-label">Humidity</div>
                    <div class="sensor-mini-value">${room.sensors.humidity.value}${room.sensors.humidity.unit}</div>
                </div>
            </div>
        </div>
        <div class="view-details">
            <span>View Details</span>
            <i class="fas fa-chevron-right"></i>
        </div>
    `;

    return roomCard;
}

// ===== Render Dashboard (Limited Rooms) =====
function renderDashboard() {
    const roomsGrid = document.getElementById('roomsGrid');
    if (!roomsGrid) return;

    roomsGrid.innerHTML = '';

    let goodCount = 0;
    let warningCount = 0;
    let dangerCount = 0;

    // Count all rooms status
    roomsData.forEach(room => {
        const status = determineRoomStatus(room.sensors);
        if (status === 'good') goodCount++;
        else if (status === 'warning') warningCount++;
        else if (status === 'danger') dangerCount++;
    });

    // Sort rooms by priority (danger > warning > good)
    const sortedRooms = [...roomsData].sort((a, b) => {
        const statusA = determineRoomStatus(a.sensors);
        const statusB = determineRoomStatus(b.sensors);
        const priority = { danger: 3, warning: 2, good: 1 };
        return priority[statusB] - priority[statusA];
    });

    // Show only first 4 rooms (priority rooms)
    const limitedRooms = sortedRooms.slice(0, 4);

    limitedRooms.forEach(room => {
        const roomCard = createRoomCard(room);
        roomsGrid.appendChild(roomCard);
    });

    // Update status counts
    const goodRoomsEl = document.getElementById('goodRooms');
    const warningRoomsEl = document.getElementById('warningRooms');
    const dangerRoomsEl = document.getElementById('dangerRooms');

    if (goodRoomsEl) goodRoomsEl.textContent = goodCount;
    if (warningRoomsEl) warningRoomsEl.textContent = warningCount;
    if (dangerRoomsEl) dangerRoomsEl.textContent = dangerCount;

    // Update total room count
    const totalRoomCountEl = document.getElementById('totalRoomCount');
    if (totalRoomCountEl) {
        totalRoomCountEl.textContent = `${roomsData.length} Rooms`;
    }
}


// ===== Navigate to Room Detail =====
function showRoomDetail(roomId) {
    window.location.href = `room-detail.html?id=${roomId}`;
}

// ===== Load Room Detail from URL =====
function loadRoomDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = parseInt(urlParams.get('id'));

    if (!roomId) return;

    const room = roomsData.find(r => r.id === roomId);
    if (!room) {
        window.location.href = 'dashboard.html';
        return;
    }

    document.getElementById('roomName').textContent = room.name;

    const status = determineRoomStatus(room.sensors);
    const statusBadge = document.querySelector('#roomStatus .status-badge');
    statusBadge.className = `status-badge ${status}`;
    statusBadge.textContent = status === 'good' ? 'Good' : status === 'warning' ? 'Needs Attention' : 'Dangerous';

    const recommendations = generateAIRecommendations(room.sensors);
    const recommendationsList = document.getElementById('recommendationsList');
    recommendationsList.innerHTML = '';

    recommendations.forEach(rec => {
        const recItem = document.createElement('div');
        recItem.className = 'recommendation-item';
        recItem.innerHTML = `
            <i class="fas ${rec.icon}"></i>
            <div class="recommendation-text">${rec.text}</div>
        `;
        recommendationsList.appendChild(recItem);
    });

    const sensorGrid = document.getElementById('sensorGrid');
    sensorGrid.innerHTML = '';

    Object.keys(room.sensors).forEach(sensorKey => {
        const sensor = room.sensors[sensorKey];
        const config = sensorConfig[sensorKey];

        const sensorCard = document.createElement('div');
        sensorCard.className = 'sensor-card';

        const statusText = sensor.status === 'normal' ? 'Normal' : sensor.status === 'warning' ? 'Warning' : 'Critical';

        // Check if icon is emoji or Font Awesome class
        const iconHTML = config.icon.startsWith('fa-') 
            ? `<i class="fas ${config.icon}"></i>`
            : `<span class="emoji-icon">${config.icon}</span>`;
        
        sensorCard.innerHTML = `
            <div class="sensor-header">
                <div class="sensor-icon">
                    ${iconHTML}
                </div>
                <div class="sensor-title">
                    <h4>${config.name}</h4>
                    <p>${config.sensor}</p>
                </div>
            </div>
            <div class="sensor-value">${sensor.value} <small>${sensor.unit}</small></div>
            <span class="sensor-status ${sensor.status}">${statusText}</span>
        `;

        sensorGrid.appendChild(sensorCard);
    });

    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('lastUpdate').textContent = `${dateString}, ${timeString}`;
}

// ===== Get Current Page =====
function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf('/') + 1);
    return page || 'dashboard.html';
}

// ===== Load Analytics Data from Firebase Realtime Database =====
/**
 * Load analytics data from Firebase Realtime Database for different time ranges
 * Falls back to dummy data if Firebase data not available
 */
async function generateDummyDataForRange(range) {
    let labels = [];
    let co2Data = [];
    let tempData = [];
    let humidityData = [];
    const now = new Date();

    // Try to load from Firebase Realtime Database
    if (window.rtdb && window.rtdbRef && window.rtdbGet) {
        try {
            const analyticsRef = window.rtdbRef(window.rtdb, 'analytics');
            const snapshot = await window.rtdbGet(analyticsRef);
            
            if (snapshot.exists()) {
                const analyticsData = snapshot.val();
                
                if (range === '24h') {
                    // Get last 24 hours of data
                    const today = now.toISOString().split('T')[0];
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yesterdayStr = yesterday.toISOString().split('T')[0];
                    
                    // Collect last 24 hours
                    const hours = [];
                    for (let i = 23; i >= 0; i--) {
                        const hour = new Date(now);
                        hour.setHours(hour.getHours() - i);
                        const dateKey = hour.toISOString().split('T')[0];
                        const hourKey = String(hour.getHours()).padStart(2, '0') + ':00';
                        
                        if (analyticsData[dateKey] && analyticsData[dateKey][hourKey]) {
                            const data = analyticsData[dateKey][hourKey];
                            labels.push(hourKey);
                            co2Data.push(data.co2 || 600);
                            tempData.push(data.temperature || 23);
                            humidityData.push(data.humidity || 50);
                        } else {
                            // Fill with default if missing
                            labels.push(hourKey);
                            co2Data.push(600);
                            tempData.push(23);
                            humidityData.push(50);
                        }
                    }
                } else if (range === '7d') {
                    // Get last 7 days - average per day
                    for (let i = 6; i >= 0; i--) {
                        const day = new Date(now);
                        day.setDate(day.getDate() - i);
                        const dateKey = day.toISOString().split('T')[0];
                        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        labels.push(`${dayNames[day.getDay()]} ${day.getDate()} ${monthNames[day.getMonth()]}`);
                        
                        if (analyticsData[dateKey]) {
                            // Calculate daily average
                            const hours = Object.values(analyticsData[dateKey]);
                            const avgCo2 = hours.reduce((sum, h) => sum + (h.co2 || 600), 0) / hours.length;
                            const avgTemp = hours.reduce((sum, h) => sum + (h.temperature || 23), 0) / hours.length;
                            const avgHumidity = hours.reduce((sum, h) => sum + (h.humidity || 50), 0) / hours.length;
                            
                            co2Data.push(Math.round(avgCo2));
                            tempData.push(Math.round(avgTemp * 10) / 10);
                            humidityData.push(Math.round(avgHumidity));
                        } else {
                            co2Data.push(600);
                            tempData.push(23);
                            humidityData.push(50);
                        }
                    }
                } else if (range === '30d') {
                    // Get last 30 days - average per day
                    for (let i = 29; i >= 0; i--) {
                        const day = new Date(now);
                        day.setDate(day.getDate() - i);
                        const dateKey = day.toISOString().split('T')[0];
                        labels.push(`${day.getDate()}/${day.getMonth() + 1}`);
                        
                        if (analyticsData[dateKey]) {
                            // Calculate daily average
                            const hours = Object.values(analyticsData[dateKey]);
                            const avgCo2 = hours.reduce((sum, h) => sum + (h.co2 || 600), 0) / hours.length;
                            const avgTemp = hours.reduce((sum, h) => sum + (h.temperature || 23), 0) / hours.length;
                            const avgHumidity = hours.reduce((sum, h) => sum + (h.humidity || 50), 0) / hours.length;
                            
                            co2Data.push(Math.round(avgCo2));
                            tempData.push(Math.round(avgTemp * 10) / 10);
                            humidityData.push(Math.round(avgHumidity));
                        } else {
                            co2Data.push(600);
                            tempData.push(23);
                            humidityData.push(50);
                        }
                    }
                }
                
                // If we got data from Firebase, return it
                if (labels.length > 0) {
                    return { labels, co2Data, tempData, humidityData };
                }
            }
        } catch (error) {
            console.warn('[ANALYTICS] Error loading from Firebase, using fallback data:', error);
        }
    }
    
    // Fallback to dummy data if Firebase not available or no data
    if (range === '24h') {
        // 24 hours: hourly data points (24 points)
        for (let i = 23; i >= 0; i--) {
            const hour = new Date(now);
            hour.setHours(hour.getHours() - i);
            labels.push(hour.getHours().toString().padStart(2, '0') + ':00');
            
            // Generate realistic data with some variation
            co2Data.push(Math.floor(Math.random() * 500) + 600);
            tempData.push(Math.floor(Math.random() * 10) + 20);
            humidityData.push(Math.floor(Math.random() * 30) + 40);
        }
    } else if (range === '7d') {
        // 7 days: daily data points (7 points, one per day)
        for (let i = 6; i >= 0; i--) {
            const day = new Date(now);
            day.setDate(day.getDate() - i);
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            labels.push(`${dayNames[day.getDay()]} ${day.getDate()} ${monthNames[day.getMonth()]}`);
            
            // Generate daily average data with more variation
            co2Data.push(Math.floor(Math.random() * 600) + 500);
            tempData.push(Math.floor(Math.random() * 12) + 18);
            humidityData.push(Math.floor(Math.random() * 35) + 35);
        }
    } else if (range === '30d') {
        // 30 days: daily data points (30 points, one per day)
        for (let i = 29; i >= 0; i--) {
            const day = new Date(now);
            day.setDate(day.getDate() - i);
            labels.push(`${day.getDate()}/${day.getMonth() + 1}`);
            
            // Generate daily average data with variation
            co2Data.push(Math.floor(Math.random() * 700) + 400);
            tempData.push(Math.floor(Math.random() * 15) + 17);
            humidityData.push(Math.floor(Math.random() * 40) + 30);
        }
    }

    return { labels, co2Data, tempData, humidityData };
}

// ===== Calculate Statistics Summary =====
/**
 * Calculate average statistics from analytics data
 * Returns average values for CO2, temperature, humidity, and warning count
 */
async function calculateStatisticsSummary(range) {
    const { co2Data, tempData, humidityData } = await generateDummyDataForRange(range);
    
    // Calculate averages
    const avgCO2 = Math.round(co2Data.reduce((a, b) => a + b, 0) / co2Data.length);
    const avgTemp = (tempData.reduce((a, b) => a + b, 0) / tempData.length).toFixed(1);
    const avgHumidity = Math.round(humidityData.reduce((a, b) => a + b, 0) / humidityData.length);
    
    // Calculate warnings (values above thresholds)
    let warnings = 0;
    co2Data.forEach(val => { if (val >= 1000) warnings++; });
    tempData.forEach(val => { if (val >= 26) warnings++; });
    humidityData.forEach(val => { if (val >= 60) warnings++; });
    
    return {
        avgCO2,
        avgTemp,
        avgHumidity,
        warnings
    };
}

// ===== Update Statistics Summary Display =====
/**
 * Update the statistics summary section with calculated values
 */
async function updateStatisticsSummary(range) {
    const stats = await calculateStatisticsSummary(range);
    
    // Update average CO2
    const avgCO2El = document.querySelector('.stat-item:nth-child(1) .stat-value');
    if (avgCO2El) {
        avgCO2El.textContent = `${stats.avgCO2} ppm`;
    }
    
    // Update average temperature
    const avgTempEl = document.querySelector('.stat-item:nth-child(2) .stat-value');
    if (avgTempEl) {
        avgTempEl.textContent = `${stats.avgTemp}°C`;
    }
    
    // Update average humidity
    const avgHumidityEl = document.querySelector('.stat-item:nth-child(3) .stat-value');
    if (avgHumidityEl) {
        avgHumidityEl.textContent = `${stats.avgHumidity}%`;
    }
    
    // Update total warnings
    const warningsEl = document.querySelector('.stat-item:nth-child(4) .stat-value');
    if (warningsEl) {
        warningsEl.textContent = stats.warnings;
    }
}

// ===== Update Charts with New Range =====
/**
 * Update all charts with new data for the selected time range
 */
async function updateChartsForRange(range) {
    const { labels, co2Data, tempData, humidityData } = await generateDummyDataForRange(range);
    
    // Update CO2 chart
    if (charts.co2) {
        charts.co2.data.labels = labels;
        charts.co2.data.datasets[0].data = co2Data;
        charts.co2.update();
    }
    
    // Update temperature chart
    if (charts.temperature) {
        charts.temperature.data.labels = labels;
        charts.temperature.data.datasets[0].data = tempData;
        charts.temperature.update();
    }
    
    // Update humidity chart
    if (charts.humidity) {
        charts.humidity.data.labels = labels;
        charts.humidity.data.datasets[0].data = humidityData;
        charts.humidity.update();
    }
    
    // Update statistics summary
    await updateStatisticsSummary(range);
    
    // Update subtitle text
    const subtitleEl = document.querySelector('.subtitle');
    if (subtitleEl) {
        if (range === '24h') {
            subtitleEl.textContent = 'Air quality data analysis for the last 24 hours';
        } else if (range === '7d') {
            subtitleEl.textContent = 'Air quality data analysis for the last 7 days';
        } else if (range === '30d') {
            subtitleEl.textContent = 'Air quality data analysis for the last 30 days';
        }
    }
}

// ===== Initialize Charts =====
/**
 * Initialize charts with default 24 hours data
 * Creates Chart.js instances for CO2, temperature, and humidity
 */
async function initializeCharts() {
    if (Object.keys(charts).length > 0) return;

    // Generate initial data for 24 hours
    const { labels, co2Data, tempData, humidityData } = await generateDummyDataForRange('24h');

    // Create CO2 chart
    const co2Ctx = document.getElementById('co2Chart');
    if (co2Ctx) {
        charts.co2 = new Chart(co2Ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'CO2 (ppm)',
                    data: co2Data,
                    borderColor: '#31bf8a',
                    backgroundColor: 'rgba(49, 191, 138, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    }

    // Create temperature chart
    const tempCtx = document.getElementById('temperatureChart');
    if (tempCtx) {
        charts.temperature = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: tempData,
                    borderColor: '#f39c12',
                    backgroundColor: 'rgba(243, 156, 18, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    }

    // Create humidity chart
    const humidityCtx = document.getElementById('humidityChart');
    if (humidityCtx) {
        charts.humidity = new Chart(humidityCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Humidity (%)',
                    data: humidityData,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    }
    
    // Initialize statistics summary with 24h data
    await updateStatisticsSummary('24h');
}

// ===== Modal Functions =====
function showAboutModal() {
    document.getElementById('aboutModal').classList.add('active');
}

function closeAboutModal() {
    document.getElementById('aboutModal').classList.remove('active');
}

// ===== Logout Function =====
function logout() {
    if (confirm('Apakah Anda yakin ingin keluar?')) {
        alert('Logout berhasil! (Integrasi Firebase akan ditambahkan)');
    }
}

// ===== Simulate Pressure for Realtime Room =====
/**
 * Simulate pressure sensor for the room that uses Realtime Database
 * Since pressure is not available in Realtime Database, we simulate it like other dummy sensors
 * This function only simulates pressure for the realtime room, other sensors come from Realtime Database
 */
function simulatePressureForRealtimeRoom() {
    const realtimeRoom = roomsData.find(r => r.id === realtimeSensorRoomId);
    if (realtimeRoom) {
        const sensor = realtimeRoom.sensors.pressure;
        const config = sensorConfig.pressure;
        
        if (!sensor || !config) return;
        
        // Get base value
        let baseValue = sensor.value || 1013;
        const minValue = 1000;
        const maxValue = 1020;
        let variationRange = 0.5; // Pressure changes (±0.5 hPa) - visible
        
        // Weather systems can cause larger variations
        if (Math.random() < 0.1) {
            variationRange = 1.2; // Larger variation occasionally
        }
        
        // Generate variation
        const random = Math.random();
        const variation = (random - 0.5) * 2 * variationRange;
        
        // Apply variation to current value
        let newValue = baseValue + variation;
        
        // Ensure value stays within bounds
        newValue = Math.max(minValue, Math.min(maxValue, newValue));
        
        // Round to 1 decimal place
        sensor.value = Math.round(newValue * 10) / 10;
        
        // Update pressure sensor status based on thresholds
        if (config.thresholds) {
            // Pressure: lower is worse
            if (sensor.value < config.thresholds.warning) {
                sensor.status = 'critical';
            } else if (sensor.value < config.thresholds.normal) {
                sensor.status = 'warning';
            } else {
                sensor.status = 'normal';
            }
        }
        
        // Export updated data to window for floor plan editor
        window.roomsData = roomsData;
        
        // Update floor plan room statuses if dashboard is open
        if (window.updateAllRoomStatuses && typeof window.updateAllRoomStatuses === 'function') {
            try {
                window.updateAllRoomStatuses();
            } catch (e) {
                // Silent fail if floor plan not loaded
            }
        }
        
        // Update UI if needed (only if modal is open)
        if (window.updateRoomSensorModal && typeof window.updateRoomSensorModal === 'function') {
            try {
                window.updateRoomSensorModal();
            } catch (e) {
                // Silent fail if modal not open
            }
        }
    }
}

// ===== Simulate Real-time Updates =====
/**
 * Generate realistic random sensor data with smooth variations
 * This function creates more natural, realistic sensor readings
 */
function simulateDataUpdate() {
    // Simulate pressure for the room that uses Realtime Database (since pressure is not in RTDB)
    if (realtimeSensorListener) {
        simulatePressureForRealtimeRoom();
    }
    
    roomsData.forEach((room, index) => {
        // Skip the room that uses real-time data from Realtime Database
        // Realtime room sensors (except pressure) will be updated by Realtime Database listener
        // Pressure for realtime room is simulated separately above
        if (room.id === realtimeSensorRoomId) {
            return; // Skip simulation for realtime room (except pressure which is handled above)
        }
        
        // For other rooms (id 2-8), continue with simulation
        Object.keys(room.sensors).forEach(sensorKey => {
            const sensor = room.sensors[sensorKey];
            const config = sensorConfig[sensorKey];
            
            // Get base value range based on sensor type
            let baseValue = sensor.value || 0;
            let minValue, maxValue, variationRange;
            
            // Define realistic ranges and variation for each sensor type
            // Reduced variation ranges to keep values mostly in normal range (favor green status)
            if (sensorKey === 'dust') {
                minValue = 5;
                maxValue = 100;
                variationRange = 3; // Smaller variations to stay mostly normal
                // Rarely add larger spikes (5% chance instead of 15%)
                if (Math.random() < 0.05) {
                    variationRange = 10; // Occasional larger variation
                } else if (Math.random() < 0.15) {
                    // 15% chance to significantly improve (simulating cleaning/ventilation)
                    variationRange = -15; // Force downward trend toward normal
                }
            } else if (sensorKey === 'co2') {
                minValue = 400;
                maxValue = 2000;
                variationRange = 20; // Smaller CO2 changes to stay mostly normal
                // Room occupancy can cause larger changes (rarely)
                if (Math.random() < 0.05) {
                    variationRange = 50; // Larger variation (rare)
                } else if (Math.random() < 0.15) {
                    // 15% chance to improve (simulating ventilation)
                    variationRange = -80; // Force downward trend toward normal
                }
            } else if (sensorKey === 'temperature') {
                minValue = 18;
                maxValue = 35;
                variationRange = 0.5; // Smaller temperature changes to stay mostly normal
                // AC cycles can cause changes (rarely)
                if (Math.random() < 0.05) {
                    variationRange = 1.2; // Larger variation (rare)
                } else if (Math.random() < 0.15) {
                    // 15% chance to normalize (AC adjustment) - bias toward normal range (20-26°C)
                    const normalMid = 23; // Middle of normal range
                    variationRange = baseValue > normalMid ? -1.5 : 1.5; // Move toward normal
                }
            } else if (sensorKey === 'humidity') {
                minValue = 30;
                maxValue = 90;
                variationRange = 2; // Smaller humidity changes to stay mostly normal
                // Weather changes can affect it (rarely)
                if (Math.random() < 0.05) {
                    variationRange = 5; // Larger variation (rare)
                } else if (Math.random() < 0.15) {
                    // 15% chance to normalize - bias toward normal range (40-60%)
                    const normalMid = 50; // Middle of normal range
                    variationRange = baseValue > normalMid ? -6 : 6; // Move toward normal
                }
            } else if (sensorKey === 'pressure') {
                minValue = 1000;
                maxValue = 1020;
                variationRange = 0.5; // Smaller pressure changes to stay mostly normal
                // Weather systems can affect it (rarely)
                if (Math.random() < 0.05) {
                    variationRange = 1.5; // Larger variation (rare)
                }
            } else if (sensorKey === 'gas') {
                minValue = 50;
                maxValue = 400;
                variationRange = 4; // Smaller gas level changes to stay mostly normal
                // Equipment or activities can spike it (rarely)
                if (Math.random() < 0.05) {
                    variationRange = 12; // Larger spike (rare)
                } else if (Math.random() < 0.15) {
                    // 15% chance to improve (ventilation)
                    variationRange = -20; // Force downward trend toward normal
                }
            } else if (sensorKey === 'smoke') {
                minValue = 10;
                maxValue = 150;
                variationRange = 3; // Smaller smoke changes to stay mostly normal
                // Cooking or other activities can increase it (rarely)
                if (Math.random() < 0.05) {
                    variationRange = 8; // Larger variation (rare)
                } else if (Math.random() < 0.15) {
                    // 15% chance to improve (ventilation/activity stops)
                    variationRange = -12; // Force downward trend toward normal
                }
            }
            
            // Generate variation with randomness for visible status changes
            let variation;
            if (variationRange < 0) {
                // Forced improvement: always negative
                variation = variationRange * (0.5 + Math.random() * 0.5); // -75% to -100% of range
            } else {
                // Normal variation: can go up or down, but bias toward normal range
                const random = Math.random();
                const config = sensorConfig[sensorKey];
                const thresholds = config ? config.thresholds : { normal: (minValue + maxValue) / 2, warning: maxValue * 0.8 };
                
                // Determine normal range midpoint
                let normalMid;
                if (sensorKey === 'pressure') {
                    normalMid = thresholds.normal + 3; // For pressure, higher is better
                } else {
                    normalMid = thresholds.normal * 0.7; // For others, lower is better (70% of normal threshold)
                }
                
                // Check current status to adjust variation behavior
                const currentStatus = sensor.status || 'normal';
                
                // If status is normal, use even smaller variations to maintain normal status longer
                let effectiveVariationRange = variationRange;
                if (currentStatus === 'normal') {
                    // Reduce variation by 50% when in normal status to keep it stable
                    effectiveVariationRange = variationRange * 0.5;
                }
                
                // Stronger bias toward normal range (40% chance for better stability)
                if (Math.random() < 0.40) {
                    if (sensorKey === 'pressure') {
                        // Pressure: if below normal, increase; if above, decrease slightly
                        if (baseValue < normalMid) {
                            variation = Math.abs(effectiveVariationRange) * (0.5 + Math.random() * 0.3); // 50-80% upward
                        } else {
                            variation = -Math.abs(effectiveVariationRange) * (0.3 + Math.random() * 0.2); // 30-50% downward
                        }
                    } else {
                        // Other sensors: if above normal, decrease; if below, increase slightly
                        if (baseValue > normalMid) {
                            variation = -Math.abs(effectiveVariationRange) * (0.8 + Math.random() * 0.2); // 80-100% downward
                        } else {
                            variation = Math.abs(effectiveVariationRange) * (0.2 + Math.random() * 0.3); // 20-50% upward
                        }
                    }
                } else {
                    // Standard variation: slightly bias toward normal
                    variation = (random - 0.5) * 2 * effectiveVariationRange; // ±effectiveVariationRange
                    // Add small bias toward normal (15% of variation for better stability)
                    if (sensorKey === 'pressure') {
                        if (baseValue < normalMid) variation += effectiveVariationRange * 0.15;
                        else variation -= effectiveVariationRange * 0.08;
                    } else {
                        if (baseValue > normalMid) variation -= effectiveVariationRange * 0.15;
                        else variation += effectiveVariationRange * 0.08;
                    }
                }
            }
            
            // Apply variation to current value
            let newValue = baseValue + variation;
            
            // Ensure value stays within bounds (but allow crossing thresholds for status changes)
            newValue = Math.max(minValue, Math.min(maxValue, newValue));
            
            // Check current status to determine recovery behavior
            const currentStatus = sensor.status || 'normal';
            
            // If sensor is critical, increase chance of recovery (20% chance to reset to normal)
            if (currentStatus === 'critical' && Math.random() < 0.20) {
                const config = sensorConfig[sensorKey];
                if (config && config.thresholds) {
                    if (sensorKey === 'pressure') {
                        // For pressure, target around normal threshold (higher = better)
                        newValue = config.thresholds.normal + (Math.random() - 0.2) * 4; // Bias toward normal+
                    } else {
                        // For other sensors, target well below normal threshold (lower = better)
                        // Use 40-70% of normal threshold to ensure recovery to normal
                        newValue = config.thresholds.normal * 0.4 + Math.random() * config.thresholds.normal * 0.3;
                    }
                    // Clamp to valid range
                    newValue = Math.max(minValue, Math.min(maxValue, newValue));
                }
            }
            // Occasionally force a "reset" to normal range (10% chance for normal/warning sensors)
            else if (Math.random() < 0.10) {
                const config = sensorConfig[sensorKey];
                if (config && config.thresholds) {
                    if (sensorKey === 'pressure') {
                        // For pressure, target around normal threshold (higher = better)
                        newValue = config.thresholds.normal + (Math.random() - 0.2) * 4; // Bias toward normal+
                    } else {
                        // For other sensors, target well below normal threshold (lower = better)
                        // Use 50-80% of normal threshold to ensure normal status
                        newValue = config.thresholds.normal * 0.5 + Math.random() * config.thresholds.normal * 0.3;
                    }
                    // Clamp to valid range
                    newValue = Math.max(minValue, Math.min(maxValue, newValue));
                }
            }
            
            // Round appropriately based on sensor type
            if (sensorKey === 'temperature') {
                sensor.value = Math.round(newValue * 10) / 10; // 1 decimal place
            } else if (sensorKey === 'humidity') {
                sensor.value = Math.round(newValue * 10) / 10; // 1 decimal place
            } else if (sensorKey === 'pressure') {
                sensor.value = Math.round(newValue * 10) / 10; // 1 decimal place
            } else {
                sensor.value = Math.round(newValue); // Whole numbers
            }
        });
    });

    // Update sensor statuses based on new values
    updateSensorStatuses();
    
    // CRITICAL: Always export updated data to window for floor plan editor
    // This must be done after updating values and statuses
    // Simply reassign to ensure we always have the latest reference
    window.roomsData = roomsData;
    
    // Debug: Log status for first room only if status changed significantly
    // Skip logging for room 1 if it uses Realtime Database (to avoid spam)
    if (roomsData.length > 0) {
        const firstRoom = roomsData[0];
        // Only log for non-Realtime Database rooms or if it's initial update
        if (firstRoom.id !== 1 || !realtimeSensorListener) {
            const warningCount = Object.values(firstRoom.sensors).filter(s => s.status === 'warning').length;
            const criticalCount = Object.values(firstRoom.sensors).filter(s => s.status === 'critical').length;
            const roomStatus = determineRoomStatus(firstRoom.sensors);
            // Only log if there are warnings or critical issues (not every second)
            if ((warningCount > 0 || criticalCount > 0) && Math.random() < 0.1) { // Log only 10% of the time to reduce spam
                console.log(`[SENSOR UPDATE] Room: ${firstRoom.name}, Status: ${roomStatus}, Warnings: ${warningCount}, Critical: ${criticalCount}`);
            }
        }
    }

    // Force update all UI elements that might display sensor data
    // This ensures real-time updates regardless of which page is active
    
    // Always try to update floor plan if it exists (for dashboard)
    if (window.updateAllRoomStatuses && typeof window.updateAllRoomStatuses === 'function') {
        try {
            window.updateAllRoomStatuses();
        } catch (e) {
            console.warn('Error updating room statuses:', e);
        }
    }
    
    // Update room sensor modal if it's open (for real-time sensor display)
    // This MUST be called after window.roomsData is updated
    // Call directly - no need for requestAnimationFrame
    if (window.updateRoomSensorModal && typeof window.updateRoomSensorModal === 'function') {
        try {
            window.updateRoomSensorModal();
        } catch (e) {
            console.error('Error updating room sensor modal:', e);
        }
    }
    
    // Update UI based on current page
    const currentPage = getCurrentPage();
    
    // Update dashboard page
    if (currentPage === 'dashboard.html' || currentPage === '') {
        // Update regular dashboard if exists
        const activePage = document.querySelector('.page.active');
        if (activePage && activePage.id === 'dashboardPage') {
            if (typeof renderDashboard === 'function') {
                renderDashboard();
            }
        }
    }
    
    // Update room detail page
    if (currentPage === 'room-detail.html') {
        if (typeof renderRoomDetail === 'function') {
            renderRoomDetail();
        } else if (typeof loadRoomDetail === 'function') {
            loadRoomDetail();
        }
    }
    
    // Update analytics page charts
    if (currentPage === 'analytics.html') {
        if (typeof updateCharts === 'function') {
            updateCharts();
        }
    }
}

// ===== Filter Rooms by Status =====
function filterRoomsByStatus(status) {
    const allCards = document.querySelectorAll('#allRoomsGrid .room-card');

    allCards.forEach(card => {
        if (status === 'all' || card.dataset.status === status) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });

    // Update count
    const visibleCards = document.querySelectorAll('#allRoomsGrid .room-card[style="display: block;"]');
    const roomCountEl = document.getElementById('roomCount');
    if (roomCountEl) {
        roomCountEl.textContent = `${visibleCards.length} Rooms`;
    }
}

// ===== Interactive Filters and Buttons =====
function initializeInteractiveElements() {
    // Handle time range selector buttons for analytics page
    const rangeButtons = document.querySelectorAll('.range-btn');
    rangeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active class from all buttons
            rangeButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            
            // Get the selected range from data attribute
            const selectedRange = this.dataset.range;
            
            // Update charts and statistics if on analytics page
            if (getCurrentPage() === 'analytics.html' && selectedRange) {
                updateChartsForRange(selectedRange).catch(err => {
                    console.error('[ANALYTICS] Error updating charts:', err);
                });
            }
        });
    });

    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    const dateButtons = document.querySelectorAll('.date-btn');
    dateButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            dateButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Room filter buttons
    const roomFilterButtons = document.querySelectorAll('.room-filter-btn');
    roomFilterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            roomFilterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const filterStatus = this.dataset.filter;
            filterRoomsByStatus(filterStatus);
        });
    });

    const modal = document.getElementById('aboutModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeAboutModal();
            }
        });
    }
}

// ===== Remove Splash Screen =====
function removeSplashScreen() {
    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (splash) {
            splash.style.display = 'none';
        }
    }, 2500);
}

// ===== Global variable to store interval ID =====
let sensorUpdateInterval = null;

// ===== Start real-time sensor data updates =====
/**
 * Start continuous real-time sensor data simulation
 * Updates sensor values every 1 second with realistic variations
 * This function runs immediately when the page loads
 */
function startSensorUpdates() {
    // Clear any existing interval to prevent duplicates
    if (sensorUpdateInterval) {
        clearInterval(sensorUpdateInterval);
        sensorUpdateInterval = null;
    }
    
    // Ensure roomsData is exported to window (for floor plan editor)
    window.roomsData = roomsData;
    
    // Start updating immediately (don't wait for first interval)
    simulateDataUpdate();
    
    // Then continue updating every 1 second for real-time feel
    // 1 second provides fast, responsive updates like real sensors
    sensorUpdateInterval = setInterval(() => {
        // CRITICAL: Always export the latest roomsData reference before update
        window.roomsData = roomsData;
        
        // Update sensor data - this modifies roomsData in place
        simulateDataUpdate();
        
        // After simulateDataUpdate, ensure window.roomsData still points to updated data
        // simulateDataUpdate already exports it, but ensure it's current
        window.roomsData = roomsData;
        
        // Force update modal if open
        if (window.updateRoomSensorModal && typeof window.updateRoomSensorModal === 'function') {
            window.updateRoomSensorModal();
        }
    }, 1000);
    
    // Make sure interval is accessible globally for debugging
    window.sensorUpdateInterval = sensorUpdateInterval;
    
    // Export functions for manual testing
    window.simulateDataUpdate = simulateDataUpdate;
    window.startSensorUpdates = startSensorUpdates;
}

// ===== Sync Device Data from Firebase to Rooms =====
/**
 * Sync device data from Firebase Realtime Database to rooms
 * This connects devices from Firebase to rooms in the floor plan
 */
let deviceToRoomSyncListener = null;

function setupDeviceToRoomSync() {
    if (!window.rtdb || !window.rtdbRef || !window.rtdbOnValue) {
        console.warn('[DASHBOARD] Firebase Realtime Database not available for device sync');
        return;
    }
    
    // Listen to all devices in Firebase Realtime Database
    const devicesRef = window.rtdbRef(window.rtdb, 'devices');
    
    deviceToRoomSyncListener = window.rtdbOnValue(devicesRef, (snapshot) => {
        if (snapshot.exists()) {
            const devices = snapshot.val();
            
            // Update devicesData from Firebase
            if (window.devicesData && Array.isArray(window.devicesData)) {
                Object.keys(devices).forEach(deviceId => {
                    const deviceData = devices[deviceId];
                    let device = window.devicesData.find(d => d.id === deviceId);
                    
                    if (!device) {
                        // Device not in devicesData yet - add it
                        device = {
                            id: deviceId,
                            name: deviceId.toUpperCase(),
                            assignedToRoom: null,
                            assignedToRoomName: null,
                            sensors: mapDeviceSensorDataFromFirebase(deviceData.data_sensor),
                            isRealtime: true,
                            status: deviceData.camera?.status || 'offline',
                            lastUpdate: deviceData.camera?.lastSeen || new Date().toISOString(),
                            camera: deviceData.camera || {}
                        };
                        window.devicesData.push(device);
                    } else {
                        // Update existing device
                        device.sensors = mapDeviceSensorDataFromFirebase(deviceData.data_sensor);
                        device.status = deviceData.camera?.status || 'offline';
                        device.lastUpdate = deviceData.camera?.lastSeen || new Date().toISOString();
                        device.camera = deviceData.camera || {};
                    }
                    
                    // Update sensor statuses
                    if (window.updateDeviceSensorStatuses) {
                        window.updateDeviceSensorStatuses(device);
                    }
                    
                    // Sync device data to all rooms that use this device
                    if (window.syncDeviceToAllRooms && typeof window.syncDeviceToAllRooms === 'function') {
                        try {
                            // This will sync device data to all rooms in floor plan that use this device
                            window.syncDeviceToAllRooms(deviceId);
                        } catch (e) {
                            console.warn('[DASHBOARD] Error syncing device to rooms:', e);
                        }
                    } else {
                        // Fallback: trigger updateAllRoomStatuses which will sync devices
                        if (window.updateAllRoomStatuses && typeof window.updateAllRoomStatuses === 'function') {
                            try {
                                window.updateAllRoomStatuses();
                            } catch (e) {
                                // Silent fail if floor plan not loaded
                            }
                        }
                    }
                });
            }
            
            // Update floor plan room statuses
            if (window.updateAllRoomStatuses && typeof window.updateAllRoomStatuses === 'function') {
                try {
                    window.updateAllRoomStatuses();
                } catch (e) {
                    console.warn('[DASHBOARD] Error updating room statuses:', e);
                }
            }
        }
    }, (error) => {
        console.error('[DASHBOARD] Error syncing device data to rooms:', error);
    });
    
    console.log('[DASHBOARD] Device to room sync listener initialized');
}

/**
 * Map device sensor data from Firebase structure to device sensors format
 */
function mapDeviceSensorDataFromFirebase(dataSensor) {
    if (!dataSensor) {
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
 * Initialize device to room sync after Firebase is ready
 */
function initializeDeviceToRoomSyncAfterFirebaseReady() {
    if (window.rtdb && window.rtdbRef && window.rtdbOnValue) {
        setupDeviceToRoomSync();
        return;
    }
    
    let attempts = 0;
    const maxAttempts = 50; // 10 seconds
    
    const checkInterval = setInterval(() => {
        attempts++;
        
        if (window.rtdb && window.rtdbRef && window.rtdbOnValue) {
            clearInterval(checkInterval);
            setupDeviceToRoomSync();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn('[DASHBOARD] Firebase Realtime Database not available for device sync');
        }
    }, 200);
}

// ===== Initialize App =====
function initApp() {
    // Initialize sensor statuses first
    updateSensorStatuses();
    
    // Initialize real-time sensor data for room 1 from Realtime Database
    // Realtime Database doesn't require authentication, so we can initialize immediately
    // Try to initialize right away, with fallback if Firebase not ready yet
    initializeRealtimeSensorAfterFirebaseReady();
    
    // Initialize device to room sync from Firebase Realtime Database
    // This syncs device data to rooms that have deviceId assigned
    initializeDeviceToRoomSyncAfterFirebaseReady();
    
    // Start sensor updates immediately (doesn't need auth)
    // Note: Room 1 (id: 1) will skip simulation and use real-time data instead
    startSensorUpdates();

    const currentPage = getCurrentPage();

    // Initialize based on current page
    switch(currentPage) {
        case 'dashboard.html':
        case '':
            // Initialize floor plan editor instead of regular dashboard
            if (window.initFloorPlanEditor) {
                // Wait for auth check before initializing floor plan editor
                if (window.waitForAuthCheck) {
                    window.waitForAuthCheck().then(() => {
                        window.initFloorPlanEditor();
                    });
                } else {
                    // If no auth check needed, initialize immediately
                    window.initFloorPlanEditor();
                }
            } else {
                renderDashboard();
            }
            removeSplashScreen();
            break;
        
        case 'index.html':
            removeSplashScreen();
            break;

        case 'analytics.html':
            initializeCharts().catch(err => {
                console.error('[ANALYTICS] Error initializing charts:', err);
            });
            break;

        case 'room-detail.html':
            loadRoomDetail();
            break;

        case 'alerts.html':
        case 'history.html':
        case 'comparison.html':
        case 'settings.html':
        case 'profile.html':
            // No special initialization needed
            break;
    }

    initializeInteractiveElements();
}

document.addEventListener('DOMContentLoaded', initApp);

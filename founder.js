/**
 * Founder Tools - Device Data Generator
 * Generates and sends realistic dummy sensor data to Firebase Realtime Database
 * Supports realtime and static device modes
 */

// Global variables
let isSending = false;
let updateIntervalId = null;
let deviceCount = 20;
let updateInterval = 5; // seconds
let totalUpdates = 0;
let devicesCreated = 0;
let deviceStates = {}; // Store device states for realistic variations
let realtimeDevices = new Set(); // Devices that update in realtime

// Sensor thresholds for realistic indoor office environment
const SENSOR_THRESHOLDS = {
    co2: { normal: 1000, warning: 1400, critical: 2000 },
    temperature: { normal: 26, warning: 29, critical: 32 },
    humidity: { normal: 60, warning: 70, critical: 80 },
    pm25: { normal: 35, warning: 55, critical: 100 },
    pm10: { normal: 50, warning: 100, critical: 200 },
    pm1: { normal: 25, warning: 40, critical: 60 },
    mq2: { normal: 200, warning: 300, critical: 400 },
    mq2_raw: { normal: 50, warning: 80, critical: 150 }
};

// Wait for Firebase to be ready
function waitForFirebase() {
    return new Promise((resolve, reject) => {
        if (window.rtdb && window.rtdbRef && window.rtdbSet && window.rtdbUpdate) {
            resolve();
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 50; // 10 seconds
        
        const checkInterval = setInterval(() => {
            attempts++;
            
            if (window.rtdb && window.rtdbRef && window.rtdbSet && window.rtdbUpdate) {
                clearInterval(checkInterval);
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                reject(new Error('Firebase not available after 10 seconds'));
            }
        }, 200);
    });
}

/**
 * Determine sensor status based on value and thresholds
 */
function getSensorStatus(value, thresholds) {
    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.warning) return 'warning';
    return 'normal';
}

/**
 * Generate realistic sensor data for indoor office environment
 * Returns values with status distribution: 70% normal, 20% warning, 10% critical
 */
function generateRealisticSensorData(deviceId, isRealtime = true) {
    // Get or initialize device state
    if (!deviceStates[deviceId]) {
        deviceStates[deviceId] = {
            co2: { base: 600, trend: 0 },
            temperature: { base: 23.5, trend: 0 },
            humidity: { base: 50, trend: 0 },
            pm25: { base: 20, trend: 0 },
            pm10: { base: 30, trend: 0 },
            pm1: { base: 15, trend: 0 },
            mq2: { base: 120, trend: 0 },
            mq2_raw: { base: 35, trend: 0 },
            camera: {
                ip: `192.168.1.${Math.floor(Math.random() * 254) + 2}`,
                rssi: -65,
                status: 'online',
                personCount: 0
            }
        };
    }
    
    const state = deviceStates[deviceId];
    const rand = Math.random();
    
    // Determine target status: 70% normal, 20% warning, 10% critical
    let targetStatus = 'normal';
    if (rand < 0.1) {
        targetStatus = 'critical';
    } else if (rand < 0.3) {
        targetStatus = 'warning';
    }
    
    // Generate CO2 (indoor office: 400-2000 ppm)
    if (isRealtime) {
        // Realistic variation: ±20 ppm per update, with occasional spikes
        state.co2.trend += (Math.random() - 0.5) * 40;
        if (Math.random() < 0.05) state.co2.trend += (Math.random() - 0.3) * 100; // Occasional spike
        state.co2.base = Math.max(400, Math.min(2000, state.co2.base + state.co2.trend * 0.1));
    }
    let co2 = Math.round(state.co2.base);
    if (targetStatus === 'critical') co2 = Math.floor(Math.random() * 400) + 1600;
    else if (targetStatus === 'warning') co2 = Math.floor(Math.random() * 200) + 1400;
    else co2 = Math.floor(Math.random() * 600) + 400;
    
    // Generate Temperature (indoor office: 20-30°C, AC controlled)
    if (isRealtime) {
        state.temperature.trend += (Math.random() - 0.5) * 0.8;
        state.temperature.base = Math.max(20, Math.min(30, state.temperature.base + state.temperature.trend * 0.05));
    }
    let temperature = Math.round(state.temperature.base * 10) / 10;
    if (targetStatus === 'critical') temperature = Math.round((Math.random() * 3 + 29) * 10) / 10;
    else if (targetStatus === 'warning') temperature = Math.round((Math.random() * 3 + 26) * 10) / 10;
    else temperature = Math.round((Math.random() * 6 + 20) * 10) / 10;
    
    // Generate Humidity (indoor office: 40-70%)
    if (isRealtime) {
        state.humidity.trend += (Math.random() - 0.5) * 4;
        state.humidity.base = Math.max(40, Math.min(70, state.humidity.base + state.humidity.trend * 0.1));
    }
    let humidity = Math.round(state.humidity.base);
    if (targetStatus === 'critical') humidity = Math.floor(Math.random() * 10) + 70;
    else if (targetStatus === 'warning') humidity = Math.floor(Math.random() * 10) + 60;
    else humidity = Math.floor(Math.random() * 20) + 40;
    
    // Generate PM2.5 (indoor office: 5-100 μg/m³)
    if (isRealtime) {
        state.pm25.trend += (Math.random() - 0.5) * 6;
        state.pm25.base = Math.max(5, Math.min(100, state.pm25.base + state.pm25.trend * 0.1));
    }
    let pm25 = Math.round(state.pm25.base);
    if (targetStatus === 'critical') pm25 = Math.floor(Math.random() * 45) + 55;
    else if (targetStatus === 'warning') pm25 = Math.floor(Math.random() * 20) + 35;
    else pm25 = Math.floor(Math.random() * 30) + 5;
    
    // Generate PM10
    let pm10 = Math.round(pm25 * 1.5);
    pm10 = Math.max(10, Math.min(200, pm10));
    
    // Generate PM1
    let pm1 = Math.round(pm25 * 0.6);
    pm1 = Math.max(5, Math.min(60, pm1));
    
    // Generate MQ2 (gas sensor)
    if (isRealtime) {
        state.mq2.trend += (Math.random() - 0.5) * 20;
        state.mq2.base = Math.max(50, Math.min(400, state.mq2.base + state.mq2.trend * 0.1));
    }
    let mq2 = Math.round(state.mq2.base);
    if (targetStatus === 'critical') mq2 = Math.floor(Math.random() * 100) + 300;
    else if (targetStatus === 'warning') mq2 = Math.floor(Math.random() * 100) + 200;
    else mq2 = Math.floor(Math.random() * 150) + 50;
    
    // Generate MQ2 Raw
    if (isRealtime) {
        state.mq2_raw.trend += (Math.random() - 0.5) * 10;
        state.mq2_raw.base = Math.max(10, Math.min(150, state.mq2_raw.base + state.mq2_raw.trend * 0.1));
    }
    let mq2_raw = Math.round(state.mq2_raw.base);
    if (targetStatus === 'critical') mq2_raw = Math.floor(Math.random() * 70) + 80;
    else if (targetStatus === 'warning') mq2_raw = Math.floor(Math.random() * 30) + 50;
    else mq2_raw = Math.floor(Math.random() * 40) + 10;
    
    // Generate MQ2 Voltage (0.1-5.0V)
    const mq2_voltage = Math.round((mq2_raw / 150 * 4.9 + 0.1) * 100) / 100;
    
    return {
        co2,
        humidity,
        mq2,
        mq2_raw,
        mq2_voltage,
        pm1,
        pm10,
        pm25,
        temperature
    };
}

/**
 * Update camera data (only rssi, lastSeen, status change)
 */
function updateCameraData(deviceId) {
    if (!deviceStates[deviceId]) {
        deviceStates[deviceId] = {
            camera: {
                ip: `192.168.1.${Math.floor(Math.random() * 254) + 2}`,
                rssi: -65,
                status: 'online',
                personCount: 0 // Initialize person count
            }
        };
    }
    
    const camera = deviceStates[deviceId].camera;
    
    // Update RSSI (WiFi signal strength varies: -50 to -90 dBm)
    camera.rssi += Math.floor((Math.random() - 0.5) * 10);
    camera.rssi = Math.max(-90, Math.min(-30, camera.rssi));
    
    // Update lastSeen
    camera.lastSeen = new Date().toISOString();
    
    // Update person count (realistic variation: 0-10 people, changes gradually)
    // Person count can increase or decrease by 1, or stay the same
    if (camera.personCount === undefined) {
        camera.personCount = Math.floor(Math.random() * 5); // Initialize with 0-4 people
    } else {
        const change = Math.random();
        if (change < 0.1) {
            // 10% chance to increase by 1
            camera.personCount = Math.min(10, camera.personCount + 1);
        } else if (change < 0.2) {
            // 10% chance to decrease by 1
            camera.personCount = Math.max(0, camera.personCount - 1);
        }
        // 80% chance to stay the same (realistic - people don't move constantly)
    }
    
    // Status can change occasionally (5% chance to go offline, 20% chance to come back online if offline)
    if (camera.status === 'online' && Math.random() < 0.05) {
        camera.status = 'offline';
    } else if (camera.status === 'offline' && Math.random() < 0.2) {
        camera.status = 'online';
    }
    
    return { ...camera };
}

/**
 * Create device data structure with realistic values
 */
function createDeviceData(deviceId, isRealtime = true) {
    const sensorData = generateRealisticSensorData(deviceId, isRealtime);
    const cameraData = updateCameraData(deviceId);
    
    return {
        camera: cameraData,
        data_sensor: sensorData
    };
}

/**
 * Send device data to Firebase Realtime Database
 * Preserves existing fields like 'assigned' when updating device data
 */
async function sendDeviceData(deviceId, deviceData) {
    try {
        if (!window.rtdb || !window.rtdbRef || !window.rtdbSet || !window.rtdbGet || !window.rtdbUpdate) {
            throw new Error('Firebase not available');
        }
        
        const deviceRef = window.rtdbRef(window.rtdb, `devices/${deviceId}`);
        
        // Read existing data to preserve fields like 'assigned'
        let existingData = {};
        try {
            const snapshot = await window.rtdbGet(deviceRef);
            if (snapshot.exists()) {
                existingData = snapshot.val();
            }
        } catch (readError) {
            // If read fails, continue with new data (device might not exist yet)
            console.warn(`Could not read existing data for ${deviceId}:`, readError);
        }
        
        // Preserve 'assigned' field if it exists in existing data
        // Using update instead of set to preserve existing fields like 'assigned'
        const dataToSend = {
            ...deviceData
        };
        
        // Preserve 'assigned' field from existing data if it exists
        if (existingData.assigned !== undefined && existingData.assigned !== null) {
            dataToSend.assigned = existingData.assigned;
        }
        
        // Use update to preserve existing fields (like 'assigned')
        // Update only updates the fields specified, preserving others
        await window.rtdbUpdate(deviceRef, dataToSend);
        
        return true;
    } catch (error) {
        console.error(`Error sending data for ${deviceId}:`, error);
        addLog(`Error sending data for ${deviceId}: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Delete device data from Firebase
 */
async function deleteDeviceData(deviceId) {
    try {
        if (!window.rtdb || !window.rtdbRef) {
            throw new Error('Firebase not available');
        }
        
        const deviceRef = window.rtdbRef(window.rtdb, `devices/${deviceId}`);
        await window.rtdbSet(deviceRef, null);
        
        // Remove from device states
        delete deviceStates[deviceId];
        realtimeDevices.delete(deviceId);
        
        return true;
    } catch (error) {
        console.error(`Error deleting device ${deviceId}:`, error);
        addLog(`Error deleting device ${deviceId}: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Delete all devices
 */
async function deleteAllDevices() {
    if (!confirm('Are you sure you want to delete all device data?')) {
        return;
    }
    
    try {
        await waitForFirebase();
        
        addLog('Deleting all devices...', 'info');
        const promises = [];
        
        for (let i = 2; i <= deviceCount + 1; i++) {
            const deviceId = `aeronexa-${String(i).padStart(3, '0')}`;
            promises.push(deleteDeviceData(deviceId));
        }
        
        const results = await Promise.all(promises);
        const successCount = results.filter(r => r === true).length;
        
        addLog(`Deleted ${successCount} devices`, successCount === deviceCount ? 'success' : 'info');
        
        // Clear device states
        deviceStates = {};
        realtimeDevices.clear();
        
    } catch (error) {
        addLog(`Error deleting devices: ${error.message}`, 'error');
    }
}

/**
 * Update devices based on realtime settings
 * Only updates devices marked as realtime
 */
async function updateAllDevices() {
    if (!isSending) return;
    
    const promises = [];
    let realtimeCount = 0;
    
    // If no devices selected, all are realtime
    const allRealtime = realtimeDevices.size === 0;
    
    for (let i = 2; i <= deviceCount + 1; i++) {
        const deviceId = `aeronexa-${String(i).padStart(3, '0')}`;
        const isRealtime = allRealtime || realtimeDevices.has(deviceId);
        
        // Only update realtime devices
        if (isRealtime) {
            realtimeCount++;
            const deviceData = createDeviceData(deviceId, true);
            promises.push(sendDeviceData(deviceId, deviceData));
        }
    }
    
    if (promises.length === 0) {
        addLog('No realtime devices to update', 'info');
        return;
    }
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r === true).length;
    
    totalUpdates++;
    updateStatusDisplay();
    
    if (successCount === realtimeCount) {
        addLog(`Successfully updated ${successCount} realtime device(s)`, 'success');
    } else {
        addLog(`Updated ${successCount}/${realtimeCount} realtime device(s)`, 'info');
    }
}

/**
 * Start sending data continuously
 */
async function startSending() {
    if (isSending) return;
    
    try {
        await waitForFirebase();
        
        deviceCount = parseInt(document.getElementById('deviceCount').value) || 20;
        updateInterval = parseInt(document.getElementById('updateInterval').value) || 5;
        
        if (deviceCount < 1 || deviceCount > 100) {
            alert('Device count must be between 1 and 100');
            return;
        }
        
        if (updateInterval < 1 || updateInterval > 60) {
            alert('Update interval must be between 1 and 60 seconds');
            return;
        }
        
        isSending = true;
        devicesCreated = deviceCount;
        
        // Initialize all devices as realtime if none selected
        if (realtimeDevices.size === 0) {
            for (let i = 2; i <= deviceCount + 1; i++) {
                const deviceId = `aeronexa-${String(i).padStart(3, '0')}`;
                realtimeDevices.add(deviceId);
            }
            // Update UI to reflect all devices as realtime
            loadDeviceList();
        }
        
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('deviceCount').disabled = true;
        document.getElementById('updateInterval').disabled = true;
        
        updateStatusDisplay();
        addLog(`Starting data generation for ${deviceCount} devices (aeronexa-002 to aeronexa-${String(deviceCount + 1).padStart(3, '0')})`, 'info');
        addLog(`Update interval: ${updateInterval} seconds`, 'info');
        addLog(`Realtime devices: ${realtimeDevices.size === 0 ? 'All' : realtimeDevices.size}`, 'info');
        
        // Create initial data for all devices first
        addLog('Creating initial data for all devices...', 'info');
        const initialPromises = [];
        for (let i = 2; i <= deviceCount + 1; i++) {
            const deviceId = `aeronexa-${String(i).padStart(3, '0')}`;
            const deviceData = createDeviceData(deviceId, false); // Initial creation, not realtime update
            initialPromises.push(sendDeviceData(deviceId, deviceData));
        }
        await Promise.all(initialPromises);
        addLog(`Initial data created for ${deviceCount} devices`, 'success');
        
        // Then start realtime updates
        await updateAllDevices();
        
        updateIntervalId = setInterval(async () => {
            if (isSending) {
                await updateAllDevices();
            }
        }, updateInterval * 1000);
        
    } catch (error) {
        addLog(`Error starting: ${error.message}`, 'error');
        isSending = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
    }
}

/**
 * Stop sending data
 */
function stopSending() {
    if (!isSending) return;
    
    isSending = false;
    
    if (updateIntervalId) {
        clearInterval(updateIntervalId);
        updateIntervalId = null;
    }
    
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('deviceCount').disabled = false;
    document.getElementById('updateInterval').disabled = false;
    
    updateStatusDisplay();
    addLog('Stopped sending data', 'info');
}

/**
 * Update status display
 */
function updateStatusDisplay() {
    const statusValue = document.getElementById('statusValue');
    const devicesCountEl = document.getElementById('devicesCount');
    const lastUpdateEl = document.getElementById('lastUpdate');
    const totalUpdatesEl = document.getElementById('totalUpdates');
    
    if (isSending) {
        statusValue.textContent = 'Active';
        statusValue.className = 'status-value active';
    } else {
        statusValue.textContent = 'Inactive';
        statusValue.className = 'status-value inactive';
    }
    
    devicesCountEl.textContent = devicesCreated;
    
    if (totalUpdates > 0) {
        lastUpdateEl.textContent = new Date().toLocaleTimeString();
    } else {
        lastUpdateEl.textContent = 'Never';
    }
    
    totalUpdatesEl.textContent = totalUpdates;
}

/**
 * Add log entry
 */
function addLog(message, type = 'info') {
    const logContainer = document.getElementById('logContainer');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    while (logContainer.children.length > 100) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

/**
 * Generate realistic analytics data for charts
 * Supports 24 hours, 7 days, or 30 days
 */
async function generateAnalyticsData(range = '24h') {
    try {
        await waitForFirebase();
        
        addLog(`Starting analytics data generation for ${range}...`, 'info');
        document.getElementById('generateAnalyticsBtn').disabled = true;
        document.getElementById('analyticsStatus').textContent = 'Generating...';
        document.getElementById('analyticsStatus').className = 'status-value';
        
        if (!window.rtdb || !window.rtdbRef || !window.rtdbSet) {
            throw new Error('Firebase not available');
        }
        
        const now = new Date();
        const analyticsData = {};
        let dataPoints = 0;
        
        if (range === '24h') {
            // Generate hourly data for last 24 hours
            for (let hour = 23; hour >= 0; hour--) {
                const time = new Date(now);
                time.setHours(time.getHours() - hour);
                const dateKey = time.toISOString().split('T')[0];
                const hourKey = String(time.getHours()).padStart(2, '0') + ':00';
                
                if (!analyticsData[dateKey]) {
                    analyticsData[dateKey] = {};
                }
                
                // Realistic office data: lower at night, higher during day
                const hourOfDay = time.getHours();
                const isDayTime = hourOfDay >= 8 && hourOfDay <= 18;
                const dayFactor = isDayTime ? 1.2 : 0.8;
                
                analyticsData[dateKey][hourKey] = {
                    co2: Math.floor((Math.random() * 400 + 500) * dayFactor),
                    temperature: Math.round((Math.random() * 5 + 22) * 10) / 10,
                    humidity: Math.floor(Math.random() * 20 + 45),
                    pm1: Math.floor(Math.random() * 20 + 10),
                    pm10: Math.floor(Math.random() * 30 + 20),
                    pm25: Math.floor(Math.random() * 25 + 15)
                };
                dataPoints++;
            }
        } else if (range === '7d') {
            // Generate daily average data for last 7 days
            for (let day = 6; day >= 0; day--) {
                const date = new Date(now);
                date.setDate(date.getDate() - day);
                const dateKey = date.toISOString().split('T')[0];
                
                analyticsData[dateKey] = {};
                
                // Generate hourly data for each day
                for (let hour = 0; hour < 24; hour++) {
                    const hourKey = String(hour).padStart(2, '0') + ':00';
                    const isDayTime = hour >= 8 && hour <= 18;
                    const dayFactor = isDayTime ? 1.2 : 0.8;
                    
                    analyticsData[dateKey][hourKey] = {
                        co2: Math.floor((Math.random() * 400 + 500) * dayFactor),
                        temperature: Math.round((Math.random() * 5 + 22) * 10) / 10,
                        humidity: Math.floor(Math.random() * 20 + 45),
                        pm1: Math.floor(Math.random() * 20 + 10),
                        pm10: Math.floor(Math.random() * 30 + 20),
                        pm25: Math.floor(Math.random() * 25 + 15)
                    };
                    dataPoints++;
                }
            }
        } else if (range === '30d') {
            // Generate daily average data for last 30 days
            for (let day = 29; day >= 0; day--) {
                const date = new Date(now);
                date.setDate(date.getDate() - day);
                const dateKey = date.toISOString().split('T')[0];
                
                analyticsData[dateKey] = {};
                
                // Generate hourly data for each day
                for (let hour = 0; hour < 24; hour++) {
                    const hourKey = String(hour).padStart(2, '0') + ':00';
                    const isDayTime = hour >= 8 && hour <= 18;
                    const dayFactor = isDayTime ? 1.2 : 0.8;
                    
                    // Add some weekly variation (weekends have lower values)
                    const dayOfWeek = date.getDay();
                    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.7 : 1.0;
                    
                    analyticsData[dateKey][hourKey] = {
                        co2: Math.floor((Math.random() * 400 + 500) * dayFactor * weekendFactor),
                        temperature: Math.round((Math.random() * 5 + 22) * 10) / 10,
                        humidity: Math.floor(Math.random() * 20 + 45),
                        pm1: Math.floor(Math.random() * 20 + 10),
                        pm10: Math.floor(Math.random() * 30 + 20),
                        pm25: Math.floor(Math.random() * 25 + 15)
                    };
                    dataPoints++;
                }
            }
        }
        
        // Send to Firebase Realtime Database
        const analyticsRef = window.rtdbRef(window.rtdb, 'analytics');
        await window.rtdbSet(analyticsRef, analyticsData);
        
        addLog(`Analytics data generated successfully!`, 'success');
        addLog(`Range: ${range}, Data points: ${dataPoints}`, 'info');
        
        document.getElementById('analyticsStatus').textContent = 'Generated';
        document.getElementById('analyticsStatus').className = 'status-value active';
        document.getElementById('generateAnalyticsBtn').disabled = false;
        
    } catch (error) {
        addLog(`Error generating analytics data: ${error.message}`, 'error');
        document.getElementById('analyticsStatus').textContent = 'Error';
        document.getElementById('analyticsStatus').className = 'status-value inactive';
        document.getElementById('generateAnalyticsBtn').disabled = false;
    }
}

/**
 * Load device list and show realtime controls
 */
async function loadDeviceList() {
    const deviceListContainer = document.getElementById('deviceListContainer');
    if (!deviceListContainer) return;
    
    deviceListContainer.innerHTML = '';
    
    for (let i = 2; i <= deviceCount + 1; i++) {
        const deviceId = `aeronexa-${String(i).padStart(3, '0')}`;
        const isRealtime = realtimeDevices.has(deviceId) || realtimeDevices.size === 0;
        
        const deviceItem = document.createElement('div');
        deviceItem.className = 'device-list-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isRealtime;
        checkbox.setAttribute('data-device-id', deviceId);
        checkbox.addEventListener('change', (e) => {
            toggleDeviceRealtime(deviceId, e.target.checked);
        });
        
        const label = document.createElement('label');
        label.className = 'device-checkbox';
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(deviceId));
        
        const status = document.createElement('span');
        status.className = `device-status ${isRealtime ? 'realtime' : 'static'}`;
        status.textContent = isRealtime ? 'Realtime' : 'Static';
        label.appendChild(status);
        
        deviceItem.appendChild(label);
        
        deviceListContainer.appendChild(deviceItem);
    }
}

/**
 * Toggle device realtime mode
 */
function toggleDeviceRealtime(deviceId, isRealtime) {
    if (isRealtime) {
        realtimeDevices.add(deviceId);
    } else {
        realtimeDevices.delete(deviceId);
    }
    
    // Update UI
    const items = document.querySelectorAll('.device-list-item');
    items.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const status = item.querySelector('.device-status');
        if (checkbox && checkbox.getAttribute('data-device-id') === deviceId) {
            status.textContent = isRealtime ? 'Realtime' : 'Static';
            status.className = `device-status ${isRealtime ? 'realtime' : 'static'}`;
        }
    });
    
    addLog(`${deviceId} set to ${isRealtime ? 'realtime' : 'static'} mode`, 'info');
}

// Export functions to window
window.toggleDeviceRealtime = toggleDeviceRealtime;
window.deleteAllDevices = deleteAllDevices;
window.generateAnalyticsData = generateAnalyticsData;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startBtn').addEventListener('click', startSending);
    document.getElementById('stopBtn').addEventListener('click', stopSending);
    document.getElementById('generateAnalyticsBtn').addEventListener('click', () => {
        const range = document.getElementById('analyticsRange')?.value || '24h';
        generateAnalyticsData(range);
    });
    document.getElementById('deleteAllBtn')?.addEventListener('click', deleteAllDevices);
    
    // Load device list when device count changes
    document.getElementById('deviceCount').addEventListener('input', () => {
        const newCount = parseInt(document.getElementById('deviceCount').value) || 20;
        
        // Clear old device states and realtime settings
        const oldDeviceIds = Object.keys(deviceStates);
        oldDeviceIds.forEach(id => {
            if (!id.startsWith(`aeronexa-${String(deviceCount + 2).padStart(3, '0')}`)) {
                // Keep states for devices that still exist
            }
        });
        
        // Reset realtime devices for new count
        realtimeDevices.clear();
        for (let i = 2; i <= newCount + 1; i++) {
            const deviceId = `aeronexa-${String(i).padStart(3, '0')}`;
            realtimeDevices.add(deviceId);
        }
        
        deviceCount = newCount;
        loadDeviceList();
    });
    
    updateStatusDisplay();
    addLog('Founder Tools initialized. Ready to generate data.', 'info');
    
    // Initial device list load
    setTimeout(() => loadDeviceList(), 500);
});

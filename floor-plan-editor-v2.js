/**
 * Floor Plan Editor Module v2 - Enhanced 2D Drawing System
 * Inspired by blueprint-js with grid system and room drawing
 */

// Global variables for floor plan editor
let floorPlanData = {
    floors: [],
    currentFloorId: null,
    currentFloorIndex: -1
};

// Initialize hover mode flag
if (typeof window.isHoverMode === 'undefined') {
    window.isHoverMode = false;
}

let isDrawingMode = false;
let drawingTool = 'rectangle'; // 'line' or 'rectangle'
let rooms = []; // Current floor's rooms
let selectedRoomId = null;
let gridSize = 20; // Grid spacing in pixels (matches blueprint-js style)
let snapToGrid = true;

// Drawing state
let isDrawing = false;
// Line drawing state
let linePoints = []; // Array of points for line/polygon drawing
let tempPolyline = null; // Temporary polyline for preview
let tempPolygon = null; // Temporary polygon fill
let lineStartPoint = null; // First point for closing polygon
let modalUpdateInterval = null; // Interval for updating room sensor modal
let modalSensorListener = null; // Real-time listener for sensor data updates

// Measurement configuration
// Conversion: 1 pixel = 0.02 meters (2 cm per pixel)
// This means 20px grid = 0.4 meters = 40 cm
const pixelsPerMeter = 50; // 50 pixels = 1 meter
const metersPerPixel = 1 / pixelsPerMeter; // 0.02 meters per pixel

/**
 * Initialize floor plan editor
 */
async function initFloorPlanEditor() {
    if (window.waitForAuthCheck) {
        await window.waitForAuthCheck();
    }
    
    const userId = window.getCurrentUserUID();
    if (!userId) {
        console.error('User not authenticated');
        return;
    }

    await loadFloorPlans(userId);
    
    if (floorPlanData.floors.length === 0) {
        showCreateFloorInterface();
    } else {
        setupFloorPlanUI();
        
        // Try to load last opened floor from localStorage
        const lastFloorId = localStorage.getItem(`lastFloor_${userId}`);
        let floorIndexToLoad = 0;
        
        if (lastFloorId) {
            // Find the floor by ID
            const foundIndex = floorPlanData.floors.findIndex(f => f.id === lastFloorId);
            if (foundIndex >= 0) {
                floorIndexToLoad = foundIndex;
            }
        }
        
        loadFloorPlan(floorIndexToLoad);
    }
}

/**
 * Load all floor plans from Firebase
 */
async function loadFloorPlans(userId) {
    try {
        const db = window.firebaseDb;
        // Use subcollection: users/{userId}/floorplans
        // First get the user document reference, then access the subcollection
        const userDocRef = window.firestoreDoc(db, 'users', userId);
        const collectionRef = window.firestoreCollection(userDocRef, 'floorplans');
        
        // Get all floor plans from user's subcollection
        const querySnapshot = await window.firestoreGetDocs(collectionRef);
        
        floorPlanData.floors = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            floorPlanData.floors.push({
                id: doc.id,
                ...data
            });
        });
        
        // Sort manually by createdAt (ascending - oldest first)
        floorPlanData.floors.sort((a, b) => {
            let aTime = 0;
            let bTime = 0;
            
            if (a.createdAt) {
                aTime = a.createdAt.toMillis ? a.createdAt.toMillis() : (a.createdAt.seconds ? a.createdAt.seconds * 1000 : 0);
            }
            if (b.createdAt) {
                bTime = b.createdAt.toMillis ? b.createdAt.toMillis() : (b.createdAt.seconds ? b.createdAt.seconds * 1000 : 0);
            }
            
            return aTime - bTime; // Ascending order (oldest first)
        });
        
        return floorPlanData.floors;
    } catch (error) {
        console.error('Error loading floor plans:', error);
        return [];
    }
}

/**
 * Save device assignments to Firebase Realtime Database
 * Stores room name in devices/{deviceId}/assigned for each room that has a deviceId
 */
async function saveDeviceAssignmentsToRealtimeDatabase(rooms) {
    try {
        // Check if Firebase Realtime Database is available
        if (!window.rtdb || !window.rtdbRef || !window.rtdbUpdate) {
            console.warn('[DEVICE ASSIGNMENT] Firebase Realtime Database not available');
            return;
        }

        // Loop through all rooms and save assignments
        for (const room of rooms) {
            if (room.deviceId && room.name) {
                try {
                    // Create reference to device in Realtime Database
                    const deviceRef = window.rtdbRef(window.rtdb, `devices/${room.deviceId}`);
                    
                    // Update only the 'assigned' field without affecting other device data
                    await window.rtdbUpdate(deviceRef, {
                        assigned: room.name
                    });
                    
                    console.log(`[DEVICE ASSIGNMENT] Saved assignment: ${room.deviceId} -> ${room.name}`);
                } catch (error) {
                    console.error(`[DEVICE ASSIGNMENT] Error saving assignment for device ${room.deviceId}:`, error);
                    // Continue with other devices even if one fails
                }
            }
        }
    } catch (error) {
        console.error('[DEVICE ASSIGNMENT] Error saving device assignments to Realtime Database:', error);
        // Don't throw - allow floor plan save to succeed even if assignment save fails
    }
}

/**
 * Save floor plan to Firebase
 */
async function saveFloorPlanToFirebase(floorData) {
    try {
        const userId = window.getCurrentUserUID();
        if (!userId) throw new Error('User not authenticated');

        const db = window.firebaseDb;
        
        // Use subcollection: users/{userId}/floorplans/{floorPlanId}
        // First get the user document reference, then access the subcollection document
        const userDocRef = window.firestoreDoc(db, 'users', userId);
        const floorPlanRef = window.firestoreDoc(userDocRef, 'floorplans', floorData.id);
        const docSnap = await window.firestoreGetDoc(floorPlanRef);
        
        const saveData = {
            name: floorData.name,
            rooms: rooms || [],
            updatedAt: window.firestoreServerTimestamp()
        };
        
        if (docSnap.exists()) {
            // Document exists, update it
            // Preserve createdAt
            const existingData = docSnap.data();
            if (existingData.createdAt) {
                saveData.createdAt = existingData.createdAt;
            }
            await window.firestoreUpdateDoc(floorPlanRef, saveData);
        } else {
            // Document doesn't exist, create it
            saveData.createdAt = window.firestoreServerTimestamp();
            await window.firestoreSetDoc(floorPlanRef, saveData);
        }
        
        return true;
    } catch (error) {
        console.error('Error saving floor plan:', error);
        throw error;
    }
}

/**
 * Create a new floor plan
 */
async function createNewFloor(floorName) {
    try {
        const userId = window.getCurrentUserUID();
        if (!userId) throw new Error('User not authenticated');

        const db = window.firebaseDb;
        // Use subcollection: users/{userId}/floorplans
        // First get the user document reference, then access the subcollection
        const userDocRef = window.firestoreDoc(db, 'users', userId);
        const collectionRef = window.firestoreCollection(userDocRef, 'floorplans');
        
        const newFloorData = {
            name: floorName,
            rooms: [],
            createdAt: window.firestoreServerTimestamp(),
            updatedAt: window.firestoreServerTimestamp()
        };
        
        const docRef = await window.firestoreAddDoc(collectionRef, newFloorData);
        
        floorPlanData.floors.push({
            id: docRef.id,
            ...newFloorData
        });
        
        const floorIndex = floorPlanData.floors.length - 1;
        
        // Save last opened floor to localStorage when creating new floor
        localStorage.setItem(`lastFloor_${userId}`, docRef.id);
        
        loadFloorPlan(floorIndex);
        updateFloorSelector();
        
        return docRef.id;
    } catch (error) {
        console.error('Error creating floor plan:', error);
        throw error;
    }
}

/**
 * Setup floor plan UI with enhanced grid and drawing
 */
function setupFloorPlanUI() {
    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (!floorPlanContainer) return;

    floorPlanContainer.innerHTML = '';

    // Create SVG canvas with viewBox (like blueprint-js)
    const defaultWidth = 1200;
    const defaultHeight = 800;
    const isMobile = window.innerWidth <= 768;
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'floorPlanCanvas';
    
    // For mobile: use specific viewBox to make grid plate full in container
    // ViewBox "360 240 480 320" shows a zoomed-in center area for better mobile experience
    if (isMobile) {
        // Use specific viewBox as requested: 360 240 480 320
        // This shows area from (360, 240) with width 480 and height 320
        svg.setAttribute('viewBox', '360 240 480 320');
        // Center alignment for mobile
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    } else {
        svg.setAttribute('viewBox', `0 0 ${defaultWidth} ${defaultHeight}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    svg.style.width = '100%';
    svg.style.height = '100%';
    // Mobile: full height, Desktop: fixed height
    if (isMobile) {
        svg.style.minHeight = '100%';
        svg.style.maxHeight = '100%';
        svg.style.border = 'none';
        svg.style.borderRadius = '0';
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
    } else {
        svg.style.minHeight = '700px';
        svg.style.maxHeight = '800px';
        svg.style.border = '1px solid #ccc';
        svg.style.borderRadius = '8px';
        svg.style.position = 'relative';
    }
    svg.style.backgroundColor = '#ffffff';
    svg.style.overflow = 'hidden'; // Clip content to viewBox
    svg.style.display = 'block';
    
    // Create grid system like blueprint-js (drawing lines directly, not pattern)
    // Grid spacing: responsive based on screen size
    // Mobile: smaller spacing (10px) to show many more grid lines in zoomed viewBox
    // Desktop: spacing (20px) for precision
    // Note: With viewBox zoom (600x400), smaller spacing = more grid lines visible
    const gridSpacing = isMobile ? 10 : 20; // Mobile: 10px for dense grid, Desktop: 20px
    
    // Update global gridSize for snap-to-grid functionality
    gridSize = gridSpacing;
    
    // Colors matching blueprint-js exactly
    const normalColor = '#E0E0E0';  // blueprint-js: 0xE0E0E0
    const highlightColor = '#D0D0D0'; // blueprint-js: 0xD0D0D0
    
    // Create defs for clipPath to clip grid to viewBox
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', 'canvasClip');
    const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    clipRect.setAttribute('x', '0');
    clipRect.setAttribute('y', '0');
    clipRect.setAttribute('width', defaultWidth);
    clipRect.setAttribute('height', defaultHeight);
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    svg.appendChild(defs);
    
    // Create background rectangle (white)
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', defaultWidth);
    bgRect.setAttribute('height', defaultHeight);
    bgRect.setAttribute('fill', '#FFFFFF');
    bgRect.setAttribute('style', 'pointer-events: none;');
    svg.appendChild(bgRect);
    
    // Create grid group with clipPath to prevent overflow
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridGroup.id = 'gridGroup';
    gridGroup.setAttribute('style', 'pointer-events: none;');
    gridGroup.setAttribute('clip-path', 'url(#canvasClip)');
    
    // Get current viewBox to draw grid that covers visible area + some padding
    let viewBoxX = 0, viewBoxY = 0, viewBoxWidth = defaultWidth, viewBoxHeight = defaultHeight;
    // Draw grid lines covering the entire canvas (for pan/zoom support)
    // Grid should match the exact size from user request:
    // Horizontal: from -60 to 1260 (1320px total)
    // Vertical: from -200 to 1000 (1200px total)
    // Grid spacing: 20px for desktop, 40px for mobile
    const minX = -60;
    const maxX = 1260;
    const minY = -200;
    const maxY = 1000;
    
    // Draw horizontal lines with proper alignment and consistent spacing
    let lineCount = 0;
    for (let y = minY; y <= maxY; y += gridSpacing) {
        // Check if this is a highlight line (every 5th line, starting from 0)
        const isHighlight = (lineCount % 5 === 0);
        const strokeWidth = isHighlight ? '1.5' : '0.8';
        const strokeColor = isHighlight ? highlightColor : normalColor;
        
        const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hLine.setAttribute('x1', minX);
        hLine.setAttribute('y1', y);
        hLine.setAttribute('x2', maxX);
        hLine.setAttribute('y2', y);
        hLine.setAttribute('stroke', strokeColor);
        hLine.setAttribute('stroke-width', strokeWidth);
        hLine.setAttribute('vector-effect', 'non-scaling-stroke');
        gridGroup.appendChild(hLine);
        lineCount++;
    }
    
    // Draw vertical lines with proper alignment and consistent spacing
    lineCount = 0;
    for (let x = minX; x <= maxX; x += gridSpacing) {
        // Check if this is a highlight line (every 5th line, starting from 0)
        const isHighlight = (lineCount % 5 === 0);
        const strokeWidth = isHighlight ? '1.5' : '0.8';
        const strokeColor = isHighlight ? highlightColor : normalColor;
        
        const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vLine.setAttribute('x1', x);
        vLine.setAttribute('y1', minY);
        vLine.setAttribute('x2', x);
        vLine.setAttribute('y2', maxY);
        vLine.setAttribute('stroke', strokeColor);
        vLine.setAttribute('stroke-width', strokeWidth);
        vLine.setAttribute('vector-effect', 'non-scaling-stroke');
        gridGroup.appendChild(vLine);
        lineCount++;
    }
    
    // Check if this is dashboard or editor mode (dashboard has Edit button)
    const isDashboard = document.getElementById('editFloorBtn');
    
    // Only add grid in editor mode, not in dashboard
    if (!isDashboard) {
        // This is editor page, show grid
        svg.appendChild(gridGroup);
    }
    
    // Create layers for rooms
    const roomsLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    roomsLayer.id = 'roomsLayer';
    svg.appendChild(roomsLayer);
    
    // Create dimension layer for measurements (like blueprint-js)
    const dimensionLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    dimensionLayer.id = 'dimensionLayer';
    svg.appendChild(dimensionLayer);
    
    floorPlanContainer.appendChild(svg);
    
    // Only setup drawing mode in editor (not in dashboard)
    if (!isDashboard) {
        // This is editor page, setup drawing mode
        setupRoomDrawing(svg);
    }
}

/**
 * Get SVG coordinates from mouse event (handles viewBox scaling)
 */
function getSVGCoordinates(svg, e) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    return { x, y };
}

/**
 * Snap coordinate to grid
 */
function snapToGridCoordinate(value) {
    if (!snapToGrid) return value;
    // Use gridSize (20px) for snapping
    return Math.round(value / gridSize) * gridSize;
}

/**
 * Convert pixels to meters
 * @param {number} pixels - Pixel value to convert
 * @returns {number} - Value in meters
 */
function pixelsToMeters(pixels) {
    return pixels * metersPerPixel;
}

/**
 * Format measurement value for display
 * @param {number} meters - Value in meters
 * @returns {string} - Formatted string (e.g., "2.5 m" or "250 cm")
 */
function formatMeasurement(meters) {
    // If less than 1 meter, show in cm
    if (meters < 1) {
        const cm = Math.round(meters * 100 * 10) / 10; // Round to 1 decimal
        return `${cm} cm`;
    }
    // Otherwise show in meters with 2 decimals
    const m = Math.round(meters * 100) / 100;
    return `${m} m`;
}

/**
 * Update or create measurement text for room drawing
 * @param {SVGElement} svg - SVG element
 * @param {number} x - Rectangle x
 * @param {number} y - Rectangle y
 * @param {number} width - Rectangle width
 * @param {number} height - Rectangle height
 */
function updateRoomMeasurement(svg, x, y, width, height) {
    let dimensionGroup = svg.querySelector('#roomDimensionGroup');
    
    if (!dimensionGroup) {
        const dimensionLayer = svg.querySelector('#dimensionLayer');
        if (!dimensionLayer) return;
        
        dimensionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        dimensionGroup.id = 'roomDimensionGroup';
        dimensionLayer.appendChild(dimensionGroup);
    }
    
    // Calculate measurements
    const widthMeters = pixelsToMeters(width);
    const heightMeters = pixelsToMeters(height);
    const measurementText = `${formatMeasurement(widthMeters)} × ${formatMeasurement(heightMeters)}`;
    
    // Center of rectangle for text placement
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    // Remove existing text if any
    const existingText = dimensionGroup.querySelector('#roomMeasurementText');
    const existingBg = dimensionGroup.querySelector('#roomMeasurementBg');
    if (existingText) {
        dimensionGroup.removeChild(existingText);
    }
    if (existingBg) {
        dimensionGroup.removeChild(existingBg);
    }
    
    // Create text element
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.id = 'roomMeasurementText';
    text.setAttribute('x', centerX);
    text.setAttribute('y', centerY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', '#3EDEDE'); // Cyan color like blueprint-js
    text.setAttribute('font-size', '14');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.style.pointerEvents = 'none';
    text.textContent = measurementText;
    
    // Add text first to calculate bbox
    dimensionGroup.appendChild(text);
    
    // Calculate bbox after text is in DOM
    const bbox = text.getBBox();
    
    // Add background rectangle for better visibility
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.id = 'roomMeasurementBg';
    bgRect.setAttribute('x', bbox.x - 6);
    bgRect.setAttribute('y', bbox.y - 3);
    bgRect.setAttribute('width', bbox.width + 12);
    bgRect.setAttribute('height', bbox.height + 6);
    bgRect.setAttribute('fill', 'rgba(255, 255, 255, 0.9)');
    bgRect.setAttribute('stroke', '#3EDEDE');
    bgRect.setAttribute('stroke-width', '1');
    bgRect.setAttribute('rx', '4');
    bgRect.setAttribute('ry', '4');
    bgRect.style.pointerEvents = 'none';
    
    // Insert background before text so it appears behind
    dimensionGroup.insertBefore(bgRect, text);
}

/**
 * Remove room measurement display
 * @param {SVGElement} svg - SVG element
 */
function removeRoomMeasurement(svg) {
    const dimensionGroup = svg.querySelector('#roomDimensionGroup');
    if (dimensionGroup) {
        dimensionGroup.remove();
    }
}

/**
 * Calculate distance between two points
 * @param {number} x1 - X coordinate of first point
 * @param {number} y1 - Y coordinate of first point
 * @param {number} x2 - X coordinate of second point
 * @param {number} y2 - Y coordinate of second point
 * @returns {number} - Distance in pixels
 */
function calculateDistance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if point is close to another point (for closing polygon)
 * @param {number} x1 - X coordinate of first point
 * @param {number} y1 - Y coordinate of first point
 * @param {number} x2 - X coordinate of second point
 * @param {number} y2 - Y coordinate of second point
 * @param {number} threshold - Distance threshold in pixels (default: 15)
 * @returns {boolean} - True if points are close enough
 */
function isPointClose(x1, y1, x2, y2, threshold = 15) {
    return calculateDistance(x1, y1, x2, y2) < threshold;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param {number} x - X coordinate of point to test
 * @param {number} y - Y coordinate of point to test
 * @param {Array} points - Array of {x, y} points defining the polygon
 * @returns {boolean} - True if point is inside polygon
 */
function isPointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;
        
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Calculate the area-weighted centroid (true geometric center) of a polygon
 * This uses the formula: Cx = (1/6A) * Σ(xi + xi+1)(xi*yi+1 - xi+1*yi)
 *                       Cy = (1/6A) * Σ(yi + yi+1)(xi*yi+1 - xi+1*yi)
 * Where A is the signed area of the polygon
 * @param {Array} points - Array of {x, y} points defining the polygon
 * @returns {{x: number, y: number}} - Centroid coordinates
 */
function calculatePolygonCentroid(points) {
    if (!points || points.length < 3) {
        // Not enough points, return average
        if (points && points.length > 0) {
            let sumX = 0, sumY = 0;
            points.forEach(p => {
                sumX += p.x;
                sumY += p.y;
            });
            return { x: sumX / points.length, y: sumY / points.length };
        }
        return { x: 0, y: 0 };
    }
    
    // Close the polygon if not already closed
    const closedPoints = [...points];
    if (closedPoints[0].x !== closedPoints[closedPoints.length - 1].x || 
        closedPoints[0].y !== closedPoints[closedPoints.length - 1].y) {
        closedPoints.push(closedPoints[0]);
    }
    
    let area = 0;
    let centroidX = 0;
    let centroidY = 0;
    
    // Calculate area-weighted centroid using shoelace formula
    for (let i = 0; i < closedPoints.length - 1; i++) {
        const p1 = closedPoints[i];
        const p2 = closedPoints[i + 1];
        
        const cross = p1.x * p2.y - p2.x * p1.y;
        area += cross;
        centroidX += (p1.x + p2.x) * cross;
        centroidY += (p1.y + p2.y) * cross;
    }
    
    area = area / 2; // Signed area
    
    if (Math.abs(area) < 0.001) {
        // Area too small, fallback to simple average
        let sumX = 0, sumY = 0;
        points.forEach(p => {
            sumX += p.x;
            sumY += p.y;
        });
        return { x: sumX / points.length, y: sumY / points.length };
    }
    
    // Calculate centroid coordinates
    centroidX = centroidX / (6 * area);
    centroidY = centroidY / (6 * area);
    
    // Check if the calculated centroid is inside the polygon
    // If not, try to find a point inside by moving towards the interior
    if (!isPointInPolygon(centroidX, centroidY, points)) {
        // Calculate bounding box
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        // Try to find a point inside by sampling points between centroid and bbox center
        const bboxCenterX = (minX + maxX) / 2;
        const bboxCenterY = (minY + maxY) / 2;
        
        // Sample multiple points along the line from bbox center towards centroid
        for (let t = 0; t <= 1; t += 0.1) {
            const testX = bboxCenterX + (centroidX - bboxCenterX) * t;
            const testY = bboxCenterY + (centroidY - bboxCenterY) * t;
            
            if (isPointInPolygon(testX, testY, points)) {
                return { x: testX, y: testY };
            }
        }
        
        // If still not found, use bbox center if it's inside
        if (isPointInPolygon(bboxCenterX, bboxCenterY, points)) {
            return { x: bboxCenterX, y: bboxCenterY };
        }
        
        // Last resort: find any point inside by checking midpoints
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            if (isPointInPolygon(midX, midY, points)) {
                return { x: midX, y: midY };
            }
        }
    }
    
    return { x: centroidX, y: centroidY };
}

/**
 * Setup room drawing mode
 */
function setupRoomDrawing(svg) {
    let tempRect = null;
    let roomStartPoint = null;

    // Handle keyboard events for canceling drawing (ESC key)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDrawingMode) {
            if (drawingTool === 'line' && linePoints.length > 0) {
                // Cancel line drawing
                resetLineDrawing();
                showToast('Line drawing cancelled', 'info');
            }
        }
    });

    svg.addEventListener('mousedown', (e) => {
        if (!isDrawingMode) return;
        
        e.preventDefault();
        let { x, y } = getSVGCoordinates(svg, e);
        
        // Snap to grid
        x = snapToGridCoordinate(x);
        y = snapToGridCoordinate(y);
        
        if (drawingTool === 'rectangle') {
            // Rectangle drawing mode
            if (!roomStartPoint) {
                roomStartPoint = { x, y };
                tempRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                tempRect.setAttribute('x', x);
                tempRect.setAttribute('y', y);
                tempRect.setAttribute('width', '0');
                tempRect.setAttribute('height', '0');
                tempRect.setAttribute('fill', '#e0e0e0');
                tempRect.setAttribute('stroke', '#999');
                tempRect.setAttribute('stroke-width', '2');
                tempRect.setAttribute('opacity', '0.7');
                const roomsLayer = svg.querySelector('#roomsLayer');
                if (roomsLayer) roomsLayer.appendChild(tempRect);
            }
        } else if (drawingTool === 'line') {
            // Line/Polygon drawing mode
            if (linePoints.length === 0) {
                // Start new polygon
                linePoints = [{ x, y }];
                lineStartPoint = { x, y };
                
                // Create temp polyline and polygon
                const roomsLayer = svg.querySelector('#roomsLayer');
                if (roomsLayer) {
                    tempPolyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                    tempPolyline.setAttribute('points', `${x},${y}`);
                    tempPolyline.setAttribute('fill', 'none');
                    tempPolyline.setAttribute('stroke', '#999');
                    tempPolyline.setAttribute('stroke-width', '2');
                    tempPolyline.setAttribute('opacity', '0.7');
                    roomsLayer.appendChild(tempPolyline);
                    
                    tempPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    tempPolygon.setAttribute('points', `${x},${y}`);
                    tempPolygon.setAttribute('fill', '#e0e0e0');
                    tempPolygon.setAttribute('stroke', 'none');
                    tempPolygon.setAttribute('opacity', '0.5');
                    roomsLayer.appendChild(tempPolygon);
                }
            } else {
                // Check if clicking near first point to close polygon
                if (isPointClose(x, y, lineStartPoint.x, lineStartPoint.y)) {
                    // Close polygon and create room
                    completeLineRoom(svg);
                } else {
                    // Add new point
                    const newPoint = { x, y };
                    // Check if point is too close to previous point (prevent duplicate points)
                    if (linePoints.length > 0) {
                        const lastPoint = linePoints[linePoints.length - 1];
                        if (calculateDistance(lastPoint.x, lastPoint.y, x, y) < 15) {
                            // Point too close, ignore (don't show toast to avoid spam)
                            return;
                        }
                    }
                    linePoints.push(newPoint);
                    updateTempPolyline(svg);
                }
            }
        }
    });

    svg.addEventListener('mousemove', (e) => {
        if (!isDrawingMode) return;
        
        let { x, y } = getSVGCoordinates(svg, e);
        
        // Snap to grid
        x = snapToGridCoordinate(x);
        y = snapToGridCoordinate(y);
        
        if (drawingTool === 'rectangle' && roomStartPoint && tempRect) {
            const width = Math.abs(x - roomStartPoint.x);
            const height = Math.abs(y - roomStartPoint.y);
            const rectX = Math.min(roomStartPoint.x, x);
            const rectY = Math.min(roomStartPoint.y, y);
            
            tempRect.setAttribute('x', rectX);
            tempRect.setAttribute('y', rectY);
            tempRect.setAttribute('width', width);
            tempRect.setAttribute('height', height);
            // Update measurement display while drawing room
            updateRoomMeasurement(svg, rectX, rectY, width, height);
        } else if (drawingTool === 'line' && linePoints.length > 0) {
            // Update preview line and polygon
            updateTempPolyline(svg, x, y);
            // Show measurements for all line segments (including the one being drawn)
            updateAllLineSegmentMeasurements(svg, x, y);
        }
    });

    svg.addEventListener('mouseup', (e) => {
        if (!isDrawingMode) return;
        
        // Rectangle mode - handled in mouseup
        if (drawingTool === 'rectangle' && roomStartPoint && tempRect) {
            let { x, y } = getSVGCoordinates(svg, e);
            
            x = snapToGridCoordinate(x);
            y = snapToGridCoordinate(y);
            
            const width = Math.abs(x - roomStartPoint.x);
            const height = Math.abs(y - roomStartPoint.y);
            
            if (width > 20 && height > 20) {
                const roomId = 'room_' + Date.now();
                const newRoom = {
                    id: roomId,
                    x: Math.min(roomStartPoint.x, x),
                    y: Math.min(roomStartPoint.y, y),
                    width: width,
                    height: height,
                    name: 'New Room',
                    status: 'good',
                    sensorData: null,
                    deviceId: null
                };
                
                rooms.push(newRoom);
                
                // Remove temp rect
                if (tempRect && tempRect.parentNode) {
                    tempRect.parentNode.removeChild(tempRect);
                }
                
                // Remove measurement display after room is completed
                removeRoomMeasurement(svg);
                
                // Render the room properly
                renderRoom(newRoom, svg);
                
                // Show room name input modal
                showRoomNameInputModal(newRoom, roomId, svg);
            } else {
                // Remove temp rect if too small
                if (tempRect && tempRect.parentNode) {
                    tempRect.parentNode.removeChild(tempRect);
                }
                // Remove measurement display if room was too small
                removeRoomMeasurement(svg);
            }
            
            tempRect = null;
            roomStartPoint = null;
        }
        // Line mode - handled in mousedown (no action needed in mouseup)
    });
}

/**
 * Update temporary polyline for line drawing preview
 */
function updateTempPolyline(svg, currentX = null, currentY = null) {
    if (linePoints.length === 0) return;
    
    let pointsStr = linePoints.map(p => `${p.x},${p.y}`).join(' ');
    if (currentX !== null && currentY !== null) {
        pointsStr += ` ${currentX},${currentY}`;
        
        // If close to start point, add start point again to close preview
        if (isPointClose(currentX, currentY, lineStartPoint.x, lineStartPoint.y)) {
            pointsStr += ` ${lineStartPoint.x},${lineStartPoint.y}`;
        }
    }
    
    if (tempPolyline) {
        tempPolyline.setAttribute('points', pointsStr);
    }
    
    if (tempPolygon && linePoints.length >= 2) {
        // Update polygon fill preview
        let polygonPoints = [...linePoints];
        if (currentX !== null && currentY !== null) {
            polygonPoints.push({ x: currentX, y: currentY });
        }
        const polygonPointsStr = polygonPoints.map(p => `${p.x},${p.y}`).join(' ');
        tempPolygon.setAttribute('points', polygonPointsStr);
    }
}

/**
 * Update measurements for all line segments (including the one being drawn)
 */
function updateAllLineSegmentMeasurements(svg, currentX, currentY) {
    let dimensionGroup = svg.querySelector('#lineSegmentDimensionGroup');
    
    if (!dimensionGroup) {
        const dimensionLayer = svg.querySelector('#dimensionLayer');
        if (!dimensionLayer) return;
        
        dimensionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        dimensionGroup.id = 'lineSegmentDimensionGroup';
        dimensionLayer.appendChild(dimensionGroup);
    }
    
    // Clear existing measurements
    dimensionGroup.innerHTML = '';
    
    if (linePoints.length === 0) return;
    
    // Draw measurements for all completed segments
    for (let i = 0; i < linePoints.length - 1; i++) {
        const p1 = linePoints[i];
        const p2 = linePoints[i + 1];
        drawSegmentMeasurement(dimensionGroup, p1.x, p1.y, p2.x, p2.y, '#3EDEDE');
    }
    
    // Draw measurement for the current segment being drawn (if mouse is moving)
    if (currentX !== null && currentY !== null && linePoints.length > 0) {
        const lastPoint = linePoints[linePoints.length - 1];
        drawSegmentMeasurement(dimensionGroup, lastPoint.x, lastPoint.y, currentX, currentY, '#00B8D4');
    }
}

/**
 * Draw measurement for a single line segment
 */
function drawSegmentMeasurement(parentGroup, x1, y1, x2, y2, color) {
    const distancePixels = calculateDistance(x1, y1, x2, y2);
    if (distancePixels < 10) return; // Don't show measurement for very short segments
    
    const distanceMeters = pixelsToMeters(distancePixels);
    const measurementText = formatMeasurement(distanceMeters);
    
    // Calculate midpoint for text placement
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    // Calculate angle of line
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const angleDegrees = (angle * 180) / Math.PI;
    
    // Offset text perpendicular to line (25px offset to avoid overlapping with line)
    const offset = 25;
    const perpAngle = angle + Math.PI / 2;
    const textX = midX + Math.cos(perpAngle) * offset;
    const textY = midY + Math.sin(perpAngle) * offset;
    
    // Create a group for this measurement
    const segmentGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    segmentGroup.setAttribute('transform', `rotate(${angleDegrees} ${textX} ${textY})`);
    
    // Estimate text dimensions (approximate: each character ~7px, height ~15px)
    const textWidth = measurementText.length * 7 + 8;
    const textHeight = 15;
    
    // Add background rectangle with better styling (like blueprint-js-master)
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', textX - textWidth / 2);
    bgRect.setAttribute('y', textY - textHeight / 2);
    bgRect.setAttribute('width', textWidth);
    bgRect.setAttribute('height', textHeight);
    bgRect.setAttribute('fill', 'rgba(255, 255, 255, 0.95)');
    bgRect.setAttribute('stroke', color);
    bgRect.setAttribute('stroke-width', '1.5');
    bgRect.setAttribute('rx', '4');
    bgRect.setAttribute('ry', '4');
    bgRect.style.pointerEvents = 'none';
    
    // Create text element
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', textX);
    text.setAttribute('y', textY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', color);
    text.setAttribute('font-size', '13');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.style.pointerEvents = 'none';
    text.textContent = measurementText;
    
    segmentGroup.appendChild(bgRect);
    segmentGroup.appendChild(text);
    parentGroup.appendChild(segmentGroup);
}

/**
 * Complete line room (close polygon and create room)
 */
function completeLineRoom(svg) {
    if (linePoints.length < 3) {
        // Need at least 3 points to form a polygon
        showToast('Need at least 3 points to create a room', 'warning');
        return;
    }
    
    // Close the polygon by adding first point at the end
    const closedPoints = [...linePoints, linePoints[0]];
    
    // Calculate bounding box for room
    const xs = linePoints.map(p => p.x);
    const ys = linePoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const roomId = 'room_' + Date.now();
    const newRoom = {
        id: roomId,
        points: linePoints.map(p => ({ x: p.x, y: p.y })),
        bbox: {
            minX, maxX, minY, maxY,
            centerX, centerY,
            width: maxX - minX,
            height: maxY - minY
        },
        name: 'New Room',
        status: 'good',
        sensorData: null,
        deviceId: null
    };
    
    rooms.push(newRoom);
    
    // Remove temp elements
    if (tempPolyline && tempPolyline.parentNode) {
        tempPolyline.parentNode.removeChild(tempPolyline);
    }
    if (tempPolygon && tempPolygon.parentNode) {
        tempPolygon.parentNode.removeChild(tempPolygon);
    }
    
    // Remove measurements
    removeLineSegmentMeasurement(svg);
    
    // Reset line drawing state
    linePoints = [];
    lineStartPoint = null;
    tempPolyline = null;
    tempPolygon = null;
    
    // Render the room properly
    renderRoom(newRoom, svg);
    
    // Show room name input modal
    showRoomNameInputModal(newRoom, roomId, svg);
}

/**
 * Remove line segment measurement display
 */
function removeLineSegmentMeasurement(svg) {
    const dimensionGroup = svg.querySelector('#lineSegmentDimensionGroup');
    if (dimensionGroup) {
        dimensionGroup.remove();
    }
}

/**
 * Render a room
 */
function renderRoom(room, svg) {
    const roomsLayer = svg.querySelector('#roomsLayer');
    if (!roomsLayer) return;

    const existingRoom = roomsLayer.querySelector(`[data-room-id="${room.id}"]`);
    if (existingRoom) {
        roomsLayer.removeChild(existingRoom);
    }

    const roomGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    roomGroup.setAttribute('data-room-id', room.id);
    roomGroup.style.cursor = 'pointer';

    // Check if this is dashboard or editor mode
    const isDashboard = document.getElementById('editFloorBtn');
    
    // In editor mode, use neutral color (not status-based)
    // In dashboard mode, use status-based colors
    let fillColor = '#E3F2FD'; // Light blue for editor (default)
    let opacity = 0.6; // Default opacity
    
    if (isDashboard) {
        // Always update status before rendering to ensure latest data
        updateRoomStatus(room);
        
        // Ensure status is set (default to 'unassigned' if not set - shows gray)
        if (!room.status) {
            room.status = 'unassigned';
        }
        
        // Dashboard mode: use status-based colors
        // Status: 'good' = green, 'warning' = yellow, 'danger' = red, 'unassigned' = gray
        if (room.status === 'danger') {
            fillColor = '#f44336'; // Danger (red) - more visible
            opacity = 0.8; // Higher opacity for danger to make it stand out
        } else if (room.status === 'warning') {
            fillColor = '#ffc107'; // Warning (yellow)
            opacity = 0.7; // Medium-high opacity for warning
        } else if (room.status === 'unassigned') {
            fillColor = '#9e9e9e'; // Unassigned (gray) - room not connected to Firebase
            opacity = 0.5; // Lower opacity for unassigned rooms
        } else {
            fillColor = '#4caf50'; // Good (green)
            opacity = 0.6; // Normal opacity for good status
        }
    }

    // Create room polygon or rectangle
    let roomElement;
    if (room.points && room.points.length > 0) {
        // Polygon room
        const pointsStr = room.points.map(p => `${p.x},${p.y}`).join(' ');
        roomElement = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        roomElement.setAttribute('points', pointsStr);
    } else {
        // Rectangle room
        roomElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        roomElement.setAttribute('x', room.x);
        roomElement.setAttribute('y', room.y);
        roomElement.setAttribute('width', room.width);
        roomElement.setAttribute('height', room.height);
    }
    
    roomElement.setAttribute('fill', fillColor);
    roomElement.setAttribute('stroke', '#333');
    roomElement.setAttribute('stroke-width', '2');
    roomElement.setAttribute('opacity', opacity.toString());
    roomGroup.appendChild(roomElement);

    // Add text label if room has name
    if (room.name) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        
        let centerX, centerY;
        if (room.points && room.points.length > 0) {
            // For polygon rooms, calculate centroid that is inside the polygon
            const centroid = calculatePolygonCentroid(room.points);
            centerX = centroid.x;
            centerY = centroid.y;
        } else if (room.x !== undefined && room.width !== undefined) {
            // Rectangle room
            centerX = room.x + room.width / 2;
            centerY = room.y + room.height / 2;
        } else {
            // Fallback to bbox center
            centerX = room.bbox?.centerX || 0;
            centerY = room.bbox?.centerY || 0;
        }
        
        text.setAttribute('x', centerX);
        text.setAttribute('y', centerY);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', '#000');
        text.setAttribute('font-size', '14');
        text.setAttribute('font-weight', 'bold');
        text.textContent = room.name;
        roomGroup.appendChild(text);
    }

    // Click handler - different behavior for dashboard vs editor
    roomGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (isDashboard) {
            // Dashboard mode: show sensor info (full modal, not hover)
            // Reset hover mode and show full centered modal
            window.isHoverMode = false;
            showRoomSensorInfo(room, false, null); // Pass false for click mode
        } else {
            // Editor mode: show edit dialog (only when not in drawing mode)
            if (!isDrawingMode) {
                showRoomEditDialog(room, svg);
            }
        }
    });

    // Hover handler for desktop only - show room sensor modal with fade in effect on hover
    // Temporarily enable for all devices to test - change to: isDashboard && isDesktopDevice()
    if (isDashboard) {
        let hoverTimeout = null; // Store timeout per room group

        roomGroup.addEventListener('mouseenter', (e) => {
            e.stopPropagation();
            
            // Clear any existing timeout
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
            
            // Add small delay before showing modal on hover (prevents flickering)
            hoverTimeout = setTimeout(() => {
                // Check if modal is already open (from click) - if so, don't show hover modal
                const modalCheck = document.getElementById('roomSensorModal');
                const isModalOpen = modalCheck && modalCheck.style.display === 'flex';
                const isClickMode = isModalOpen && window.isHoverMode === false;
                
                // Only show hover modal if modal is not open OR if it's already in hover mode
                if (!isModalOpen || (isModalOpen && window.isHoverMode === true)) {
                    showRoomSensorInfoOnHover(room, e);
                }
            }, 200); // 200ms delay for better UX
        });

        roomGroup.addEventListener('mouseleave', (e) => {
            e.stopPropagation();
            
            // Clear timeout if mouse left before delay
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
            
            // Hide modal only if it was opened via hover
            if (window.isHoverMode) {
                hideRoomSensorModalOnHover();
            }
        });
    }

    roomsLayer.appendChild(roomGroup);
}

/**
 * Load floor plan by index
 */
function loadFloorPlan(index) {
    if (index < 0 || index >= floorPlanData.floors.length) return;

    floorPlanData.currentFloorIndex = index;
    const floor = floorPlanData.floors[index];
    floorPlanData.currentFloorId = floor.id;
    rooms = floor.rooms || [];

    // Restore device assignments from rooms
    restoreDeviceAssignments();
    
    // Sync device sensor data to all rooms that have devices assigned
    rooms.forEach(room => {
        if (room.deviceId) {
            syncDeviceSensorDataToRoom(room);
            // If device is aeronexa-001, set up realtime data
            if (room.deviceId === 'aeronexa-001') {
                setupRealtimeDataForRoom(room);
            }
        }
    });

    // Save last opened floor to localStorage
    const userId = window.getCurrentUserUID();
    if (userId) {
        localStorage.setItem(`lastFloor_${userId}`, floor.id);
    }

    renderFloorPlan();
    updateFloorSelector();
}

/**
 * Restore device assignments from rooms
 */
function restoreDeviceAssignments() {
    if (!window.devicesData || !window.assignDeviceToRoom) {
        return;
    }
    
    rooms.forEach(room => {
        if (room.deviceId) {
            // Check if device exists
            const device = window.getDeviceById ? window.getDeviceById(room.deviceId) : null;
            if (device) {
                // Assign device to room (this will update device.assignedToRoom and assignedToRoomName)
                window.assignDeviceToRoom(room.deviceId, room.id, room.name);
            }
        }
    });
}

/**
 * Render the current floor plan
 */
function renderFloorPlan() {
    const svg = document.getElementById('floorPlanCanvas');
    if (!svg) return;

    const roomsLayer = svg.querySelector('#roomsLayer');
    
    if (roomsLayer) {
        roomsLayer.innerHTML = '';
        const isDashboard = document.getElementById('editFloorBtn');
        
        rooms.forEach(room => {
            // In dashboard mode, update status based on sensor data
            if (isDashboard) {
                updateRoomStatus(room);
            }
            renderRoom(room, svg);
        });
    }
}

/**
 * Helper function to find room in roomsData using multiple methods (same as updateRoomStatus)
 * Returns the room data object or null if not found
 */
function findRoomInRoomsData(roomName, roomId) {
    if (!window.roomsData || !Array.isArray(window.roomsData) || window.roomsData.length === 0) {
        return null;
    }
    
    let roomData = null;
    
    // Method 1: Try by name (exact match)
    if (roomName) {
        roomData = window.roomsData.find(r => r && r.name === roomName);
    }
    
    // Method 2: Try by name (case-insensitive)
    if (!roomData && roomName) {
        roomData = window.roomsData.find(r => r && r.name && r.name.toLowerCase() === roomName.toLowerCase());
    }
    
    // Method 3: Try by floor plan room index (if roomId is provided)
    if (!roomData && roomId && Array.isArray(rooms)) {
        const floorPlanIndex = rooms.findIndex(r => r && r.id === roomId);
        if (floorPlanIndex >= 0 && floorPlanIndex < window.roomsData.length) {
            roomData = window.roomsData[floorPlanIndex];
        }
    }
    
    // Method 4: Use first available room as fallback if no match found
    if (!roomData && window.roomsData.length > 0) {
        // Try to match by order - use room index modulo roomsData length
        if (roomId && Array.isArray(rooms)) {
            const roomIndex = rooms.findIndex(r => r && r.id === roomId);
            if (roomIndex >= 0) {
                const dataIndex = roomIndex % window.roomsData.length;
                roomData = window.roomsData[dataIndex];
            }
        }
        // If still no match, use first room as fallback
        if (!roomData) {
            roomData = window.roomsData[0];
        }
    }
    
    return roomData;
}

/**
 * Setup realtime data for room that uses aeronexa-001
 */
function setupRealtimeDataForRoom(room) {
    if (!room.deviceId || room.deviceId !== 'aeronexa-001') {
        return; // Only for aeronexa-001
    }
    
    // Find room data in roomsData
    let roomData = findRoomInRoomsData(room.name, room.id);
    if (!roomData) {
        // Create room data if not exists
        if (!window.roomsData) {
            window.roomsData = [];
        }
        roomData = {
            id: window.roomsData.length + 1,
            name: room.name,
            sensors: {}
        };
        window.roomsData.push(roomData);
    }
    
    // Set this room to use realtime data
    if (window.setRealtimeSensorRoom) {
        window.setRealtimeSensorRoom(roomData.id);
    }
    
    console.log(`[DEVICE] Room ${room.name} now uses realtime data from aeronexa-001`);
}

/**
 * Sync device sensor data to room in roomsData
 * This ensures room uses sensor data from the assigned device
 */
/**
 * Map device sensor data from Firebase structure to room sensors format
 */
function mapDeviceSensorDataFromFirebaseForRoom(dataSensor) {
    if (!dataSensor) {
        return null;
    }
    
    // Map Firebase data_sensor to room sensors format
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

function syncDeviceSensorDataToRoom(room) {
    if (!room.deviceId) {
        return; // No device assigned
    }
    
    // Get device data
    const device = window.getDeviceById ? window.getDeviceById(room.deviceId) : null;
    if (!device || !device.sensors) {
        // Try to load directly from Firebase if device not in window.devicesData
        if (window.rtdb && window.rtdbRef && window.rtdbGet) {
            const deviceRef = window.rtdbRef(window.rtdb, `devices/${room.deviceId}`);
            window.rtdbGet(deviceRef).then((snapshot) => {
                if (snapshot.exists()) {
                    const deviceData = snapshot.val();
                    if (deviceData.data_sensor) {
                        const sensors = mapDeviceSensorDataFromFirebaseForRoom(deviceData.data_sensor);
                        if (sensors) {
                            // Find or create room data in roomsData
                            let roomData = findRoomInRoomsData(room.name, room.id);
                            
                            if (!roomData) {
                                if (!window.roomsData) {
                                    window.roomsData = [];
                                }
                                
                                roomData = {
                                    id: window.roomsData.length + 1,
                                    name: room.name,
                                    sensors: {}
                                };
                                window.roomsData.push(roomData);
                            }
                            
                            // Copy sensor data
                            roomData.sensors = sensors;
                            window.roomsData = window.roomsData;
                        }
                    }
                }
            }).catch((error) => {
                console.warn(`[SYNC] Error loading device ${room.deviceId} from Firebase:`, error);
            });
        }
        return; // Device not found or no sensor data
    }
    
    // Find or create room data in roomsData
    let roomData = findRoomInRoomsData(room.name, room.id);
    
    if (!roomData) {
        // Create new room data entry if not exists
        if (!window.roomsData) {
            window.roomsData = [];
        }
        
        roomData = {
            id: window.roomsData.length + 1,
            name: room.name,
            sensors: {}
        };
        window.roomsData.push(roomData);
    }
    
    // Copy sensor data from device to room
    // Deep copy to avoid reference issues
    roomData.sensors = {};
    Object.keys(device.sensors).forEach(sensorKey => {
        const deviceSensor = device.sensors[sensorKey];
        roomData.sensors[sensorKey] = {
            value: deviceSensor.value,
            unit: deviceSensor.unit,
            status: deviceSensor.status
        };
    });
    
    // Export updated data
    window.roomsData = window.roomsData;
}

/**
 * Update room status based on sensor data
 * Now uses device sensor data if device is assigned
 */
function updateRoomStatus(room) {
    // If room has no deviceId assigned, set status to 'unassigned' (will show gray)
    if (!room.deviceId) {
        room.status = 'unassigned';
        return;
    }
    
    // If room has device assigned, sync device sensor data first
    if (room.deviceId) {
        syncDeviceSensorDataToRoom(room);
    }
    
    if (!window.roomsData || !Array.isArray(window.roomsData) || window.roomsData.length === 0) {
        // If no roomsData but has deviceId, set to unassigned (device not connected)
        room.status = 'unassigned';
        return;
    }
    
    // Find room data using multiple methods (same as modal update)
    let roomData = findRoomInRoomsData(room.name, room.id);
    
    if (roomData && roomData.sensors) {
        const previousStatus = room.status;
        room.status = determineRoomStatusFromApp(roomData.sensors);
        
        // Only log if status changed (to reduce console spam)
        if (previousStatus !== room.status) {
            const warningCount = Object.values(roomData.sensors).filter(s => s.status === 'warning').length;
            const criticalCount = Object.values(roomData.sensors).filter(s => s.status === 'critical').length;
            console.log(`[ROOM STATUS] Room: ${room.name}, Status: ${previousStatus} -> ${room.status}, Warnings: ${warningCount}, Critical: ${criticalCount}`);
        }
    } else {
        // If room has deviceId but no sensor data found, set to unassigned (device not connected to Firebase)
        room.status = 'unassigned';
    }
}

/**
 * Determine room status from sensor data
 */
function determineRoomStatusFromApp(sensors) {
    // Always use window.determineRoomStatus if available (from app.js)
    if (window.determineRoomStatus) {
        return window.determineRoomStatus(sensors);
    }
    
    // Fallback: count-based logic (same as app.js)
    let criticalCount = 0;
    let warningCount = 0;

    Object.values(sensors).forEach(sensor => {
        if (sensor.status === 'critical') {
            criticalCount++;
        } else if (sensor.status === 'warning') {
            warningCount++;
        }
    });

    // Determine status based on count:
    // - Red (danger): Many warnings (4+) OR any critical sensors
    // - Yellow (warning): Some warnings (1-3 sensors)
    // - Green (good): All normal
    
    if (criticalCount > 0) {
        return 'danger';
    } else if (warningCount >= 4) {
        return 'danger';
    } else if (warningCount >= 1) {
        return 'warning';
    } else {
        return 'good';
    }
}

/**
 * Refresh all room statuses and re-render the floor plan
 * This function can be called when sensor data is updated
 */
function refreshAllRoomStatuses() {
    const isDashboard = document.getElementById('editFloorBtn');
    if (!isDashboard) return; // Only in dashboard mode
    
    const svg = document.getElementById('floorPlanCanvas');
    if (!svg) return;
    
    // Update status for all rooms and re-render
    rooms.forEach(room => {
        updateRoomStatus(room);
        renderRoom(room, svg);
    });
}

// Export function to window for external access
window.refreshAllRoomStatuses = refreshAllRoomStatuses;

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/**
 * Save current floor plan
 */
async function saveCurrentFloorPlan() {
    if (floorPlanData.currentFloorIndex < 0) {
        showToast('No floor selected', 'error');
        return;
    }

    const floor = floorPlanData.floors[floorPlanData.currentFloorIndex];
    floor.rooms = rooms;

    try {
        // Save floor plan to Firestore
        await saveFloorPlanToFirebase(floor);
        
        // Save device assignments to Realtime Database
        // This stores room name in devices/{deviceId}/assigned for each room with deviceId
        await saveDeviceAssignmentsToRealtimeDatabase(rooms);
        
        showToast('Floor plan saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving floor plan:', error);
        showToast('Failed to save floor plan. Please try again.', 'error');
    }
}

/**
 * Show create floor interface
 */
function showCreateFloorInterface() {
    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (!floorPlanContainer) return;

    floorPlanContainer.innerHTML = `
        <div class="create-floor-interface">
            <div class="create-floor-content">
                <i class="fas fa-building"></i>
                <h3>No Floor Plan</h3>
                <p>Create your first floor plan to get started</p>
                <button class="btn-primary" onclick="showCreateFloorModal()">
                    <i class="fas fa-plus"></i> Create New Floor Plan
                </button>
            </div>
        </div>
    `;
}

/**
 * Show create floor modal with beautiful modal
 */
function showCreateFloorModal() {
    // Create or get modal
    let modal = document.getElementById('createFloorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'createFloorModal';
        modal.className = 'rename-floor-modal'; // Reuse same styling
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="rename-floor-modal-backdrop"></div>
        <div class="rename-floor-modal-content">
            <div class="rename-floor-modal-header">
                <h3>Create New Floor</h3>
                <button class="rename-floor-modal-close" onclick="closeCreateFloorModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="rename-floor-modal-body">
                <label for="createFloorInput">Enter floor name:</label>
                <input 
                    type="text" 
                    id="createFloorInput" 
                    class="rename-floor-input"
                    value="" 
                    placeholder="e.g., Floor 1, Floor 2, Basement"
                    autocomplete="off"
                >
                <p style="margin-top: 0.75rem; color: #666; font-size: 0.85rem;">
                    Enter a name to identify this floor plan.
                </p>
            </div>
            <div class="rename-floor-modal-footer">
                <button class="rename-floor-btn-cancel" onclick="closeCreateFloorModal()">
                    Cancel
                </button>
                <button class="rename-floor-btn-save" onclick="saveCreateFloor()">
                    <i class="fas fa-plus"></i> Create
                </button>
            </div>
        </div>
    `;
    
    // Show modal with animation
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
    
    // Focus on input (don't select text since it's empty)
    setTimeout(() => {
        const input = document.getElementById('createFloorInput');
        if (input) {
            input.focus();
        }
    }, 100);
    
    // Handle Enter key
    const input = document.getElementById('createFloorInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveCreateFloor();
            } else if (e.key === 'Escape') {
                closeCreateFloorModal();
            }
        });
    }
    
    // Close on backdrop click
    const backdrop = modal.querySelector('.rename-floor-modal-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeCreateFloorModal);
    }
}

/**
 * Save create floor
 */
function saveCreateFloor() {
    const input = document.getElementById('createFloorInput');
    if (!input) return;
    
    const floorName = input.value.trim();
    if (!floorName) {
        showToast('Floor name cannot be empty', 'error');
        return;
    }
    
    // Close modal first
    closeCreateFloorModal();
    
    // Create the floor
    createNewFloor(floorName).then(() => {
        const svg = document.getElementById('floorPlanCanvas');
        if (!svg) {
            setupFloorPlanUI();
        }
        showToast('Floor created successfully!', 'success');
    }).catch(error => {
        console.error('Error creating floor:', error);
        showToast('Failed to create floor. Please try again.', 'error');
    });
}

/**
 * Close create floor modal
 */
function closeCreateFloorModal() {
    const modal = document.getElementById('createFloorModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

/**
 * Show room name input modal (when creating new room)
 */
function showRoomNameInputModal(room, roomId, svg) {
    // Create or get modal
    let modal = document.getElementById('roomNameInputModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'roomNameInputModal';
        modal.className = 'rename-floor-modal'; // Reuse same styling
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="rename-floor-modal-backdrop"></div>
        <div class="rename-floor-modal-content">
            <div class="rename-floor-modal-header">
                <h3>New Room</h3>
                <button class="rename-floor-modal-close" onclick="closeRoomNameInputModal(true)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="rename-floor-modal-body">
                <label for="roomNameInput">Enter room name:</label>
                <input 
                    type="text" 
                    id="roomNameInput" 
                    class="rename-floor-input"
                    value="${room.name}" 
                    placeholder="Enter room name"
                    autocomplete="off"
                >
            </div>
            <div class="rename-floor-modal-footer">
                <button class="rename-floor-btn-cancel" onclick="closeRoomNameInputModal(true)">
                    Cancel
                </button>
                <button class="rename-floor-btn-save" onclick="saveRoomNameInput('${roomId}')">
                    <i class="fas fa-save"></i> Save
                </button>
            </div>
        </div>
    `;
    
    // Store room and svg reference for callback
    window.__pendingRoomData = { room, roomId, svg };
    
    // Show modal with animation
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
    
    // Focus on input and select text
    setTimeout(() => {
        const input = document.getElementById('roomNameInput');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    // Handle Enter key
    const input = document.getElementById('roomNameInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveRoomNameInput(roomId);
            } else if (e.key === 'Escape') {
                closeRoomNameInputModal(true);
            }
        });
    }
    
    // Close on backdrop click
    const backdrop = modal.querySelector('.rename-floor-modal-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => closeRoomNameInputModal(true));
    }
}

/**
 * Save room name input
 */
function saveRoomNameInput(roomId) {
    const input = document.getElementById('roomNameInput');
    if (!input) return;
    
    const newName = input.value.trim();
    if (!newName) {
        showToast('Room name cannot be empty', 'error');
        return;
    }
    
    const pendingData = window.__pendingRoomData;
    if (!pendingData || pendingData.roomId !== roomId) return;
    
    // Update room name in the actual room object (reference is to same object in rooms array)
    const roomToUpdate = pendingData.room;
    roomToUpdate.name = newName;
    
    // Get SVG reference before clearing pending data
    const svgElement = pendingData.svg;
    
    // Clear pending data BEFORE closing modal to prevent deletion
    window.__pendingRoomData = null;
    
    // Render the room with updated name - ensure it's properly rendered
    renderRoom(roomToUpdate, svgElement);
    
    // Verify room is still in rooms array
    const roomExists = rooms.find(r => r.id === roomId);
    if (!roomExists) {
        console.error('Room was removed from array unexpectedly');
        rooms.push(roomToUpdate);
        renderRoom(roomToUpdate, svgElement);
    }
    
    // Save to Firebase
    saveCurrentFloorPlan();
    
    // Close modal without deleting room
    closeRoomNameInputModal(false); // false = don't delete room
}

/**
 * Close room name input modal
 * @param {boolean} shouldDeleteRoom - If true, delete the room (for cancel). If false, keep it (for save).
 */
function closeRoomNameInputModal(shouldDeleteRoom = true) {
    const modal = document.getElementById('roomNameInputModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
    
    // Only delete room if cancelled (not when saved)
    if (shouldDeleteRoom) {
        const pendingData = window.__pendingRoomData;
        if (pendingData) {
            const roomIndex = rooms.findIndex(r => r.id === pendingData.roomId);
            if (roomIndex > -1) {
                rooms.splice(roomIndex, 1);
                renderFloorPlan();
            }
            window.__pendingRoomData = null;
        }
    }
}

/**
 * Show rename floor dialog with beautiful modal
 */
function showRenameFloorDialog() {
    if (floorPlanData.currentFloorIndex < 0) {
        showToast('No floor selected', 'error');
        return;
    }
    
    const floor = floorPlanData.floors[floorPlanData.currentFloorIndex];
    const currentName = floor.name || 'Floor 1';
    
    // Create or get modal
    let modal = document.getElementById('renameFloorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'renameFloorModal';
        modal.className = 'rename-floor-modal';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="rename-floor-modal-backdrop"></div>
        <div class="rename-floor-modal-content">
            <div class="rename-floor-modal-header">
                <h3>Rename Floor</h3>
                <button class="rename-floor-modal-close" onclick="closeRenameFloorModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="rename-floor-modal-body">
                <label for="renameFloorInput">Enter new floor name:</label>
                <input 
                    type="text" 
                    id="renameFloorInput" 
                    class="rename-floor-input"
                    value="${currentName}" 
                    placeholder="Enter floor name"
                    autocomplete="off"
                >
            </div>
            <div class="rename-floor-modal-footer">
                <button class="rename-floor-btn-cancel" onclick="closeRenameFloorModal()">
                    Cancel
                </button>
                <button class="rename-floor-btn-save" onclick="saveRenameFloor()">
                    <i class="fas fa-save"></i> Save
                </button>
            </div>
        </div>
    `;
    
    // Show modal with animation
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
    
    // Focus on input and select text
    setTimeout(() => {
        const input = document.getElementById('renameFloorInput');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    // Handle Enter key
    const input = document.getElementById('renameFloorInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveRenameFloor();
            } else if (e.key === 'Escape') {
                closeRenameFloorModal();
            }
        });
    }
    
    // Close on backdrop click
    const backdrop = modal.querySelector('.rename-floor-modal-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeRenameFloorModal);
    }
}

/**
 * Save rename floor
 */
function saveRenameFloor() {
    const input = document.getElementById('renameFloorInput');
    if (!input) return;
    
    const newName = input.value.trim();
    if (!newName) {
        showToast('Floor name cannot be empty', 'error');
        return;
    }
    
    renameFloor(floorPlanData.currentFloorIndex, newName);
    closeRenameFloorModal();
}

/**
 * Close rename floor modal
 */
function closeRenameFloorModal() {
    const modal = document.getElementById('renameFloorModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

/**
 * Rename floor
 */
async function renameFloor(floorIndex, newName) {
    if (floorIndex < 0 || floorIndex >= floorPlanData.floors.length) {
        showToast('Invalid floor selection', 'error');
        return;
    }
    
    const floor = floorPlanData.floors[floorIndex];
    floor.name = newName;
    
    try {
        await saveFloorPlanToFirebase(floor);
        updateFloorSelector();
        showToast('Floor renamed successfully', 'success');
    } catch (error) {
        console.error('Error renaming floor:', error);
        showToast('Failed to rename floor', 'error');
    }
}

/**
 * Update floor selector dropdown
 */
function updateFloorSelector() {
    const selector = document.getElementById('floorSelector');
    if (!selector) return;

    selector.innerHTML = '';
    
    floorPlanData.floors.forEach((floor, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = floor.name;
        if (index === floorPlanData.currentFloorIndex) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
    
    // Only add "Add New Floor" option in editor page, not in dashboard
    // Check if edit button exists - if not, it's dashboard page
    const editBtn = document.getElementById('editFloorBtn');
    if (!editBtn) {
        // This is editor page, add the option
        const addOption = document.createElement('option');
        addOption.value = 'add';
        addOption.textContent = '+ Add New Floor';
        selector.appendChild(addOption);
    }
}

/**
 * Handle floor selector change
 */
function onFloorSelectorChange() {
    const selector = document.getElementById('floorSelector');
    if (!selector) return;

    const value = selector.value;
    if (value === 'add') {
        showCreateFloorModal();
        selector.value = floorPlanData.currentFloorIndex;
    } else {
        const index = parseInt(value);
        if (!isNaN(index)) {
            loadFloorPlan(index);
        }
    }
}

/**
 * Toggle drawing mode
 */
function toggleDrawingMode() {
    isDrawingMode = !isDrawingMode;
    const btn = document.getElementById('toggleDrawingBtn');
    const svg = document.getElementById('floorPlanCanvas');
    
    if (btn) {
        btn.innerHTML = isDrawingMode ? '<i class="fas fa-stop"></i> Stop Drawing' : '<i class="fas fa-pencil-alt"></i> Start Drawing';
        btn.classList.toggle('active', isDrawingMode);
    }
    
    if (svg) {
        svg.style.cursor = isDrawingMode ? 'crosshair' : 'default';
    }
    
    // Reset drawing state when stopping drawing
    if (!isDrawingMode) {
        resetLineDrawing();
        // Also reset rectangle drawing state
        const roomsLayer = svg ? svg.querySelector('#roomsLayer') : null;
        if (roomsLayer) {
            const tempRect = roomsLayer.querySelector('rect[opacity="0.7"]');
            if (tempRect) {
                roomsLayer.removeChild(tempRect);
            }
        }
        removeRoomMeasurement(svg);
    }
}

/**
 * Set drawing tool
 */
function setDrawingTool(tool) {
    drawingTool = tool;
    const buttons = document.querySelectorAll('.tool-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-tool="${tool}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Reset line drawing state when switching tools
    if (tool !== 'line') {
        resetLineDrawing();
    }
}

/**
 * Reset line drawing state (clean up temp elements)
 */
function resetLineDrawing() {
    const svg = document.getElementById('floorPlanCanvas');
    if (svg) {
        // Remove temp polyline
        if (tempPolyline && tempPolyline.parentNode) {
            tempPolyline.parentNode.removeChild(tempPolyline);
        }
        // Remove temp polygon
        if (tempPolygon && tempPolygon.parentNode) {
            tempPolygon.parentNode.removeChild(tempPolygon);
        }
        // Remove line segment measurement
        removeLineSegmentMeasurement(svg);
    }
    
    linePoints = [];
    lineStartPoint = null;
    tempPolyline = null;
    tempPolygon = null;
}

/**
 * Generate dummy sensor data for rooms without sensor data
 * Creates realistic sensor readings based on sensorConfig
 */
function generateDummySensorData() {
    const sensorConfig = window.sensorConfig;
    if (!sensorConfig) {
        return null;
    }
    
    // Define unit mappings for each sensor type
    const unitMap = {
        dust: 'μg/m³',
        co2: 'ppm',
        temperature: '°C',
        humidity: '%',
        pressure: 'hPa',
        gas: 'ppm',
        smoke: 'ppm'
    };
    
    // Generate dummy data for each sensor
    const dummyData = {};
    
    // Probabilitas yang lebih condong ke normal: 80% normal, 15% warning, 5% critical
    const probabilityNormal = 0.80;
    const probabilityWarning = 0.15;
    // probabilityCritical = 0.05 (sisa)
    
    Object.keys(sensorConfig).forEach(sensorKey => {
        const config = sensorConfig[sensorKey];
        const thresholds = config.thresholds || { normal: 50, warning: 100 };
        
        // Generate random probability untuk menentukan status
        const rand = Math.random();
        let value, status;
        
        // Define realistic ranges for each sensor type
        let normalRange = { min: 0, max: thresholds.normal * 0.9 };
        let warningRange = { min: thresholds.normal * 0.9, max: thresholds.warning };
        let criticalRange = { min: thresholds.warning, max: thresholds.warning * 1.5 };
        
        // Special ranges for specific sensors to make them more realistic
        if (sensorKey === 'dust') {
            normalRange = { min: 10, max: 35 };
            warningRange = { min: 35, max: 55 };
            criticalRange = { min: 55, max: 80 };
        } else if (sensorKey === 'co2') {
            normalRange = { min: 400, max: 1000 };
            warningRange = { min: 1000, max: 1400 };
            criticalRange = { min: 1400, max: 2000 };
        } else if (sensorKey === 'temperature') {
            normalRange = { min: 20, max: 26 };
            warningRange = { min: 26, max: 29 };
            criticalRange = { min: 29, max: 35 };
        } else if (sensorKey === 'humidity') {
            normalRange = { min: 40, max: 60 };
            warningRange = { min: 60, max: 70 };
            criticalRange = { min: 70, max: 85 };
        } else if (sensorKey === 'pressure') {
            normalRange = { min: 1006, max: 1015 };
            warningRange = { min: 1000, max: 1006 };
            criticalRange = { min: 995, max: 1000 };
        } else if (sensorKey === 'gas') {
            normalRange = { min: 50, max: 200 };
            warningRange = { min: 200, max: 300 };
            criticalRange = { min: 300, max: 500 };
        } else if (sensorKey === 'smoke') {
            normalRange = { min: 0, max: 50 };
            warningRange = { min: 50, max: 80 };
            criticalRange = { min: 80, max: 150 };
        }
        
        // Determine status based on probability (80% normal, 15% warning, 5% critical)
        // Sensors that need decimal precision
        const decimalSensors = ['temperature', 'humidity', 'pressure'];
        const useDecimal = decimalSensors.includes(sensorKey);
        
        if (rand < probabilityNormal) {
            // 80% chance: Normal status
            const range = normalRange.max - normalRange.min;
            if (useDecimal) {
                value = Math.round((Math.random() * range + normalRange.min) * 10) / 10;
            } else {
                value = Math.floor(Math.random() * range) + normalRange.min;
            }
            status = 'normal';
        } else if (rand < (probabilityNormal + probabilityWarning)) {
            // 15% chance: Warning status
            const range = warningRange.max - warningRange.min;
            if (useDecimal) {
                value = Math.round((Math.random() * range + warningRange.min) * 10) / 10;
            } else {
                value = Math.floor(Math.random() * range) + warningRange.min;
            }
            status = 'warning';
        } else {
            // 5% chance: Critical status
            const range = criticalRange.max - criticalRange.min;
            if (useDecimal) {
                value = Math.round((Math.random() * range + criticalRange.min) * 10) / 10;
            } else {
                value = Math.floor(Math.random() * range) + criticalRange.min;
            }
            status = 'critical';
        }
        
        // Special handling for pressure (lower is worse)
        if (sensorKey === 'pressure') {
            if (status === 'normal') {
                value = Math.round((Math.random() * 9 + 1006) * 10) / 10; // 1006.0-1015.0 hPa (normal)
            } else if (status === 'warning') {
                value = Math.round((Math.random() * 6 + 1000) * 10) / 10; // 1000.0-1006.0 hPa (warning)
            } else {
                value = Math.round((Math.random() * 5 + 995) * 10) / 10; // 995.0-1000.0 hPa (critical)
            }
        } else {
            // Ensure value is positive and realistic
            value = Math.max(0, value);
        }
        
        dummyData[sensorKey] = {
            value: value,
            unit: unitMap[sensorKey] || '',
            status: status
        };
    });
    
    return dummyData;
}

/**
 * Show room sensor info modal (for dashboard view)
 */
/**
 * Check if device is desktop (has mouse/trackpad, not touch-only device)
 * Returns true for desktop, false for mobile/tablet
 */
function isDesktopDevice() {
    // Check if device has mouse capability (hover support)
    // Touch devices don't support hover reliably
    if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        return true;
    }
    // Fallback: check if device is not touch-only
    if ('ontouchstart' in window && window.navigator.maxTouchPoints > 0) {
        return false; // Touch device detected
    }
    // Default to true for desktop if no touch capability detected
    return true;
}

/**
 * Show room sensor modal on hover (desktop only)
 * Uses the same modal as click but with hover positioning and behavior
 */
async function showRoomSensorInfoOnHover(room, event) {
    // Check if modal is already open from click
    const existingModal = document.getElementById('roomSensorModal');
    if (existingModal && existingModal.style.display === 'flex' && !window.isHoverMode) {
        return; // Modal already open from click, don't override
    }

    // Set hover mode flag
    window.isHoverMode = true;

    // Call the existing showRoomSensorInfo function but with hover behavior
    await showRoomSensorInfo(room, true, event); // Pass true for hover mode and event for positioning
}

/**
 * Hide room sensor modal when mouse leaves (hover mode only)
 */
function hideRoomSensorModalOnHover() {
    // Only hide if it was opened via hover
    if (window.isHoverMode) {
        const modal = document.getElementById('roomSensorModal');
        if (modal && modal.style.display === 'flex') {
            // Fade out animation
            modal.style.opacity = '0';
            modal.style.transform = 'scale(0.95)';
            
            // Hide after animation
            setTimeout(() => {
                if (modal && modal.style.display === 'flex') {
                    modal.style.display = 'none';
                }
                window.isHoverMode = false;
            }, 200);
        }
    }
}

async function showRoomSensorInfo(room, isHoverMode = false, event = null) {
    selectedRoomId = room.id;
    // Store in window so app.js can access it
    window.selectedRoomIdForModal = room.id;
    window.selectedRoomNameForModal = room.name;
    window.isHoverMode = isHoverMode; // Store hover mode flag
    
    // Find room data and store its index for real-time updates
    let roomDataIndex = -1;
    if (window.roomsData && Array.isArray(window.roomsData)) {
        // Try to find by name first
        roomDataIndex = window.roomsData.findIndex(r => r && r.name === room.name);
        
        // If not found by name, use room index in floor plan array
        if (roomDataIndex === -1 && Array.isArray(rooms)) {
            const floorPlanIndex = rooms.findIndex(r => r && r.id === room.id);
            if (floorPlanIndex >= 0 && floorPlanIndex < window.roomsData.length) {
                roomDataIndex = floorPlanIndex;
            }
        }
        
        // If still not found, use first available
        if (roomDataIndex === -1 && window.roomsData.length > 0) {
            roomDataIndex = 0;
        }
    }
    
    // Store the index for real-time updates
    window.selectedRoomDataIndex = roomDataIndex;
    
    let roomData = roomDataIndex >= 0 ? window.roomsData[roomDataIndex] : null;
    
    // Create or get modal
    let modal = document.getElementById('roomSensorModal');
    const isExistingModal = !!modal;
    const isSameRoom = modal && window.selectedRoomNameForModal === room.name;
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'roomSensorModal';
        modal.className = 'room-sensor-modal';
        document.body.appendChild(modal);
    }
    
    // If modal already exists and it's the same room, just update position/style for hover
    // Don't recreate content to preserve video stream and avoid refresh
    if (isExistingModal && isSameRoom && isHoverMode && event) {
        // Just update position for hover, preserve all content including video stream
        const mouseX = event.clientX || event.pageX || window.innerWidth / 2;
        const mouseY = event.clientY || event.pageY || window.innerHeight / 2;
        
        const modalWidth = 450;
        const modalHeight = 600;
        const offset = 15;
        
        let left = mouseX + offset;
        let top = mouseY + offset;
        
        if (left + modalWidth > window.innerWidth) {
            left = mouseX - modalWidth - offset;
        }
        if (top + modalHeight > window.innerHeight) {
            top = mouseY - modalHeight - offset;
        }
        
        left = Math.max(10, Math.min(left, window.innerWidth - modalWidth - 10));
        top = Math.max(10, Math.min(top, window.innerHeight - modalHeight - 10));
        
        modal.style.cssText = `
            display: flex;
            position: fixed;
            left: ${left}px;
            top: ${top}px;
            width: ${modalWidth}px;
            max-width: 90vw;
            max-height: 90vh;
            background: transparent;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            z-index: 9999;
            justify-content: flex-start;
            align-items: flex-start;
            padding: 0;
            opacity: 1;
            transform: scale(1);
            transition: opacity 0.1s ease, transform 0.1s ease;
            pointer-events: auto;
        `;
        
        // Just update room name and device ID in header if changed (very minimal update)
        const headerTitle = modal.querySelector('.room-sensor-modal-header h3');
        if (headerTitle && headerTitle.textContent !== room.name) {
            headerTitle.textContent = room.name;
        }
        
        // Update device ID display - find span that contains "Device:"
        const deviceIdElement = Array.from(modal.querySelectorAll('.room-sensor-modal-header span')).find(
            span => span.textContent && span.textContent.includes('Device:')
        );
        if (deviceIdElement) {
            const deviceId = room.deviceId || 'Not assigned';
            const deviceIdDisplay = deviceId !== 'Not assigned' ? deviceId.toUpperCase() : 'Not assigned';
            deviceIdElement.textContent = `Device: ${deviceIdDisplay}`;
        }
        
        // Check if room uses aeronexa-001 device (only aeronexa-001 can access camera stream)
        const canAccessCameraHover = room.deviceId && room.deviceId.toLowerCase() === 'aeronexa-001';
        window.currentRoomStarredStatus = canAccessCameraHover; // Set based on device
        
        // Initialize camera stream only if room uses aeronexa-001
        if (canAccessCameraHover) {
            if (!window.cameraStreamListener) {
                // Wait a bit to ensure DOM elements are ready
                setTimeout(() => {
                    initializeCameraStreamListener();
                }, 50);
            } else {
            // Listener already exists, just ensure video stream is properly displayed
            setTimeout(() => {
                // Check current camera data and update display accordingly
                // Read from devices/aeronexa-001/camera for device-specific camera data
                if (window.rtdb && window.rtdbRef && window.rtdbGet) {
                    const cameraRef = window.rtdbRef(window.rtdb, 'devices/aeronexa-001/camera');
                    window.rtdbGet(cameraRef).then((snapshot) => {
                        // Check network error state before any action
                        const streamSection = document.getElementById('roomVideoStreamSection');
                        const isNetworkErrorState = streamSection && streamSection.dataset.networkError === 'true';
                        
                        if (snapshot.exists()) {
                            const cameraData = snapshot.val();
                            const streamIP = cameraData?.proxyUrl || cameraData?.url || cameraData?.ip;
                            const status = cameraData?.status;
                            const personCount = cameraData?.personCount !== undefined ? cameraData.personCount : 0;
                            
                            // Update person count display
                            const personCountElement = document.getElementById('personCountValue');
                            if (personCountElement) {
                                personCountElement.textContent = personCount;
                                const personCountDisplay = personCountElement.parentElement;
                                if (personCountDisplay) {
                                    const pluralText = personCountDisplay.querySelector('span:last-child');
                                    if (pluralText) {
                                        pluralText.textContent = `person${personCount !== 1 ? 's' : ''}`;
                                    }
                                }
                            }
                            
                            if (status === 'online' && streamIP) {
                                // Update camera stream for all rooms
                                // Only call if stream section element exists
                                const streamSectionCheck = document.getElementById('roomVideoStreamSection');
                                if (streamSectionCheck) {
                                    updateCameraStream(streamIP);
                                }
                            } else {
                                // Only hide if not in network error state
                                if (!isNetworkErrorState) {
                                    hideCameraStream();
                                }
                            }
                        } else {
                            // Only hide if not in network error state
                            if (!isNetworkErrorState) {
                                hideCameraStream();
                            }
                        }
                    }).catch((error) => {
                        console.error('[Camera] Error checking camera data:', error);
                    });
                }
            }, 50);
            }
        }
        
        // For hover mode with existing modal, don't update sensor data immediately
        // The sensor data will update naturally through the real-time listener or interval (if in click mode)
        // This prevents unnecessary updates that might cause flickering
        
        return; // Exit early, don't recreate modal content or trigger updates
    }
    
    // Set modal styling based on hover mode
    if (isHoverMode && event) {
        // Hover mode: position near cursor, no backdrop, smaller size
        const mouseX = event.clientX || event.pageX || window.innerWidth / 2;
        const mouseY = event.clientY || event.pageY || window.innerHeight / 2;
        
        // Calculate position near cursor
        const modalWidth = 450;
        const modalHeight = 600;
        const offset = 15;
        
        let left = mouseX + offset;
        let top = mouseY + offset;
        
        // Adjust if modal would go off screen
        if (left + modalWidth > window.innerWidth) {
            left = mouseX - modalWidth - offset;
        }
        if (top + modalHeight > window.innerHeight) {
            top = mouseY - modalHeight - offset;
        }
        
        left = Math.max(10, Math.min(left, window.innerWidth - modalWidth - 10));
        top = Math.max(10, Math.min(top, window.innerHeight - modalHeight - 10));
        
        modal.style.cssText = `
            display: flex;
            position: fixed;
            left: ${left}px;
            top: ${top}px;
            width: ${modalWidth}px;
            max-width: 90vw;
            max-height: 90vh;
            background: transparent;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            z-index: 9999;
            justify-content: flex-start;
            align-items: flex-start;
            padding: 0;
            opacity: 0;
            transform: scale(0.95);
            transition: opacity 0.2s ease, transform 0.2s ease;
            pointer-events: auto;
        `;
    } else {
        // Click mode: centered, with backdrop, full size
        modal.style.cssText = `
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 10000;
            justify-content: center;
            align-items: center;
            padding: 20px;
            opacity: 1;
            transform: scale(1);
            transition: none;
            pointer-events: auto;
        `;
    }
    
    // Get sensor data - prioritize device sensor data from Firebase Realtime Database
    let sensorData = null;
    let deviceCameraData = null;
    
    // If room has device assigned, load data directly from Firebase Realtime Database
    if (room.deviceId) {
        // Try to get device from window.devicesData first (already synced from Firebase in real-time)
        const device = window.getDeviceById ? window.getDeviceById(room.deviceId) : null;
        if (device && device.sensors) {
            // Use device sensor data from window.devicesData (this is the most up-to-date source)
            sensorData = device.sensors;
            deviceCameraData = device.camera || null;
            // Sync to roomData for consistency
            syncDeviceSensorDataToRoom(room);
            roomData = findRoomInRoomsData(room.name, room.id);
        } else if (window.rtdb && window.rtdbRef && window.rtdbGet) {
            // If device not in window.devicesData, load directly from Firebase
            try {
                const deviceRef = window.rtdbRef(window.rtdb, `devices/${room.deviceId}`);
                const deviceSnapshot = await window.rtdbGet(deviceRef);
                
                if (deviceSnapshot.exists()) {
                    const deviceData = deviceSnapshot.val();
                    
                    // Map Firebase data to sensor format
                    if (deviceData.data_sensor) {
                        sensorData = mapDeviceSensorDataFromFirebaseForRoom(deviceData.data_sensor);
                    }
                    
                    // Get camera data
                    if (deviceData.camera) {
                        deviceCameraData = deviceData.camera;
                    }
                    
                    // Sync to roomData
                    if (sensorData) {
                        syncDeviceSensorDataToRoom(room);
                        roomData = findRoomInRoomsData(room.name, room.id);
                    }
                } else {
                    console.warn(`[ROOM MODAL] Device ${room.deviceId} not found in Firebase`);
                }
            } catch (error) {
                console.warn(`[ROOM MODAL] Error loading device data from Firebase for ${room.deviceId}:`, error);
            }
        } else {
            console.warn(`[ROOM MODAL] Firebase not available and device ${room.deviceId} not in window.devicesData`);
        }
    }
    
    // If no device data from Firebase, try to get from window.devicesData
    if (!sensorData && room.deviceId && window.getDeviceById) {
        const device = window.getDeviceById(room.deviceId);
        if (device && device.sensors) {
            sensorData = device.sensors;
            deviceCameraData = device.camera || null;
        }
    }
    
    // If still no data, try to load directly from Firebase one more time
    if (!sensorData && room.deviceId && window.rtdb && window.rtdbRef && window.rtdbGet) {
        try {
            const deviceRef = window.rtdbRef(window.rtdb, `devices/${room.deviceId}`);
            const deviceSnapshot = await window.rtdbGet(deviceRef);
            
            if (deviceSnapshot.exists()) {
                const deviceData = deviceSnapshot.val();
                if (deviceData.data_sensor) {
                    sensorData = mapDeviceSensorDataFromFirebaseForRoom(deviceData.data_sensor);
                }
                if (deviceData.camera) {
                    deviceCameraData = deviceData.camera;
                }
            }
        } catch (error) {
            console.warn(`[ROOM MODAL] Error loading device data from Firebase for ${room.deviceId}:`, error);
        }
    }
    
    // If room has no deviceId assigned, sensorData should be null/empty (show "--" in UI)
    // Do NOT use dummy data from app.js for unassigned rooms
    if (!room.deviceId) {
        sensorData = null; // Explicitly set to null to show "--" in UI
    }
    
    // If room has deviceId but no data found, log warning
    if (room.deviceId && !sensorData) {
        console.warn(`[ROOM MODAL] No sensor data available for room ${room.name} with deviceId ${room.deviceId}`);
        sensorData = null; // Show "--" in UI instead of dummy data
    }
    
    const status = sensorData ? determineRoomStatusFromApp(sensorData) : room.status;
    
    // Check if room uses aeronexa-001 device (only aeronexa-001 can access camera stream)
    const canAccessCamera = room.deviceId && room.deviceId.toLowerCase() === 'aeronexa-001';
    
    // Get camera information from device data
    const cameraStatus = deviceCameraData?.status || 'offline';
    const personCount = deviceCameraData?.personCount !== undefined ? deviceCameraData.personCount : 0;
    
    // Create video stream HTML container
    // Only show camera stream if room uses aeronexa-001, otherwise show camera broken message
    let videoStreamHTML = '';
    if (canAccessCamera) {
        // Room uses aeronexa-001 - show camera stream  
        videoStreamHTML = `
            <div class="video-stream-section" id="roomVideoStreamSection" style="margin-bottom: 1.5rem; display: block;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <i class="fas fa-video" style="color: #31bf8a; font-size: 1.2rem;"></i>
                    <div style="flex: 1;">
                        <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">Live Camera Stream</div>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="font-size: 0.9rem; font-weight: 600; color: #333;">AeroNexa Camera</div>
                        </div>
                    </div>
                </div>
                <!-- Person Count Display -->
                <div id="personCountDisplay" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 8px; margin-bottom: 0.75rem; border-left: 4px solid #2196f3;">
                    <i class="fas fa-users" style="color: #2196f3; font-size: 1.2rem;"></i>
                    <div style="flex: 1;">
                        <div style="font-size: 0.75rem; color: #666; margin-bottom: 0.25rem;">Person Count</div>
                        <div style="font-size: 1.1rem; font-weight: 600; color: #1976d2;">
                            <span id="personCountValue">${personCount}</span> <span style="font-size: 0.85rem; font-weight: 400; color: #666;">person${personCount !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                </div>
                <div class="video-stream-wrapper" style="position: relative; width: 100%; height: 280px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); background: #000; display: flex; align-items: center; justify-content: center;">
                    <!-- Loading Spinner - shown by default while camera is loading or when failed -->
                    <div id="cameraLoadingSpinner" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; background: #000; border-radius: 8px; z-index: 5;">
                        <div class="camera-spinner" style="width: 60px; height: 60px; border: 4px solid rgba(49, 191, 138, 0.2); border-top-color: #31bf8a; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    </div>
                    <!-- Image stream - MJPEG streams from ESP32 work best with img tag and object-fit: cover -->
                    <!-- Use img tag with object-fit: cover to ensure stream fills container completely without black areas -->
                    <img id="roomVideoStream" src="" alt="Camera Stream" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: none; background: #000;" onerror="handleStreamError(this);">
                    <!-- Fallback iframe - for compatibility if needed -->
                    <iframe id="roomVideoStreamIframe" src="" allowfullscreen scrolling="no" frameborder="0" style="width: 100%; height: 100%; border: none; border-radius: 8px; display: none; background: #000; margin: 0; padding: 0; overflow: hidden !important;"></iframe>
                </div>
            </div>
        `;
        // Set status to true so camera stream initializes
        window.currentRoomStarredStatus = true;
    } else {
        // Room doesn't use aeronexa-001 - show same structure but with error message directly displayed
        videoStreamHTML = `
            <div class="video-stream-section" id="roomVideoStreamSection" style="margin-bottom: 1.5rem; display: block;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <i class="fas fa-video" style="color: #31bf8a; font-size: 1.2rem;"></i>
                    <div style="flex: 1;">
                        <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">Live Camera Stream</div>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="font-size: 0.9rem; font-weight: 600; color: #333;">AeroNexa Camera</div>
                        </div>
                    </div>
                </div>
                <div style="position: relative; width: 100%; height: 280px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); background: #000; display: flex; align-items: center; justify-content: center;">
                    <!-- Loading Spinner - shown for non-aeronexa-001 devices -->
                    <div id="cameraLoadingSpinner" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; background: #000; border-radius: 8px; z-index: 5;">
                        <div class="camera-spinner" style="width: 60px; height: 60px; border: 4px solid rgba(49, 191, 138, 0.2); border-top-color: #31bf8a; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    </div>
                    <!-- Image stream - will not be loaded for non-aeronexa-001 devices -->
                    <img id="roomVideoStream" src="" alt="Camera Stream" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: none;" onerror="handleStreamError(this);">
                </div>
            </div>
        `;
        // Set status to false so camera stream doesn't initialize
        window.currentRoomStarredStatus = false;
    }
    
    // Initialize camera stream with real-time listener from Firebase Realtime Database
    // All rooms can now use camera stream
    
    // Generate AI recommendations using sensor data from device (Firebase Realtime Database)
    let recommendationsHTML = '';
    if (sensorData && window.generateAIRecommendations && typeof window.generateAIRecommendations === 'function') {
        try {
            // Validate sensor data structure before generating recommendations
            // Ensure all required sensors exist with status and value properties
            const requiredSensors = ['co2', 'dust', 'temperature', 'humidity', 'gas', 'smoke', 'pressure'];
            const missingSensors = requiredSensors.filter(key => 
                !sensorData[key] || 
                typeof sensorData[key].value === 'undefined' || 
                typeof sensorData[key].status === 'undefined'
            );
            
            if (missingSensors.length > 0) {
                console.warn('[AI RECOMMENDATIONS] Missing sensors:', missingSensors);
                // Add default values for missing sensors to prevent errors
                missingSensors.forEach(key => {
                    if (!sensorData[key]) {
                        sensorData[key] = {
                            value: key === 'pressure' ? 1013.2 : (key === 'temperature' ? 23.5 : (key === 'humidity' ? 55 : 0)),
                            unit: key === 'pressure' ? 'hPa' : (key === 'temperature' ? '°C' : (key === 'humidity' ? '%' : 'ppm')),
                            status: 'normal'
                        };
                    } else {
                        if (typeof sensorData[key].value === 'undefined') {
                            sensorData[key].value = key === 'pressure' ? 1013.2 : (key === 'temperature' ? 23.5 : (key === 'humidity' ? 55 : 0));
                        }
                        if (typeof sensorData[key].status === 'undefined') {
                            sensorData[key].status = 'normal';
                        }
                    }
                });
            }
            
            // Generate recommendations based on real-time sensor data from Firebase
            const recommendations = window.generateAIRecommendations(sensorData);
            if (recommendations && recommendations.length > 0) {
                recommendationsHTML = `
                    <div class="ai-recommendations-section" style="margin-bottom: 1.5rem; padding: 1rem; background: linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%); border-radius: 8px; border-left: 4px solid #31bf8a;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
                            <img src="image/Ai.png" alt="AI" style="width: 2.5rem; height: 2.5rem; object-fit: contain;">
                            <div>
                                <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">AI Recommendations</div>
                                <div style="font-size: 0.9rem; font-weight: 600; color: #333;">Smart suggestions for better air quality</div>
                            </div>
                        </div>
                        <div class="recommendations-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                `;
                
                recommendations.forEach((rec) => {
                    recommendationsHTML += `
                        <div class="recommendation-item" style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; background: #fff; border-radius: 8px; border-left: 3px solid #31bf8a;">
                            <div style="font-size: 1.1rem; color: #31bf8a; width: 1.5rem; text-align: center; flex-shrink: 0;">
                                <i class="fas ${rec.icon || 'fa-lightbulb'}"></i>
                            </div>
                            <div style="flex: 1; font-size: 0.9rem; color: #333; line-height: 1.5;">
                                ${rec.text || 'No recommendation available'}
                            </div>
                        </div>
                    `;
                });
                
                recommendationsHTML += `
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.warn('Error generating AI recommendations:', error);
        }
    }
    
    // Calculate room size (for rectangle or polygon)
    let roomSize = 'N/A';
    if (room.width && room.height) {
        // Rectangle room
        const widthMeters = pixelsToMeters(room.width);
        const heightMeters = pixelsToMeters(room.height);
        roomSize = `${formatMeasurement(widthMeters)} × ${formatMeasurement(heightMeters)}`;
    } else if (room.bbox && room.bbox.width && room.bbox.height) {
        // Polygon room
        const widthMeters = pixelsToMeters(room.bbox.width);
        const heightMeters = pixelsToMeters(room.bbox.height);
        roomSize = `${formatMeasurement(widthMeters)} × ${formatMeasurement(heightMeters)}`;
    } else if (room.points && room.points.length >= 3) {
        // Calculate bounding box from points
        const xs = room.points.map(p => p.x);
        const ys = room.points.map(p => p.y);
        const width = Math.max(...xs) - Math.min(...xs);
        const height = Math.max(...ys) - Math.min(...ys);
        const widthMeters = pixelsToMeters(width);
        const heightMeters = pixelsToMeters(height);
        roomSize = `${formatMeasurement(widthMeters)} × ${formatMeasurement(heightMeters)}`;
    }
    
    // Get device ID information
    const deviceId = room.deviceId || 'Not assigned';
    const deviceIdDisplay = deviceId !== 'Not assigned' ? deviceId.toUpperCase() : 'Not assigned';
    
    let content = `
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <div class="room-sensor-modal-content">
            <div class="room-sensor-modal-header">
                <div style="flex: 1;">
                    <h3>${room.name}</h3>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                        <i class="fas fa-microchip" style="font-size: 0.85rem; color: #666;"></i>
                        <span style="font-size: 0.85rem; color: #666; font-weight: 500;">Device: ${deviceIdDisplay}</span>
                    </div>
                </div>
                <button class="close-modal-btn" onclick="closeRoomSensorModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="room-sensor-modal-body">
                ${videoStreamHTML}
                ${recommendationsHTML}
                <div style="margin-bottom: 1rem;">
                    <h4 style="margin: 0 0 1rem 0; color: #333; font-size: 1rem;">Sensor Data</h4>
                </div>
    `;
    
    // Display sensor data - now always shows data (real or dummy)
    if (sensorData) {
        Object.keys(sensorData).forEach(sensorKey => {
            const sensor = sensorData[sensorKey];
            const config = window.sensorConfig ? window.sensorConfig[sensorKey] : null;
            const icon = config ? config.icon : 'fa-circle';
            const name = config ? config.name : sensorKey;
            
            // Handle icon display - check if it's an emoji or Font Awesome class
            const isEmoji = icon && !icon.startsWith('fa-');
            const iconHTML = isEmoji 
                ? `<span style="font-size: 1.2rem;">${icon}</span>`
                : `<i class="fas ${icon}"></i>`;
            
            // Format status text for display
            const statusText = sensor.status === 'normal' ? 'Normal' 
                : sensor.status === 'warning' ? 'Warning' 
                : 'Critical';
            
            // Format value correctly based on sensor type (same as updateRoomSensorModal)
            let formattedValue = sensor.value;
            if (typeof formattedValue === 'number') {
                if (sensorKey === 'temperature' || sensorKey === 'humidity' || sensorKey === 'pressure') {
                    formattedValue = Math.round(formattedValue * 10) / 10;
                } else {
                    formattedValue = Math.round(formattedValue);
                }
            }
            
            content += `
                <div class="sensor-info-item" data-sensor-key="${sensorKey}" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; margin-bottom: 0.75rem; background: #fff; border-radius: 8px; border-left: 4px solid ${sensor.status === 'normal' ? '#31bf8a' : sensor.status === 'warning' ? '#ffa500' : '#ff4444'};">
                    <div style="font-size: 1.5rem; color: ${sensor.status === 'normal' ? '#31bf8a' : sensor.status === 'warning' ? '#ffa500' : '#ff4444'}; width: 2.5rem; text-align: center;">
                        ${iconHTML}
                    </div>
                    <div class="sensor-info-details" style="flex: 1;">
                        <div class="sensor-info-name" style="font-size: 0.9rem; color: #666; margin-bottom: 0.25rem;">${name}</div>
                        <div class="sensor-info-value" style="font-size: 1.1rem; font-weight: 600; color: #333; margin-bottom: 0.25rem;">${formattedValue} ${sensor.unit || ''}</div>
                        <div class="sensor-info-status ${sensor.status}" style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; background: ${sensor.status === 'normal' ? '#e8f5e9' : sensor.status === 'warning' ? '#fff3e0' : '#ffebee'}; color: ${sensor.status === 'normal' ? '#2e7d32' : sensor.status === 'warning' ? '#e65100' : '#c62828'};">
                            ${statusText}
                        </div>
                    </div>
                </div>
            `;
        });
    } else {
        // Room has no device assigned - show all sensors with "--" values
        const sensorKeys = window.sensorConfig ? Object.keys(window.sensorConfig) : ['dust', 'co2', 'temperature', 'humidity', 'pressure', 'gas', 'smoke'];
        sensorKeys.forEach(sensorKey => {
            const config = window.sensorConfig ? window.sensorConfig[sensorKey] : null;
            const icon = config ? config.icon : 'fa-circle';
            const name = config ? config.name : sensorKey;
            // Get unit from sensorConfig or use default units
            const units = {
                dust: 'μg/m³',
                co2: 'ppm',
                temperature: '°C',
                humidity: '%',
                pressure: 'hPa',
                gas: 'ppm',
                smoke: 'ppm'
            };
            const unit = units[sensorKey] || '';
            
            // Handle icon display
            const isEmoji = icon && !icon.startsWith('fa-');
            const iconHTML = isEmoji 
                ? `<span style="font-size: 1.2rem;">${icon}</span>`
                : `<i class="fas ${icon}"></i>`;
            
            content += `
                <div class="sensor-info-item" data-sensor-key="${sensorKey}" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; margin-bottom: 0.75rem; background: #fff; border-radius: 8px; border-left: 4px solid #ccc;">
                    <div style="font-size: 1.5rem; color: #ccc; width: 2.5rem; text-align: center;">
                        ${iconHTML}
                    </div>
                    <div class="sensor-info-details" style="flex: 1;">
                        <div class="sensor-info-name" style="font-size: 0.9rem; color: #666; margin-bottom: 0.25rem;">${name}</div>
                        <div class="sensor-info-value" style="font-size: 1.1rem; font-weight: 600; color: #999; margin-bottom: 0.25rem;">-- ${unit}</div>
                        <div class="sensor-info-status" style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; background: #f5f5f5; color: #999;">
                            Not Available
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    content += `
            </div>
            <div class="room-sensor-modal-footer">
                <button class="btn-primary" onclick="closeRoomSensorModal()">Close</button>
            </div>
        </div>
    `;
    
    modal.innerHTML = content;
    
    // Check if room uses aeronexa-001 device (only aeronexa-001 can access camera stream)
    const canAccessCameraClick = room.deviceId && room.deviceId.toLowerCase() === 'aeronexa-001';
    
    // Initialize camera stream only if room uses aeronexa-001
    if (canAccessCameraClick) {
        if (!window.cameraStreamListener) {
            // Wait a bit to ensure DOM elements are ready
            setTimeout(() => {
                initializeCameraStreamListener();
            }, 50);
        } else {
            // Listener already exists, just ensure video stream is properly displayed
            // Update stream if needed (Firebase listener will handle real-time updates)
            setTimeout(() => {
                // Check current camera data and update display accordingly
                // Read from devices/aeronexa-001/camera for device-specific camera data
                if (window.rtdb && window.rtdbRef && window.rtdbGet) {
                    const cameraRef = window.rtdbRef(window.rtdb, 'devices/aeronexa-001/camera');
                    window.rtdbGet(cameraRef).then((snapshot) => {
                        // Check network error state before any action
                        const streamSection = document.getElementById('roomVideoStreamSection');
                        const isNetworkErrorState = streamSection && streamSection.dataset.networkError === 'true';
                        
                        if (snapshot.exists()) {
                            const cameraData = snapshot.val();
                            const streamIP = cameraData?.proxyUrl || cameraData?.url || cameraData?.ip;
                            const status = cameraData?.status;
                            const personCount = cameraData?.personCount !== undefined ? cameraData.personCount : 0;
                            
                            // Update person count display
                            const personCountElement = document.getElementById('personCountValue');
                            if (personCountElement) {
                                personCountElement.textContent = personCount;
                                const personCountDisplay = personCountElement.parentElement;
                                if (personCountDisplay) {
                                    const pluralText = personCountDisplay.querySelector('span:last-child');
                                    if (pluralText) {
                                        pluralText.textContent = `person${personCount !== 1 ? 's' : ''}`;
                                    }
                                }
                            }
                            
                            if (status === 'online' && streamIP) {
                                // Always call updateCameraStream - it will check if network error should be shown
                                // Only call if stream section element exists
                                const streamSectionCheck = document.getElementById('roomVideoStreamSection');
                                if (streamSectionCheck) {
                                    updateCameraStream(streamIP);
                                }
                            } else {
                                // Only hide if not in network error state
                                if (!isNetworkErrorState) {
                                    hideCameraStream();
                                }
                                // If network error state, keep showing error message
                            }
                        } else {
                            // Only hide if not in network error state
                            if (!isNetworkErrorState) {
                                hideCameraStream();
                            }
                            // If network error state, keep showing error message
                        }
                    }).catch((error) => {
                        console.error('[Camera] Error checking camera data:', error);
                    });
                }
            }, 50);
        }
    } else {
        // Room doesn't use aeronexa-001 - don't process camera, just show error message
        // Error message is already displayed in HTML, no need to call hideCameraStream
        // This ensures the error message stays visible without any camera processing
    }
    
    // Trigger fade in animation for hover mode
    if (isHoverMode) {
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            modal.style.transform = 'scale(1)';
        });
    }
    
    // Old hover modal code removed - now using same modal for hover and click
    
    // Setup real-time sensor data listener for click mode (not hover mode)
    // For hover mode, we preserve existing content without refresh
    if (!isHoverMode) {
        // Setup Firebase Real-time Database listener for sensor data updates
        setupModalSensorListener(room);
        
        // Also keep interval as backup for non-Firebase updates
        // Clear any existing interval first
        if (modalUpdateInterval) {
            clearInterval(modalUpdateInterval);
            modalUpdateInterval = null;
        }
        
        // Update immediately when modal opens (don't wait for first interval)
        setTimeout(() => {
            if (window.updateRoomSensorModal && typeof window.updateRoomSensorModal === 'function') {
                window.updateRoomSensorModal();
            }
        }, 100);
        
        // Start updating modal every 3 seconds (backup polling, less frequent since we have real-time listener)
        modalUpdateInterval = setInterval(() => {
            // Always check if modal exists and is visible
            const modalCheck = document.getElementById('roomSensorModal');
            if (!modalCheck) {
                // Modal doesn't exist, clear interval
                if (modalUpdateInterval) {
                    clearInterval(modalUpdateInterval);
                    modalUpdateInterval = null;
                }
                return;
            }
            
            const computedStyle = window.getComputedStyle(modalCheck);
            if (computedStyle.display === 'none') {
                // Modal is closed, clear interval
                if (modalUpdateInterval) {
                    clearInterval(modalUpdateInterval);
                    modalUpdateInterval = null;
                }
                return;
            }
            
            // Only update if not in hover mode (hover mode preserves content without refresh)
            // Double check hover mode flag to be sure
            if (!window.isHoverMode && window.updateRoomSensorModal && typeof window.updateRoomSensorModal === 'function') {
                window.updateRoomSensorModal();
            }
        }, 3000); // Changed from 1000ms to 3000ms since real-time listener handles immediate updates
        
        // Store interval ID globally for debugging
        window.modalUpdateInterval = modalUpdateInterval;
    } else {
        // Hover mode: clear any existing interval to prevent updates during hover
        if (modalUpdateInterval) {
            clearInterval(modalUpdateInterval);
            modalUpdateInterval = null;
            window.modalUpdateInterval = null;
        }
        // Also cleanup listener for hover mode
        cleanupModalSensorListener();
    }
}

/**
 * Setup Firebase Real-time Database listener for sensor data updates in modal
 * This provides instant updates when sensor data changes in Firebase
 */
function setupModalSensorListener(room) {
    // Cleanup existing listener first
    cleanupModalSensorListener();
    
    // Check if room has device assigned
    if (!room || !room.deviceId) {
        console.log('[Modal Sensor Listener] No device assigned to room, skipping listener setup');
        return;
    }
    
    // Check if Firebase is available
    if (!window.rtdb || !window.rtdbRef || !window.rtdbOnValue) {
        console.warn('[Modal Sensor Listener] Firebase Realtime Database not available');
        return;
    }
    
    try {
        // Create reference to device sensor data in Firebase
        const deviceSensorRef = window.rtdbRef(window.rtdb, `devices/${room.deviceId}/data_sensor`);
        
        // Setup real-time listener
        const sensorListener = window.rtdbOnValue(deviceSensorRef, (snapshot) => {
            // Check if modal is still open
            const modal = document.getElementById('roomSensorModal');
            if (!modal || window.getComputedStyle(modal).display === 'none') {
                console.log('[Modal Sensor Listener] Modal closed, skipping update');
                cleanupModalSensorListener();
                return;
            }
            
            // Check if snapshot exists
            if (!snapshot.exists()) {
                console.log('[Modal Sensor Listener] No sensor data in Firebase');
                return;
            }
            
            const sensorData = snapshot.val();
            console.log('[Modal Sensor Listener] Received real-time update from Firebase:', sensorData);
            
            // Map Firebase sensor data to our format
            const mappedSensors = mapDeviceSensorDataFromFirebaseForRoom(sensorData);
            
            if (!mappedSensors) {
                console.warn('[Modal Sensor Listener] Failed to map sensor data');
                return;
            }
            
            // Update sensor values in modal
            const allSensorItems = modal.querySelectorAll('.sensor-info-item[data-sensor-key]');
            Object.keys(mappedSensors).forEach(sensorKey => {
                const sensor = mappedSensors[sensorKey];
                const sensorItem = Array.from(allSensorItems).find(item => 
                    item.getAttribute('data-sensor-key') === sensorKey
                );
                
                if (sensorItem && sensor) {
                    // Update value
                    const valueElement = sensorItem.querySelector('.sensor-info-value');
                    if (valueElement) {
                        let formattedValue = sensor.value;
                        if (typeof formattedValue === 'number') {
                            if (sensorKey === 'temperature' || sensorKey === 'humidity' || sensorKey === 'pressure') {
                                formattedValue = Math.round(formattedValue * 10) / 10;
                            } else {
                                formattedValue = Math.round(formattedValue);
                            }
                        }
                        valueElement.textContent = `${formattedValue} ${sensor.unit || ''}`.trim();
                    }
                    
                    // Update status
                    const statusElement = sensorItem.querySelector('.sensor-info-status');
                    if (statusElement) {
                        const statusText = sensor.status === 'normal' ? 'Normal' 
                            : sensor.status === 'warning' ? 'Warning' 
                            : 'Critical';
                        statusElement.textContent = statusText;
                        statusElement.className = `sensor-info-status ${sensor.status}`;
                        
                        const statusColor = sensor.status === 'normal' ? '#2e7d32' 
                            : sensor.status === 'warning' ? '#e65100' 
                            : '#c62828';
                        const statusBg = sensor.status === 'normal' ? '#e8f5e9' 
                            : sensor.status === 'warning' ? '#fff3e0' 
                            : '#ffebee';
                        statusElement.style.background = statusBg;
                        statusElement.style.color = statusColor;
                    }
                    
                    // Update border color based on status
                    const borderColor = sensor.status === 'normal' ? '#31bf8a' 
                        : sensor.status === 'warning' ? '#ffa500' 
                        : '#ff4444';
                    sensorItem.style.borderLeftColor = borderColor;
                    
                    // Update icon color
                    const iconElement = sensorItem.querySelector('div[style*="font-size: 1.5rem"]');
                    if (iconElement) {
                        iconElement.style.color = borderColor;
                    }
                }
            });
            
            console.log('[Modal Sensor Listener] Modal sensor data updated successfully');
        }, (error) => {
            console.error('[Modal Sensor Listener] Error listening to sensor data:', error);
        });
        
        // Store listener reference for cleanup
        modalSensorListener = {
            ref: deviceSensorRef,
            unsubscribe: sensorListener,
            deviceId: room.deviceId
        };
        
        console.log('[Modal Sensor Listener] Real-time listener setup successfully for device:', room.deviceId);
    } catch (error) {
        console.error('[Modal Sensor Listener] Error setting up listener:', error);
    }
}

/**
 * Cleanup modal sensor listener when modal closes
 */
function cleanupModalSensorListener() {
    if (modalSensorListener && window.rtdbOff) {
        try {
            // Firebase onValue returns an unsubscribe function
            if (typeof modalSensorListener.unsubscribe === 'function') {
                modalSensorListener.unsubscribe();
            }
            console.log('[Modal Sensor Listener] Listener cleaned up for device:', modalSensorListener.deviceId);
            modalSensorListener = null;
        } catch (error) {
            console.error('[Modal Sensor Listener] Error cleaning up listener:', error);
        }
    }
}

/**
 * Check if IP address is a local/private IP
 */
function isLocalIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    
    // Remove protocol and path if present
    ip = ip.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
    
    // Check for local IP patterns
    const localIPPatterns = [
        /^10\./,           // 10.0.0.0/8
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
        /^192\.168\./,     // 192.168.0.0/16
        /^127\./,          // 127.0.0.0/8 (localhost)
        /^169\.254\./,     // 169.254.0.0/16 (link-local)
        /^localhost$/,     // localhost
    ];
    
    return localIPPatterns.some(pattern => pattern.test(ip));
}

/**
 * Handle camera stream error
 */
function handleStreamError(imgElement) {
    if (!imgElement) return;
    
    // All rooms can now access camera stream - no starred check needed
    imgElement.style.display = 'none';
    const streamSection = document.getElementById('roomVideoStreamSection');
    const streamImg = document.getElementById('roomVideoStream');
    const errorMsg = document.getElementById('cameraNetworkError');
    const problemMsg = document.getElementById('cameraProblemMessage');
    
    if (!streamSection) return;
    
    // Hide problem message (no longer needed)
    if (problemMsg) {
        problemMsg.style.display = 'none';
    }
    
    // Check network and show appropriate error message
    
    // Get the IP from image src to check if it's local IP
    const imgSrc = imgElement.src || '';
    const ipMatch = imgSrc.match(/http:\/\/([^\/]+)/);
    const ip = ipMatch ? ipMatch[1] : '';
    
    // Check if app is from internet (Firebase Hosting) - same logic as updateCameraStream
    const isFromInternet = (window.location.hostname.includes('firebaseapp.com') || 
                           window.location.hostname.includes('web.app') ||
                           (window.location.protocol === 'https:' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1'))) &&
                          window.location.hostname !== 'localhost' &&
                          window.location.hostname !== '127.0.0.1';
    
    // Check if error is due to local IP from different network
    const isLocal = ip && isLocalIP(ip);
    const isDifferentNetwork = isLocal && isFromInternet;
    
    // If beda jaringan → keep showing loading spinner (no error message)
    if (isDifferentNetwork) {
        // Keep showing loading spinner and hide stream
        streamSection.style.display = 'block';
        if (streamImg) streamImg.style.display = 'none';
        
        // Keep loading spinner visible
        const loadingSpinner = document.getElementById('cameraLoadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'flex';
        }
        
        // Mark as network error to prevent it from being cleared by any future calls
        if (streamSection) {
            streamSection.dataset.networkError = 'true';
            streamSection.dataset.streamIP = ip; // Store IP to track changes
        }
        console.error('[Camera] Network Error: BEDA JARINGAN - Keeping loading spinner visible');
        console.error('[Camera] IP:', ip, 'is a local IP and only accessible from same network');
        return; // Stop here - don't try to hide or do anything else
    }
    
    // If same network but stream fails, keep showing loading spinner
    if (isLocal && !isFromInternet) {
        // Same network but stream failed - keep showing loading spinner
        streamSection.style.display = 'block';
        if (streamImg) streamImg.style.display = 'none';
        
        // Keep loading spinner visible
        const loadingSpinner = document.getElementById('cameraLoadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'flex';
        }
        
        // Mark as error to persist
        if (streamSection) {
            streamSection.dataset.networkError = 'true';
            streamSection.dataset.streamIP = ip;
        }
        console.warn('[Camera] Stream failed on same network - keeping loading spinner visible');
    } else {
        // Other error (not local IP or unknown) - keep showing loading spinner
        streamSection.style.display = 'block';
        if (streamImg) streamImg.style.display = 'none';
        
        // Keep loading spinner visible
        const loadingSpinner = document.getElementById('cameraLoadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'flex';
        }
        
        // Mark as error to persist
        if (streamSection) {
            streamSection.dataset.networkError = 'true';
            if (ip) {
                streamSection.dataset.streamIP = ip;
            }
        }
        console.error('[Camera] Stream failed to load - showing error message');
    }
}

/**
 * Initialize camera stream real-time listener from Firebase Realtime Database
 */
function initializeCameraStreamListener() {
    // Only aeronexa-001 device can access camera stream
    // Initialize listener for device camera data
    
    // Check if listener already exists - if yes, don't reinitialize to avoid refresh
    if (window.cameraStreamListener) {
        console.log('[Camera] Listener already exists, skipping reinitialization');
        return;
    }
    
    // Check if Firebase Realtime Database is available
    if (!window.rtdb || !window.rtdbRef || !window.rtdbOnValue) {
        console.warn('[Camera] Firebase Realtime Database not available');
        return;
    }
    
    try {
        // Reference to camera data in Firebase Realtime Database
        // Read from devices/aeronexa-001/camera (device-specific camera data)
        const cameraRef = window.rtdbRef(window.rtdb, 'devices/aeronexa-001/camera');
        
        // Set up real-time listener
        // Track previous IP to detect changes
        let previousStreamIP = null;
        
        const cameraListener = (snapshot) => {
            // All rooms can now access camera stream - process camera data for all rooms
            const streamSection = document.getElementById('roomVideoStreamSection');
            const previousIP = streamSection ? streamSection.dataset.streamIP : null;
            
            if (!snapshot.exists()) {
                console.log('[Camera] No camera data found in Firebase');
                // Clear previous IP tracking
                previousStreamIP = null;
                if (streamSection) {
                    streamSection.dataset.streamIP = '';
                    streamSection.dataset.networkError = 'false';
                }
                // Hide stream if no data available
                hideCameraStream();
                return;
            }
            
            // Process camera data for all rooms
            const cameraData = snapshot.val();
            // Priority: proxyUrl > url > ip (proxyUrl is preferred for cross-network access)
            const streamIP = cameraData?.proxyUrl || cameraData?.url || cameraData?.ip;
            const status = cameraData?.status;
            const lastSeen = cameraData?.lastSeen;
            const personCount = cameraData?.personCount !== undefined ? cameraData.personCount : 0;
            
            // Update person count display if room uses aeronexa-001
            const personCountElement = document.getElementById('personCountValue');
            if (personCountElement) {
                const currentCount = parseInt(personCountElement.textContent) || 0;
                if (currentCount !== personCount) {
                    personCountElement.textContent = personCount;
                    // Update plural form
                    const personCountDisplay = personCountElement.parentElement;
                    if (personCountDisplay) {
                        const pluralText = personCountDisplay.querySelector('span:last-child');
                        if (pluralText) {
                            pluralText.textContent = `person${personCount !== 1 ? 's' : ''}`;
                        }
                    }
                }
            }
            
            // Detect if IP has changed
            const ipChanged = streamIP && (streamIP !== previousStreamIP && streamIP !== previousIP);
            
            console.log('[Camera] Camera data updated:', { 
                ip: cameraData?.ip,
                proxyUrl: cameraData?.proxyUrl,
                url: cameraData?.url,
                streamIP, // Final IP/URL to use
                previousIP,
                previousStreamIP,
                ipChanged: ipChanged ? 'YES - IP berubah!' : 'NO',
                status, 
                lastSeen,
                personCount
            });
            
            // STEP 3: If IP changed, clear network error state to allow new attempt
            // IP berubah berarti ESP32-S3 mengirim IP baru - harus dicoba load stream dengan IP baru
            if (ipChanged && streamSection) {
                console.log('[Camera] IP berubah dari', previousIP || previousStreamIP || 'tidak ada', 'ke', streamIP, '- Clearing error state dan mencoba load stream baru');
                // Clear network error state saat IP berubah - IP baru mungkin bisa diakses
                streamSection.dataset.networkError = 'false';
                // Clear previous stream untuk force reload
                const streamIframe = document.getElementById('roomVideoStream');
                const streamImg = document.getElementById('roomVideoStreamImg');
                if (streamIframe) {
                    streamIframe.src = ''; // Clear iframe src untuk force reload
                }
                if (streamImg) {
                    streamImg.onerror = null;
                    streamImg.onload = null;
                    streamImg.src = ''; // Clear img src untuk force reload
                }
            }
            
            // Update camera stream with new IP
            // All rooms can now access camera stream - no starred check needed
            if (streamIP) {
                // Check if IP actually changed
                const ipChanged = streamIP !== previousStreamIP && streamIP !== previousIP;
                
                // If IP hasn't changed, check if stream is already loaded successfully
                if (!ipChanged && streamSection) {
                    const streamImg = document.getElementById('roomVideoStream');
                    const isStreamLoaded = streamImg && streamImg.complete && streamImg.naturalWidth > 0 && streamImg.naturalHeight > 0;
                    const lastLoadedIP = streamSection.dataset.lastLoadedIP;
                    
                    // If stream is already loaded successfully with same IP, skip reload
                    if (isStreamLoaded && lastLoadedIP === streamIP) {
                        console.log('[Camera] Stream already loaded successfully with same IP - skipping updateCameraStream call');
                        return; // Skip reload if stream is already working
                    }
                    
                    // If IP hasn't changed and we're in error state, don't reload immediately
                    // This prevents infinite reload loop
                    const isNetworkError = streamSection.dataset.networkError === 'true';
                    const lastErrorTime = streamSection.dataset.lastErrorTime;
                    const timeSinceError = lastErrorTime ? Date.now() - parseInt(lastErrorTime) : Infinity;
                    
                    // If same IP, in error state, and error happened less than 10 seconds ago, skip reload
                    if (isNetworkError && timeSinceError < 10000) {
                        console.log('[Camera] Same IP, in error state, and recent error - skipping reload to prevent loop');
                        return; // Skip reload to prevent infinite loop
                    }
                }
                
                // Update previous IP tracking
                previousStreamIP = streamIP;
                if (streamSection) {
                    streamSection.dataset.streamIP = streamIP;
                }
                
                // Call updateCameraStream - it will check network and load stream
                // If IP changed, updateCameraStream will try to load stream with new IP
                // Only call if stream section element exists
                const streamSectionCheck = document.getElementById('roomVideoStreamSection');
                if (streamSectionCheck) {
                    updateCameraStream(streamIP);
                }
            } else if (status === 'online' && !streamIP) {
                // Status online but no IP/URL - clear tracking and hide stream
                previousStreamIP = null;
                if (streamSection) {
                    streamSection.dataset.streamIP = '';
                    streamSection.dataset.networkError = 'false';
                }
                hideCameraStream('no-ip');
            } else {
                // Status offline and no IP/URL - clear tracking and hide stream
                previousStreamIP = null;
                if (streamSection) {
                    streamSection.dataset.streamIP = '';
                    streamSection.dataset.networkError = 'false';
                }
                hideCameraStream(status);
            }
        };
        
        // Set up listener
        window.rtdbOnValue(cameraRef, cameraListener, (error) => {
            console.error('[Camera] Error listening to camera data:', error);
            hideCameraStream('error');
        });
        
        // Store listener reference for cleanup
        window.cameraStreamListener = { ref: cameraRef, callback: cameraListener };
        
        console.log('[Camera] Real-time camera listener initialized');
    } catch (error) {
        console.error('[Camera] Error initializing camera stream listener:', error);
        hideCameraStream('error');
    }
}

/**
 * Update camera stream URL
 */
function updateCameraStream(streamIP) {
    // All rooms can now access camera stream - no starred check needed
    const streamSection = document.getElementById('roomVideoStreamSection');
    // Use img tag as primary method (better control with object-fit: cover)
    const streamImg = document.getElementById('roomVideoStream');
    const streamIframe = document.getElementById('roomVideoStreamIframe');
    const errorMsg = document.getElementById('cameraNetworkError');
    const problemMsg = document.getElementById('cameraProblemMessage');
    
    if (!streamSection) {
        console.warn('[Camera] Stream section element not found');
        return;
    }
    
    // Hide problem message (no longer needed since all rooms can access camera)
    if (problemMsg) {
        problemMsg.style.display = 'none';
    }
    
    if (!streamIP) {
        // No IP available - hide stream section
        hideCameraStream();
        return;
    }
    
    // Check if streamIP is a full URL (from proxyUrl/url) or just IP address
    // If it's a full URL (contains http:// or https://), extract hostname for network check
    let hostname = streamIP;
    let streamURL = streamIP;
    
    if (streamIP.includes('http://') || streamIP.includes('https://')) {
        // Full URL from proxyUrl/url - extract hostname
        try {
            const url = new URL(streamIP);
            hostname = url.hostname;
            // Use the full URL directly (may already include /stream endpoint)
            streamURL = streamIP;
            // If URL doesn't end with /stream, add it
            if (!streamURL.endsWith('/stream')) {
                streamURL = streamURL.endsWith('/') ? streamURL + 'stream' : streamURL + '/stream';
            }
        } catch (e) {
            console.error('[Camera] Invalid URL format:', streamIP);
            hideCameraStream();
            return;
        }
    } else {
        // Just IP address - construct stream URL
        streamURL = `http://${streamIP}/stream`;
        hostname = streamIP;
    }
    
    // Check if hostname is local IP (192.168.x.x, 10.x.x.x, etc.)
    const isLocal = isLocalIP(hostname);
    
    // Check if app is loaded from internet (Firebase Hosting) - not localhost
    // More accurate detection: check hostname, not just protocol
    const isFromInternet = (window.location.hostname.includes('firebaseapp.com') || 
                           window.location.hostname.includes('web.app') ||
                           (window.location.protocol === 'https:' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1'))) &&
                          window.location.hostname !== 'localhost' &&
                          window.location.hostname !== '127.0.0.1';
    
    // LOGIC: 
    // - If local IP AND app from internet = Mungkin beda jaringan, tapi coba load dulu
    //   (Jika user device ada di jaringan yang sama, stream masih bisa load)
    // - If local IP AND app from localhost = SAMA JARINGAN → tampilkan stream
    // - If public IP/URL (proxyUrl/url) = BISA DIAKSES → tampilkan stream
    
    const isDifferentNetwork = isLocal && isFromInternet;
    
    console.log('[Camera] Stream check:', { 
        streamIP, 
        hostname,
        streamURL,
        isLocal, 
        isFromInternet, 
        appHostname: window.location.hostname,
        isDifferentNetwork,
        note: isDifferentNetwork ? 'Local IP + Firebase Hosting - akan coba load stream terlebih dahulu' : 'Normal case - langsung load stream'
    });
    
    // Always try to load stream first (all rooms can access camera stream)
    // Even if detected as "different network", we should attempt to load the stream
    // because the user's device might still be on the same local network
    // Only show error if stream actually fails to load
    
    // Show stream section first
    streamSection.style.display = 'block';
    
    // Initially hide error message (will show if stream fails)
    if (errorMsg) {
        errorMsg.style.display = 'none';
    }
    
    // Ensure problem message is hidden
    if (problemMsg) {
        problemMsg.style.display = 'none';
    }
    
    // Clear network error state initially (will be set to true if stream fails)
    if (streamSection) {
        streamSection.dataset.streamIP = hostname;
        // Clear previous network error state - will be set again if stream fails
        streamSection.dataset.networkError = 'false';
    }
    
    // Use iframe as primary method for MJPEG stream (more reliable for camera streams)
    // Iframe works better for MJPEG streams from ESP32 cameras
    if (streamIframe) {
        // Hide img tag when using iframe
        if (streamImg) {
            streamImg.style.display = 'none';
        }
        
        // Check if URL has changed
        const currentIframeSrc = streamIframe.src || '';
        const urlChanged = currentIframeSrc !== streamURL && !currentIframeSrc.includes(hostname);
        
        if (urlChanged || !streamIframe.src || streamIframe.src === '') {
            // Add onload handler to hide loading spinner when iframe loads
            streamIframe.onload = function() {
                const loadingSpinner = document.getElementById('cameraLoadingSpinner');
                if (loadingSpinner) {
                    loadingSpinner.style.display = 'none';
                }
                console.log('[Camera] Iframe stream loaded successfully');
            };
            
            // Set iframe src to stream URL
            streamIframe.src = streamURL;
            streamIframe.style.display = 'block';
            console.log('[Camera] Loading stream in iframe:', streamURL);
        } else {
            // Same URL - just ensure it's visible and hide loading spinner
            streamIframe.style.display = 'block';
            const loadingSpinner = document.getElementById('cameraLoadingSpinner');
            if (loadingSpinner) {
                loadingSpinner.style.display = 'none';
            }
        }
    } else if (streamImg) {
        // Fallback to img tag if iframe not available
        // Use img tag for MJPEG stream (better control with object-fit: cover)
        // Check if URL has changed - need to compare hostname/IP, not full URL (ignore timestamp)
        // Extract hostname from current src and new streamURL for comparison
        let currentHostname = '';
        let currentStreamPath = '';
        try {
            if (streamImg.src) {
                const currentUrl = new URL(streamImg.src);
                currentHostname = currentUrl.hostname;
                // Get path without query params (timestamp)
                currentStreamPath = currentUrl.pathname;
            }
        } catch (e) {
            // Current src might be empty or invalid - treat as changed
            currentHostname = '';
            currentStreamPath = '';
        }
        
        // Extract hostname and path from new streamURL (without timestamp)
        const newStreamPath = streamURL.includes('?') ? streamURL.split('?')[0] : streamURL;
        const newStreamPathOnly = newStreamPath.replace(/^https?:\/\/[^\/]+/, '');
        const currentPathOnly = currentStreamPath;
        
        // Check if IP/hostname or path actually changed (ignore timestamp in URL)
        const hostnameChanged = currentHostname !== hostname;
        const pathChanged = currentPathOnly !== newStreamPathOnly;
        const urlChanged = hostnameChanged || pathChanged || !streamImg.src || streamImg.src === '';
        
        // Check if stream is already loaded successfully with same IP
        const isStreamLoaded = streamImg.complete && streamImg.naturalWidth > 0 && streamImg.naturalHeight > 0;
        const isSameIP = currentHostname === hostname && !hostnameChanged;
        const isNetworkError = streamSection && streamSection.dataset.networkError === 'true';
        const lastLoadedIP = streamSection ? streamSection.dataset.lastLoadedIP : null;
        
        // CRITICAL: If stream is loaded successfully with same IP, DON'T reload
        if (isStreamLoaded && isSameIP && lastLoadedIP === hostname && !urlChanged) {
            console.log('[Camera] Stream already loaded successfully with same IP - skipping reload');
            return; // Don't reload if stream is already working
        }
        
        // If same IP and in error state, check cooldown period
        if (isSameIP && isNetworkError && !urlChanged) {
            const lastErrorTime = streamSection ? streamSection.dataset.lastErrorTime : null;
            const timeSinceError = lastErrorTime ? Date.now() - parseInt(lastErrorTime) : Infinity;
            
            // If error happened less than 10 seconds ago, skip reload
            if (timeSinceError < 10000) {
                console.log('[Camera] Same IP, in error state, and recent error - skipping reload to prevent loop');
                return; // Don't reload if same IP and recent error
            }
        }
        
        // Only update stream if URL actually changed or stream is not loaded
        if (urlChanged || !isStreamLoaded || streamImg.src === '') {
            // Log warning if detected as different network, but still try to load
            if (isDifferentNetwork) {
                console.warn('[Camera] Detected as different network (local IP + Firebase Hosting), but attempting to load stream anyway. If user is on same network, stream should work.');
            }
            
            // Clear previous error handlers to ensure fresh load
            streamImg.onerror = null;
            streamImg.onload = null;
            
            // Helper function to setup stream handlers after src is set
            const setupStreamHandlers = () => {
                // Set error handler - if stream fails to load, ALWAYS show error message
                streamImg.onerror = function() {
                    // Check error type - ERR_INCOMPLETE_CHUNKED_ENCODING is common with ESP32 streams
                    // ERR_CONNECTION_TIMED_OUT means camera is not reachable
                    const errorInfo = {
                        url: streamURL,
                        src: this.src,
                        complete: this.complete,
                        naturalWidth: this.naturalWidth,
                        naturalHeight: this.naturalHeight
                    };
                    
                    console.error('[Camera] Stream failed to load:', streamURL, errorInfo);
                    
                    // Check if this is a timeout/connection error
                    // Browser may show ERR_CONNECTION_TIMED_OUT in console but onerror still fires
                    const isTimeoutError = !this.complete || (this.naturalWidth === 0 && this.naturalHeight === 0);
                    
                    // If it was detected as different network AND failed, show network error message
                    // Otherwise, show generic error (could be timeout, camera offline, etc.)
                    const showNetworkError = isDifferentNetwork || isTimeoutError;
                    
                    // Keep loading spinner visible when error occurs (don't hide it)
                    const loadingSpinner = document.getElementById('cameraLoadingSpinner');
                    if (loadingSpinner) {
                        loadingSpinner.style.display = 'flex'; // Keep showing spinner on error
                    }
                    
                    // Hide stream image on error
                    streamSection.style.display = 'block';
                    if (streamImg) streamImg.style.display = 'none';
                    
                    // Don't show error message - just keep spinner running
                    console.log('[Camera] Stream failed to load - keeping loading spinner visible');
                    
                    // Mark as error to persist - but don't retry immediately to prevent loop
                    if (streamSection) {
                        streamSection.dataset.networkError = 'true';
                        streamSection.dataset.streamIP = hostname;
                        // Store timestamp to prevent immediate retry
                        streamSection.dataset.lastErrorTime = Date.now().toString();
                    }
                    
                    // Also call handleStreamError for additional processing
                    handleStreamError(this);
                };
                
                // Set timeout to show error if stream doesn't load within 8 seconds
                // Increased timeout for Firebase Hosting scenarios and to handle ERR_CONNECTION_TIMED_OUT
                const loadTimeout = setTimeout(() => {
                    // Check if image actually loaded (has naturalWidth/Height)
                    if (streamImg && (!streamImg.complete || streamImg.naturalWidth === 0 || streamImg.naturalHeight === 0)) {
                        console.warn('[Camera] Stream load timeout - keeping loading spinner visible');
                        
                        // Keep loading spinner visible (don't hide it)
                        const loadingSpinner = document.getElementById('cameraLoadingSpinner');
                        if (loadingSpinner) {
                            loadingSpinner.style.display = 'flex'; // Keep spinner running on timeout
                        }
                        
                        // Hide stream image if not loaded
                        streamSection.style.display = 'block';
                        if (streamImg) streamImg.style.display = 'none';
                        
                        // Mark as network error to persist
                        if (streamSection) {
                            streamSection.dataset.networkError = 'true';
                            streamSection.dataset.streamIP = hostname;
                            streamSection.dataset.lastErrorTime = Date.now().toString();
                        }
                    }
                }, 8000); // 8 second timeout - increased to catch ERR_CONNECTION_TIMED_OUT before it fails
                
                // Clear timeout if image loads successfully
                streamImg.onload = function() {
                    clearTimeout(loadTimeout);
                    
                    // Hide loading spinner when stream loads successfully
                    const loadingSpinner = document.getElementById('cameraLoadingSpinner');
                    if (loadingSpinner) {
                        loadingSpinner.style.display = 'none';
                    }
                    
                    // Clear network error state since stream loaded successfully
                    if (streamSection) {
                        streamSection.dataset.networkError = 'false';
                        // Store the IP that successfully loaded to prevent unnecessary reloads
                        streamSection.dataset.lastLoadedIP = hostname;
                        // Clear error timestamp since stream is now working
                        streamSection.dataset.lastErrorTime = '';
                    }
                    
                    if (isDifferentNetwork) {
                        console.log('[Camera] Stream loaded successfully despite being detected as different network - user is on same local network');
                    } else {
                        console.log('[Camera] Stream loaded successfully - IP:', hostname);
                    }
                };
            };
            
            // Force reload by clearing src first, then setting new URL
            // Add timestamp to URL to prevent browser caching and help with chunked encoding issues
            // Only add timestamp if URL actually changed (not for same IP reloads)
            const streamURLWithTimestamp = urlChanged 
                ? streamURL + (streamURL.includes('?') ? '&' : '?') + '_t=' + Date.now()
                : streamURL; // Use same URL if not changed to prevent unnecessary reloads
            
            if (streamImg.src && streamImg.src !== '' && urlChanged) {
                streamImg.src = '';
                // Small delay to ensure browser clears previous connection
                setTimeout(() => {
                    streamImg.src = streamURLWithTimestamp;
                    streamImg.style.display = 'block';
                    console.log('[Camera] Loading stream with new IP/URL:', streamURLWithTimestamp);
                    // Setup handlers after src is set
                    setupStreamHandlers();
                }, 100);
            } else if (!streamImg.src || streamImg.src === '') {
                // No previous src - set directly
                streamImg.src = streamURLWithTimestamp;
                streamImg.style.display = 'block';
                console.log('[Camera] Loading stream:', streamURLWithTimestamp);
                // Setup handlers after src is set
                setupStreamHandlers();
            } else {
                // Same URL - just ensure it's visible and handlers are set
                streamImg.style.display = 'block';
                console.log('[Camera] Stream URL unchanged - keeping existing stream');
                // Setup handlers in case they were cleared
                setupStreamHandlers();
            }
        } else {
            // Same URL, just make sure it's visible
            streamImg.style.display = 'block';
        }
    }
    
    // Ensure iframe is hidden when using img tag (fallback)
    if (streamIframe && streamImg && streamImg.style.display === 'block') {
        streamIframe.style.display = 'none';
    }
    
    if (isDifferentNetwork) {
        console.log('[Camera] Attempting to load stream (detected as different network but will try anyway):', streamURL);
    } else {
        console.log('[Camera] SAMA JARINGAN atau Public IP/URL - Menampilkan camera stream:', streamURL);
    }
}

/**
 * Hide camera stream section
 */
function hideCameraStream(reason = 'offline') {
    const streamSection = document.getElementById('roomVideoStreamSection');
    const streamImg = document.getElementById('roomVideoStream');
    const streamIframe = document.getElementById('roomVideoStreamIframe');
    const errorMsg = document.getElementById('cameraNetworkError');
    
    if (!streamSection) return;
    
    // CRITICAL: Check if we're showing network error - ALWAYS keep showing it
    // Network error message should NEVER be hidden unless IP/condition actually changes
    const isNetworkError = streamSection.dataset.networkError === 'true';
    
    // If it's network error state, keep showing loading spinner
    // regardless of reason (offline, error, no-ip, etc.)
    if (isNetworkError) {
        // Keep showing loading spinner (no error message)
        const loadingSpinner = document.getElementById('cameraLoadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'flex'; // Keep spinner visible
        }
        
        if (streamImg) streamImg.style.display = 'none';
        if (streamIframe) streamIframe.style.display = 'none';
        if (errorMsg) {
            errorMsg.style.display = 'none'; // Hide error message, keep spinner only
        }
        streamSection.style.display = 'block';
        // Keep network error state - don't clear it
        console.log('[Camera] Network error state active - keeping loading spinner visible despite reason:', reason);
        return; // CRITICAL: Return immediately - don't hide anything
    }
    
    // Only hide if NOT in network error state
    // Show loading spinner when hiding stream (camera offline/unavailable)
    const loadingSpinner = document.getElementById('cameraLoadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.style.display = 'flex'; // Show spinner when camera offline
    }
    
    // Hide stream iframe and image
    if (streamIframe) {
        streamIframe.style.display = 'none';
        // Clear src to stop loading
        streamIframe.src = '';
    }
    if (streamImg) {
        streamImg.style.display = 'none';
    }
    
    // Clear network error state (should already be false)
    if (streamSection) {
        streamSection.dataset.networkError = 'false';
    }
    
    // Keep section visible to show loading spinner
    streamSection.style.display = 'block';
}

/**
 * Clean up camera stream listener
 */
function cleanupCameraStreamListener() {
    if (window.cameraStreamListener && window.rtdbOff && window.rtdbRef && window.rtdb) {
        try {
            window.rtdbOff(window.cameraStreamListener.ref, 'value', window.cameraStreamListener.callback);
            window.cameraStreamListener = null;
            console.log('[Camera] Camera stream listener cleaned up');
        } catch (error) {
            console.error('[Camera] Error cleaning up camera listener:', error);
        }
    }
}

/**
 * Close room sensor modal
 */
function closeRoomSensorModal() {
    const modal = document.getElementById('roomSensorModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Reset hover mode flag
    window.isHoverMode = false;
    
    selectedRoomId = null;
    window.selectedRoomIdForModal = null;
    window.selectedRoomNameForModal = null;
    window.selectedRoomDataIndex = null;
    
    // Clear modal update interval when modal is closed
    if (modalUpdateInterval) {
        clearInterval(modalUpdateInterval);
        modalUpdateInterval = null;
    }
    
    // Clean up sensor data listener when modal closes
    cleanupModalSensorListener();
    
    // Clean up camera stream listener when modal closes
    cleanupCameraStreamListener();
}

/**
 * Helper function to update a single sensor item in the modal
 */
function updateSensorItemInModal(sensorItem, sensor, config) {
    // Update sensor value
    const valueElement = sensorItem.querySelector('.sensor-info-value');
    if (valueElement && sensor && sensor.value !== undefined) {
        // Format the value correctly based on sensor type
        let formattedValue = sensor.value;
        if (typeof formattedValue === 'number') {
            // Round to appropriate decimal places
            if (config && (config.name.includes('Temperature') || config.name.includes('Humidity') || config.name.includes('Pressure'))) {
                formattedValue = Math.round(formattedValue * 10) / 10; // 1 decimal place
            } else {
                formattedValue = Math.round(formattedValue); // Whole number
            }
        }
        const newValue = `${formattedValue} ${sensor.unit || ''}`.trim();
        // Always update, don't check if different (ensures update happens)
        valueElement.textContent = newValue;
    }
    
    // Update sensor status
    const statusElement = sensorItem.querySelector('.sensor-info-status');
    if (statusElement) {
        // Update status text
        const statusText = sensor.status === 'normal' ? 'Normal' 
            : sensor.status === 'warning' ? 'Warning' 
            : 'Critical';
        if (statusElement.textContent !== statusText) {
            statusElement.textContent = statusText;
        }
        
        // Update status class
        const newStatusClass = `sensor-info-status ${sensor.status}`;
        if (statusElement.className !== newStatusClass) {
            statusElement.className = newStatusClass;
        }
        
        // Update status styling
        const statusColor = sensor.status === 'normal' ? '#2e7d32' 
            : sensor.status === 'warning' ? '#e65100' 
            : '#c62828';
        const statusBg = sensor.status === 'normal' ? '#e8f5e9' 
            : sensor.status === 'warning' ? '#fff3e0' 
            : '#ffebee';
        statusElement.style.background = statusBg;
        statusElement.style.color = statusColor;
    }
    
    // Update border color and icon color based on status
    const borderColor = sensor.status === 'normal' ? '#31bf8a' 
        : sensor.status === 'warning' ? '#ffa500' 
        : '#ff4444';
    sensorItem.style.borderLeftColor = borderColor;
    
    // Update icon color
    const iconContainer = sensorItem.querySelector('div[style*="font-size: 1.5rem"]');
    if (iconContainer) {
        iconContainer.style.color = borderColor;
        const iconElement = iconContainer.querySelector('i, span');
        if (iconElement) {
            iconElement.style.color = borderColor;
        }
    }
}

/**
 * Update room sensor modal with latest data (for real-time updates)
 * This function only updates values without recreating the entire modal
 * to preserve scroll position
 */
function updateRoomSensorModal() {
    // Get modal element
    const modal = document.getElementById('roomSensorModal');
    if (!modal) {
        return false;
    }
    
    // Check if modal is visible
    const computedStyle = window.getComputedStyle(modal);
    if (computedStyle.display === 'none') {
        return false;
    }
    
    // Get the stored room data index (set when modal was opened)
    let roomDataIndex = window.selectedRoomDataIndex;
    
    // Get latest sensor data
    if (!window.roomsData || !Array.isArray(window.roomsData) || window.roomsData.length === 0) {
        return false;
    }
    
    // If index not set, try to find it
    if (roomDataIndex === null || roomDataIndex === undefined || roomDataIndex < 0) {
        const roomName = window.selectedRoomNameForModal;
        const roomId = window.selectedRoomIdForModal;
        
        // Try to find by name
        if (roomName) {
            roomDataIndex = window.roomsData.findIndex(r => r && r.name === roomName);
        }
        
        // If still not found, try by floor plan room index
        if (roomDataIndex < 0 && roomId && Array.isArray(rooms)) {
            const floorPlanIndex = rooms.findIndex(r => r && r.id === roomId);
            if (floorPlanIndex >= 0 && floorPlanIndex < window.roomsData.length) {
                roomDataIndex = floorPlanIndex;
            }
        }
        
        // If still not found, use first room as fallback
        if (roomDataIndex < 0 && window.roomsData.length > 0) {
            roomDataIndex = 0;
        }
        
        // Store it for next time
        window.selectedRoomDataIndex = roomDataIndex;
    }
    
    // Get room from floor plan to access deviceId FIRST
    let room = null;
    const roomId = window.selectedRoomIdForModal;
    if (roomId && Array.isArray(rooms)) {
        room = rooms.find(r => r && r.id === roomId);
    }
    
    // If room has deviceId, ALWAYS get latest data DIRECTLY from Firebase (NOT from window.roomsData)
    if (room && room.deviceId) {
        // First try to get from window.devicesData (already synced from Firebase in real-time)
        if (window.getDeviceById) {
            const device = window.getDeviceById(room.deviceId);
            if (device && device.sensors) {
                // Use device sensors DIRECTLY from Firebase - don't use roomData from app.js
                // Create a temporary sensor data object from Firebase device data
                const firebaseSensorData = {};
                Object.keys(device.sensors).forEach(sensorKey => {
                    const deviceSensor = device.sensors[sensorKey];
                    firebaseSensorData[sensorKey] = {
                        value: deviceSensor.value,
                        unit: deviceSensor.unit,
                        status: deviceSensor.status
                    };
                });
                
                // Update sensor values in modal directly from Firebase data
                const allSensorItems = modal.querySelectorAll('.sensor-info-item[data-sensor-key]');
                Object.keys(firebaseSensorData).forEach(sensorKey => {
                    const sensor = firebaseSensorData[sensorKey];
                    const sensorItem = Array.from(allSensorItems).find(item => 
                        item.getAttribute('data-sensor-key') === sensorKey
                    );
                    
                    if (sensorItem) {
                        // Update value
                        const valueElement = sensorItem.querySelector('.sensor-info-value');
                        if (valueElement) {
                            let formattedValue = sensor.value;
                            if (typeof formattedValue === 'number') {
                                if (sensorKey === 'temperature' || sensorKey === 'humidity' || sensorKey === 'pressure') {
                                    formattedValue = Math.round(formattedValue * 10) / 10;
                                } else {
                                    formattedValue = Math.round(formattedValue);
                                }
                            }
                            valueElement.textContent = `${formattedValue} ${sensor.unit || ''}`.trim();
                        }
                        
                        // Update status
                        const statusElement = sensorItem.querySelector('.sensor-info-status');
                        if (statusElement) {
                            const statusText = sensor.status === 'normal' ? 'Normal' 
                                : sensor.status === 'warning' ? 'Warning' 
                                : 'Critical';
                            statusElement.textContent = statusText;
                            statusElement.className = `sensor-info-status ${sensor.status}`;
                            
                            const statusColor = sensor.status === 'normal' ? '#2e7d32' 
                                : sensor.status === 'warning' ? '#e65100' 
                                : '#c62828';
                            const statusBg = sensor.status === 'normal' ? '#e8f5e9' 
                                : sensor.status === 'warning' ? '#fff3e0' 
                                : '#ffebee';
                            statusElement.style.background = statusBg;
                            statusElement.style.color = statusColor;
                        }
                        
                        // Update border color
                        const borderColor = sensor.status === 'normal' ? '#31bf8a' 
                            : sensor.status === 'warning' ? '#ffa500' 
                            : '#ff4444';
                        sensorItem.style.borderLeftColor = borderColor;
                    }
                });
                
                // Update person count if room uses aeronexa-001
                if (room.deviceId && room.deviceId.toLowerCase() === 'aeronexa-001' && device.camera) {
                    const personCount = device.camera.personCount !== undefined ? device.camera.personCount : 0;
                    const personCountElement = document.getElementById('personCountValue');
                    if (personCountElement) {
                        personCountElement.textContent = personCount;
                        const personCountDisplay = personCountElement.parentElement;
                        if (personCountDisplay) {
                            const pluralText = personCountDisplay.querySelector('span:last-child');
                            if (pluralText) {
                                pluralText.textContent = `person${personCount !== 1 ? 's' : ''}`;
                            }
                        }
                    }
                }
                
                return true; // Successfully updated from Firebase
            } else if (window.rtdb && window.rtdbRef && window.rtdbGet) {
                // If device not in window.devicesData, load directly from Firebase
                window.rtdbGet(window.rtdbRef(window.rtdb, `devices/${room.deviceId}`)).then((snapshot) => {
                    if (snapshot.exists()) {
                        const deviceData = snapshot.val();
                        if (deviceData.data_sensor) {
                            const sensors = mapDeviceSensorDataFromFirebaseForRoom(deviceData.data_sensor);
                            if (sensors) {
                                // Update sensor values in modal directly from Firebase data
                                const allSensorItems = modal.querySelectorAll('.sensor-info-item[data-sensor-key]');
                                Object.keys(sensors).forEach(sensorKey => {
                                    const sensor = sensors[sensorKey];
                                    const sensorItem = Array.from(allSensorItems).find(item => 
                                        item.getAttribute('data-sensor-key') === sensorKey
                                    );
                                    
                                    if (sensorItem) {
                                        // Update value
                                        const valueElement = sensorItem.querySelector('.sensor-info-value');
                                        if (valueElement) {
                                            let formattedValue = sensor.value;
                                            if (typeof formattedValue === 'number') {
                                                if (sensorKey === 'temperature' || sensorKey === 'humidity' || sensorKey === 'pressure') {
                                                    formattedValue = Math.round(formattedValue * 10) / 10;
                                                } else {
                                                    formattedValue = Math.round(formattedValue);
                                                }
                                            }
                                            valueElement.textContent = `${formattedValue} ${sensor.unit || ''}`.trim();
                                        }
                                        
                                        // Update status
                                        const statusElement = sensorItem.querySelector('.sensor-info-status');
                                        if (statusElement) {
                                            const statusText = sensor.status === 'normal' ? 'Normal' 
                                                : sensor.status === 'warning' ? 'Warning' 
                                                : 'Critical';
                                            statusElement.textContent = statusText;
                                            statusElement.className = `sensor-info-status ${sensor.status}`;
                                            
                                            const statusColor = sensor.status === 'normal' ? '#2e7d32' 
                                                : sensor.status === 'warning' ? '#e65100' 
                                                : '#c62828';
                                            const statusBg = sensor.status === 'normal' ? '#e8f5e9' 
                                                : sensor.status === 'warning' ? '#fff3e0' 
                                                : '#ffebee';
                                            statusElement.style.background = statusBg;
                                            statusElement.style.color = statusColor;
                                        }
                                        
                                        // Update border color
                                        const borderColor = sensor.status === 'normal' ? '#31bf8a' 
                                            : sensor.status === 'warning' ? '#ffa500' 
                                            : '#ff4444';
                                        sensorItem.style.borderLeftColor = borderColor;
                                    }
                                });
                            }
                        }
                        
                        // Update person count if room uses aeronexa-001
                        if (room.deviceId && room.deviceId.toLowerCase() === 'aeronexa-001' && deviceData.camera) {
                            const personCount = deviceData.camera.personCount !== undefined ? deviceData.camera.personCount : 0;
                            const personCountElement = document.getElementById('personCountValue');
                            if (personCountElement) {
                                personCountElement.textContent = personCount;
                                const personCountDisplay = personCountElement.parentElement;
                                if (personCountDisplay) {
                                    const pluralText = personCountDisplay.querySelector('span:last-child');
                                    if (pluralText) {
                                        pluralText.textContent = `person${personCount !== 1 ? 's' : ''}`;
                                    }
                                }
                            }
                        }
                    }
                }).catch((error) => {
                    console.warn(`[UPDATE MODAL] Error loading device ${room.deviceId} from Firebase:`, error);
                });
                return true; // Firebase call initiated
            } else {
                console.warn(`[UPDATE MODAL] Device ${room.deviceId} not found in window.devicesData and Firebase not available`);
                return false;
            }
        }
        return false; // No deviceId or no Firebase available
    }
    
    // If room has no deviceId, show "--" for all sensors (don't use dummy data from app.js)
    if (!room || !room.deviceId) {
        // Update all sensor values to "--" for unassigned rooms
        const allSensorItems = modal.querySelectorAll('.sensor-info-item[data-sensor-key]');
        allSensorItems.forEach(sensorItem => {
            const valueElement = sensorItem.querySelector('.sensor-info-value');
            if (valueElement) {
                // Get unit from existing text or use empty string
                const currentText = valueElement.textContent;
                const unitMatch = currentText.match(/\s+(.+)$/);
                const unit = unitMatch ? unitMatch[1] : '';
                valueElement.textContent = `-- ${unit}`.trim();
                valueElement.style.color = '#999';
            }
            
            // Update status to "Not Available"
            const statusElement = sensorItem.querySelector('.sensor-info-status');
            if (statusElement) {
                statusElement.textContent = 'Not Available';
                statusElement.className = 'sensor-info-status';
                statusElement.style.background = '#f5f5f5';
                statusElement.style.color = '#999';
            }
            
            // Update border and icon color to gray
            sensorItem.style.borderLeftColor = '#ccc';
            const iconContainer = sensorItem.querySelector('div[style*="font-size: 1.5rem"]');
            if (iconContainer) {
                iconContainer.style.color = '#ccc';
                const iconElement = iconContainer.querySelector('i, span');
                if (iconElement) {
                    iconElement.style.color = '#ccc';
                }
            }
        });
        return true; // Successfully updated to show "--"
    }
    
    // If we reach here, something went wrong
    return false;
    let updatedCount = 0;
    
    // Get all sensor items once
    const allSensorItems = modal.querySelectorAll('.sensor-info-item[data-sensor-key]');
    
    // Update each sensor
    sensorKeys.forEach(sensorKey => {
        const sensor = roomData.sensors[sensorKey];
        if (!sensor || sensor.value === undefined || sensor.value === null) {
            return;
        }
        
        // Find sensor item from the list
        let sensorItem = null;
        for (let item of allSensorItems) {
            if (item.getAttribute('data-sensor-key') === sensorKey) {
                sensorItem = item;
                break;
            }
        }
        
        if (!sensorItem) {
            return; // Sensor item not found
        }
        
        // Find value element - direct query
        const valueElement = sensorItem.querySelector('.sensor-info-value');
        if (!valueElement) {
            return; // Value element not found
        }
        
        // Format value
        let formattedValue = sensor.value;
        if (typeof formattedValue === 'number') {
            if (sensorKey === 'temperature' || sensorKey === 'humidity' || sensorKey === 'pressure') {
                formattedValue = Math.round(formattedValue * 10) / 10;
            } else {
                formattedValue = Math.round(formattedValue);
            }
        }
        
        // FORCE UPDATE - always update to ensure real-time feel
        const newText = `${formattedValue} ${sensor.unit || ''}`.trim();
        const oldText = valueElement.textContent;
        
        // Update value silently - no logging to reduce console spam
        
        // Always update textContent (ensures DOM refresh)
        valueElement.textContent = newText;
        
        updatedCount++;
        
        updatedCount++;
        
        // Update status element
        const statusElement = sensorItem.querySelector('.sensor-info-status');
        if (statusElement) {
            const statusText = sensor.status === 'normal' ? 'Normal' 
                : sensor.status === 'warning' ? 'Warning' 
                : 'Critical';
            
            // Always update status text (ensures real-time update)
            statusElement.textContent = statusText;
            statusElement.className = `sensor-info-status ${sensor.status}`;
            
            // Update status colors
            const statusColor = sensor.status === 'normal' ? '#2e7d32' 
                : sensor.status === 'warning' ? '#e65100' 
                : '#c62828';
            const statusBg = sensor.status === 'normal' ? '#e8f5e9' 
                : sensor.status === 'warning' ? '#fff3e0' 
                : '#ffebee';
            statusElement.style.background = statusBg;
            statusElement.style.color = statusColor;
        }
        
        // Update border and icon color
        const borderColor = sensor.status === 'normal' ? '#31bf8a' 
            : sensor.status === 'warning' ? '#ffa500' 
            : '#ff4444';
        sensorItem.style.borderLeftColor = borderColor;
        
        // Update icon color
        const iconContainer = sensorItem.querySelector('div[style*="font-size: 1.5rem"]');
        if (iconContainer) {
            iconContainer.style.color = borderColor;
            const iconElement = iconContainer.querySelector('i');
            if (iconElement) {
                iconElement.style.color = borderColor;
            }
        }
        
        updatedCount++;
    });
    
    // Restore scroll position
    if (modalBody) {
        modalBody.scrollTop = scrollTop;
    }
    
    return updatedCount > 0;
}

/**
 * Close room edit modal
 */
function closeRoomEditModal() {
    const modal = document.getElementById('roomEditModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Close device dropdown if open
    const dropdown = document.getElementById('deviceDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    
    selectedRoomId = null;
    // Clean up stored room data for star button functionality
    window.selectedRoomId = null;
    window.currentEditingRoomName = null;
}

// Export immediately after definition to ensure availability
window.closeRoomEditModal = closeRoomEditModal;

/**
 * Show room edit dialog (edit name or delete room)
 */
function showRoomEditDialog(room, svg) {
    selectedRoomId = room.id;
    
    // Store current editing room name and ID for star button functionality
    window.currentEditingRoomName = room.name;
    window.selectedRoomId = room.id;
    
    // Create or get modal
    let modal = document.getElementById('roomEditModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'roomEditModal';
        modal.className = 'room-edit-modal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            justify-content: center;
            align-items: center;
        `;
        document.body.appendChild(modal);
    }
    
    // Calculate room size (for rectangle or polygon)
    let roomSizeText = 'N/A';
    if (room.width && room.height) {
        // Rectangle room
        const widthMeters = pixelsToMeters(room.width);
        const heightMeters = pixelsToMeters(room.height);
        roomSizeText = `${formatMeasurement(widthMeters)} × ${formatMeasurement(heightMeters)}`;
    } else if (room.bbox && room.bbox.width && room.bbox.height) {
        // Polygon room with bbox
        const widthMeters = pixelsToMeters(room.bbox.width);
        const heightMeters = pixelsToMeters(room.bbox.height);
        roomSizeText = `${formatMeasurement(widthMeters)} × ${formatMeasurement(heightMeters)}`;
    } else if (room.points && room.points.length >= 3) {
        // Polygon room - calculate bounding box from points
        const xs = room.points.map(p => p.x);
        const ys = room.points.map(p => p.y);
        const width = Math.max(...xs) - Math.min(...xs);
        const height = Math.max(...ys) - Math.min(...ys);
        const widthMeters = pixelsToMeters(width);
        const heightMeters = pixelsToMeters(height);
        roomSizeText = `${formatMeasurement(widthMeters)} × ${formatMeasurement(heightMeters)}`;
    }
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; color: #333;">Edit Room</h3>
                <button onclick="closeRoomEditModal()" style="
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #666;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="margin-bottom: 1.5rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: #666; font-weight: 500;">Room Name:</label>
                <input type="text" id="roomEditNameInput" value="${room.name}" style="
                    width: 100%;
                    padding: 0.75rem;
                    border: 2px solid #ddd;
                    border-radius: 6px;
                    font-size: 1rem;
                    box-sizing: border-box;
                ">
            </div>
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f5f5f5; border-radius: 6px;">
                <p style="margin: 0; color: #666; font-size: 0.9rem;">
                    <strong>Size:</strong> ${roomSizeText}
                </p>
            </div>
            <div style="margin-bottom: 1.5rem; position: relative;">
                <label style="display: block; margin-bottom: 0.5rem; color: #666; font-weight: 500;">Device:</label>
                <div style="position: relative;">
                    <input type="text" id="roomDeviceInput" value="${room.deviceId ? room.deviceId.toUpperCase() : 'Not assigned'}" readonly style="
                        width: 100%;
                        padding: 0.75rem 2.5rem 0.75rem 0.75rem;
                        border: 2px solid #ddd;
                        border-radius: 6px;
                        font-size: 1rem;
                        box-sizing: border-box;
                        background: #f9f9f9;
                        cursor: pointer;
                    ">
                    <i class="fas fa-chevron-down" style="
                        position: absolute;
                        right: 0.75rem;
                        top: 50%;
                        transform: translateY(-50%);
                        color: #666;
                        pointer-events: none;
                        font-size: 0.875rem;
                    "></i>
                    <div id="deviceDropdown" style="
                        display: none;
                        position: absolute;
                        top: 100%;
                        left: 0;
                        right: 0;
                        background: white;
                        border: 2px solid #ddd;
                        border-radius: 6px;
                        margin-top: 4px;
                        max-height: 300px;
                        overflow-y: auto;
                        z-index: 1000;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    ">
                        <!-- Device list will be populated here -->
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 1rem;">
                <button onclick="saveRoomEdit()" style="
                    flex: 1;
                    padding: 0.75rem;
                    background: #31bf8a;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                ">
                    <i class="fas fa-save"></i> Save
                </button>
                <button onclick="deleteRoom()" style="
                    flex: 1;
                    padding: 0.75rem;
                    background: #f44336;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                ">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Update star button state based on current realtime room
    setTimeout(() => {
        const input = document.getElementById('roomEditNameInput');
        if (input) {
            input.focus();
            input.select();
        }
        
        // Update device input with current device
        const deviceInput = document.getElementById('roomDeviceInput');
        if (deviceInput && room.deviceId) {
            deviceInput.value = room.deviceId.toUpperCase();
        } else if (deviceInput) {
            deviceInput.value = 'Not assigned';
        }
        
        // Add event listener to device input for dropdown
        if (deviceInput) {
            // Remove existing listeners to avoid duplicates
            const newInput = deviceInput.cloneNode(true);
            deviceInput.parentNode.replaceChild(newInput, deviceInput);
            
            // Add click event listener
            newInput.addEventListener('click', () => {
                if (window.showDeviceDropdown) {
                    window.showDeviceDropdown(room.id);
                } else {
                    console.error('showDeviceDropdown function not available');
                }
            });
        }
        
        // Sync device sensor data to room when device is selected
        if (room.deviceId) {
            syncDeviceSensorDataToRoom(room);
            // If device is aeronexa-001, set up realtime data
            if (room.deviceId === 'aeronexa-001') {
                setupRealtimeDataForRoom(room);
            }
        }
    }, 100);
}

/**
 * Update the realtime star button appearance based on current selection
 */
function updateRealtimeStarButton() {
    const starBtn = document.getElementById('realtimeStarBtn');
    if (!starBtn) return;
    
    // Get room name and ID from modal or stored values
    const roomName = document.getElementById('roomEditNameInput')?.value || window.currentEditingRoomName;
    const roomId = window.selectedRoomId || selectedRoomId;
    
    if (!roomName || !window.roomsData) return;
    
    // Find room using multiple methods (same as updateRoomStatus)
    // This function always returns a room as fallback if roomsData is not empty
    const roomsDataRoom = findRoomInRoomsData(roomName, roomId);
    if (!roomsDataRoom) {
        // If roomsData is empty, disable star button
        starBtn.style.color = '#ddd';
        starBtn.title = 'No sensor data available';
        return;
    }
    
    // Check if this room is the one using realtime data
    const currentRealtimeRoomId = window.getRealtimeSensorRoomId ? window.getRealtimeSensorRoomId() : 1;
    const isRealtimeRoom = roomsDataRoom.id === currentRealtimeRoomId;
    
    // Update star button appearance
    if (isRealtimeRoom) {
        starBtn.style.color = '#ffc107'; // Yellow/Gold color for active star
        starBtn.title = 'This room uses Realtime Database data (Click to disable)';
    } else {
        starBtn.style.color = '#ddd'; // Gray color for inactive star
        starBtn.title = 'Click to use Realtime Database data for this room';
    }
}

/**
 * Toggle realtime database usage for current room
 * Only one room can use realtime data at a time (like favorite system)
 */
function toggleRealtimeStar() {
    // Get room name and ID from modal or stored values
    const roomName = document.getElementById('roomEditNameInput')?.value || window.currentEditingRoomName;
    const roomId = window.selectedRoomId || selectedRoomId;
    
    if (!roomName || !window.roomsData) {
        showToast('Room data not found', 'error');
        return;
    }
    
    // Find room in roomsData using multiple methods (same as updateRoomStatus)
    const roomsDataRoom = findRoomInRoomsData(roomName, roomId);
    if (!roomsDataRoom) {
        // If room not found, show helpful message
        showToast(`Room "${roomName}" not found in sensor data. Using first available room.`, 'warning');
        // Use first room as fallback
        if (window.roomsData && window.roomsData.length > 0 && window.setRealtimeSensorRoom) {
            window.setRealtimeSensorRoom(window.roomsData[0].id);
            showToast(`Realtime data set to ${window.roomsData[0].name}`, 'info');
        }
        updateRealtimeStarButton();
        return;
    }
    
    // Check if this room is already using realtime data
    const currentRealtimeRoomId = window.getRealtimeSensorRoomId ? window.getRealtimeSensorRoomId() : 1;
    const isCurrentlyRealtime = roomsDataRoom.id === currentRealtimeRoomId;
    
    if (isCurrentlyRealtime) {
        // Currently using realtime, user wants to disable it
        // When disabling, set to room 1 as default (first room)
        // This ensures at least one room is always using realtime data by default
        if (window.roomsData && window.roomsData.length > 0 && window.setRealtimeSensorRoom) {
            // If room 1 is the same as current room, find a different room
            if (roomsDataRoom.id === 1 && window.roomsData.length > 1) {
                // Set to second room instead
                window.setRealtimeSensorRoom(window.roomsData[1].id);
                showToast(`Realtime data moved to ${window.roomsData[1].name}`, 'info');
            } else {
                // Set to room 1 as default
                window.setRealtimeSensorRoom(1);
                showToast(`Realtime data disabled for ${roomName}`, 'info');
            }
        }
    } else {
        // Currently not using realtime, user wants to enable it for this room
        // This will automatically disable realtime for the previous room (only one at a time)
        if (window.setRealtimeSensorRoom) {
            window.setRealtimeSensorRoom(roomsDataRoom.id);
            
            // Find which room was using realtime before and show message
            const previousRealtimeRoom = window.roomsData.find(r => r.id === currentRealtimeRoomId);
            if (previousRealtimeRoom && previousRealtimeRoom.id !== roomsDataRoom.id) {
                showToast(`Realtime data moved from ${previousRealtimeRoom.name} to ${roomsDataRoom.name}`, 'success');
            } else {
                showToast(`Realtime data enabled for ${roomsDataRoom.name}`, 'success');
            }
        }
    }
    
    // Update star button appearance
    updateRealtimeStarButton();
}

/**
 * Save room edit
 */
function saveRoomEdit() {
    const input = document.getElementById('roomEditNameInput');
    if (!input) return;
    
    const oldName = window.currentEditingRoomName;
    const newName = input.value.trim();
    if (!newName) {
        showToast('Room name cannot be empty', 'error');
        return;
    }
    
    const roomIndex = rooms.findIndex(r => r.id === selectedRoomId);
    if (roomIndex > -1) {
        rooms[roomIndex].name = newName;
        // Device ID is already updated when device is selected
        const svg = document.getElementById('floorPlanCanvas');
        if (svg) {
            renderRoom(rooms[roomIndex], svg);
            saveCurrentFloorPlan();
        }
        
        // Update room data name if exists
        if (window.roomsData && oldName) {
            const roomsDataRoom = window.roomsData.find(r => r.name === oldName);
            if (roomsDataRoom) {
                roomsDataRoom.name = newName;
                window.roomsData = window.roomsData; // Trigger update
            }
        }
        
        // Sync device sensor data if room has device assigned
        if (rooms[roomIndex].deviceId) {
            syncDeviceSensorDataToRoom(rooms[roomIndex]);
            // Update room status
            updateRoomStatus(rooms[roomIndex]);
            renderRoom(rooms[roomIndex], svg);
        }
    }
    
    closeRoomEditModal();
}

/**
 * Delete room
 */
function deleteRoom() {
    if (!confirm('Are you sure you want to delete this room?')) {
        return;
    }
    
    const roomIndex = rooms.findIndex(r => r.id === selectedRoomId);
    if (roomIndex > -1) {
        const room = rooms[roomIndex];
        
        // Unassign device if room has a device assigned
        if (room.deviceId && window.unassignDeviceFromRoom) {
            window.unassignDeviceFromRoom(room.deviceId);
        }
        
        rooms.splice(roomIndex, 1);
        renderFloorPlan();
        saveCurrentFloorPlan();
        showToast('Room deleted successfully', 'success');
    }
    
    closeRoomEditModal();
}

/**
 * Show device dropdown list (simple list of device IDs)
 */
function showDeviceDropdown(roomId) {
    // Get current room
    const room = rooms.find(r => r.id === roomId);
    if (!room) {
        showToast('Room not found', 'error');
        return;
    }
    
    // Get devices data
    const devices = window.devicesData || [];
    if (devices.length === 0) {
        showToast('No devices available', 'error');
        return;
    }
    
    // Get dropdown element
    const dropdown = document.getElementById('deviceDropdown');
    if (!dropdown) return;
    
    // Toggle dropdown visibility
    const isVisible = dropdown.style.display === 'block';
    if (isVisible) {
        dropdown.style.display = 'none';
        return;
    }
    
    // Build device list HTML (only device IDs)
    let deviceListHTML = '';
    
    devices.forEach(device => {
        const isAssigned = device.assignedToRoom !== null && device.assignedToRoom !== roomId;
        const isSelected = device.id === room.deviceId;
        const assignedClass = isAssigned ? 'assigned' : '';
        const selectedClass = isSelected ? 'selected' : '';
        
        // Only show device ID, not full name
        const deviceId = device.id.toUpperCase();
        
        deviceListHTML += `
            <div class="device-dropdown-item ${assignedClass} ${selectedClass}" 
                 data-device-id="${device.id}"
                 onclick="${isAssigned ? '' : `selectDeviceFromDropdown('${device.id}', '${roomId}')`}"
                 style="
                     padding: 12px 16px;
                     cursor: ${isAssigned ? 'not-allowed' : 'pointer'};
                     border-bottom: 1px solid #f0f0f0;
                     background: ${isSelected ? 'rgba(49, 191, 138, 0.1)' : isAssigned ? '#f5f5f5' : 'white'};
                     opacity: ${isAssigned ? '0.6' : '1'};
                     transition: background 0.2s ease;
                 "
                 onmouseover="if (!this.classList.contains('assigned')) this.style.background='#f9f9f9'"
                 onmouseout="if (!this.classList.contains('assigned')) this.style.background='${isSelected ? 'rgba(49, 191, 138, 0.1)' : 'white'}'">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: ${isSelected ? '700' : '500'}; color: ${isAssigned ? '#999' : '#333'};">
                        ${deviceId}
                    </span>
                    ${isAssigned ? '<span style="font-size: 11px; color: #999;">Assigned</span>' : ''}
                    ${isSelected ? '<i class="fas fa-check" style="color: #31bf8a;"></i>' : ''}
                </div>
            </div>
        `;
    });
    
    // Add "Not assigned" option at the top
    deviceListHTML = `
        <div class="device-dropdown-item" 
             onclick="selectDeviceFromDropdown(null, '${roomId}')"
             style="
                 padding: 12px 16px;
                 cursor: pointer;
                 border-bottom: 1px solid #f0f0f0;
                 background: ${!room.deviceId ? 'rgba(49, 191, 138, 0.1)' : 'white'};
                 transition: background 0.2s ease;
             "
             onmouseover="this.style.background='#f9f9f9'"
             onmouseout="this.style.background='${!room.deviceId ? 'rgba(49, 191, 138, 0.1)' : 'white'}'">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: ${!room.deviceId ? '700' : '500'}; color: #666;">
                    Not assigned
                </span>
                ${!room.deviceId ? '<i class="fas fa-check" style="color: #31bf8a;"></i>' : ''}
            </div>
        </div>
    ` + deviceListHTML;
    
    dropdown.innerHTML = deviceListHTML;
    dropdown.style.display = 'block';
    
    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
        if (!dropdown.contains(e.target) && e.target.id !== 'roomDeviceInput') {
            dropdown.style.display = 'none';
            document.removeEventListener('click', closeDropdown);
        }
    };
    
    // Use setTimeout to avoid immediate close
    setTimeout(() => {
        document.addEventListener('click', closeDropdown);
    }, 100);
}

// Export immediately after definition to ensure availability
window.showDeviceDropdown = showDeviceDropdown;

/**
 * Select device from dropdown
 */
function selectDeviceFromDropdown(deviceId, roomId) {
    // Get room
    const room = rooms.find(r => r.id === roomId);
    if (!room) {
        showToast('Room not found', 'error');
        return;
    }
    
    // Close dropdown
    const dropdown = document.getElementById('deviceDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    
    // If deviceId is null, unassign device
    if (!deviceId) {
        if (!room.deviceId) {
            showToast('No device assigned to this room', 'info');
            return;
        }
        
        // Unassign device
        if (window.unassignDeviceFromRoom) {
            window.unassignDeviceFromRoom(room.deviceId);
        }
        
        room.deviceId = null;
        
        // Update device input
        const deviceInput = document.getElementById('roomDeviceInput');
        if (deviceInput) {
            deviceInput.value = 'Not assigned';
        }
        
        // Save floor plan
        saveCurrentFloorPlan();
        
        // Refresh modal to update UI
        showRoomEditDialog(room, document.getElementById('floorPlanCanvas'));
        
        showToast('Device unassigned from room', 'success');
        return;
    }
    
    // Check if device is available
    if (!window.isDeviceAssigned || !window.assignDeviceToRoom) {
        showToast('Device management not available', 'error');
        return;
    }
    
    // Check if device is already assigned to another room
    if (window.isDeviceAssigned(deviceId)) {
        const device = window.getDeviceById ? window.getDeviceById(deviceId) : null;
        if (device && device.assignedToRoom !== roomId) {
            showToast(`Device is already assigned to ${device.assignedToRoomName}`, 'error');
            return;
        }
    }
    
    // Unassign previous device if room had one
    if (room.deviceId && room.deviceId !== deviceId) {
        if (window.unassignDeviceFromRoom) {
            window.unassignDeviceFromRoom(room.deviceId);
        }
    }
    
    // Assign new device
    const result = window.assignDeviceToRoom(deviceId, roomId, room.name);
    if (result.success) {
        // Update room with device ID
        room.deviceId = deviceId;
        
        // Sync device sensor data to room
        syncDeviceSensorDataToRoom(room);
        
        // If device is aeronexa-001, set up realtime data listener for this room
        if (deviceId === 'aeronexa-001') {
            setupRealtimeDataForRoom(room);
        }
        
        // Update device input
        const deviceInput = document.getElementById('roomDeviceInput');
        if (deviceInput) {
            deviceInput.value = deviceId.toUpperCase();
        }
        
        // Save floor plan
        saveCurrentFloorPlan();
        
        // Refresh modal to update UI
        showRoomEditDialog(room, document.getElementById('floorPlanCanvas'));
        
        // Update room status and render
        const svg = document.getElementById('floorPlanCanvas');
        if (svg) {
            updateRoomStatus(room);
            renderRoom(room, svg);
        }
        
        showToast(`Device ${deviceId.toUpperCase()} assigned to ${room.name}`, 'success');
    } else {
        showToast(result.message || 'Failed to assign device', 'error');
    }
}

// Export immediately after definition to ensure availability
window.selectDeviceFromDropdown = selectDeviceFromDropdown;

/**
 * Show device selection modal
 */
function showDeviceSelectionModal(roomId) {
    // Get current room
    const room = rooms.find(r => r.id === roomId);
    if (!room) {
        showToast('Room not found', 'error');
        return;
    }
    
    // Create or get modal
    let modal = document.getElementById('deviceSelectionModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'deviceSelectionModal';
        modal.className = 'device-selection-modal';
        document.body.appendChild(modal);
    }
    
    // Get devices data
    const devices = window.devicesData || [];
    const currentDeviceId = room.deviceId;
    
    // Count devices by status
    const totalDevices = devices.length;
    const availableDevices = devices.filter(d => d.assignedToRoom === null || d.assignedToRoom === roomId).length;
    const assignedDevices = devices.filter(d => d.assignedToRoom !== null && d.assignedToRoom !== roomId).length;
    
    // Create device ID list summary (all device IDs like in devices.html)
    const deviceIdList = devices.map(d => d.id.toUpperCase()).join(', ');
    
    // Build device list HTML
    let deviceListHTML = '';
    
    // Add summary header with all device IDs
    deviceListHTML += `
        <div style="margin-bottom: 16px; padding: 12px; background: #f5f5f5; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 14px; font-weight: 600; color: #333;">Total Devices: ${totalDevices}</span>
                <span style="font-size: 12px; color: #666;">Available: ${availableDevices} | Assigned: ${assignedDevices}</span>
            </div>
            <div style="font-size: 11px; color: #666; line-height: 1.4;">
                <strong>Device IDs:</strong> ${deviceIdList}
            </div>
        </div>
    `;
    
    devices.forEach(device => {
        const isAssigned = device.assignedToRoom !== null && device.assignedToRoom !== roomId;
        const isSelected = device.id === currentDeviceId;
        const assignedClass = isAssigned ? 'assigned' : '';
        const selectedClass = isSelected ? 'selected' : '';
        
        let badgeHTML = '';
        if (isAssigned) {
            badgeHTML = '<span class="device-selection-item-badge assigned">Assigned</span>';
        } else if (device.isRealtime) {
            badgeHTML = '<span class="device-selection-item-badge realtime">Real-time</span>';
        } else {
            badgeHTML = '<span class="device-selection-item-badge available">Available</span>';
        }
        
        const assignedInfo = isAssigned && device.assignedToRoomName 
            ? `<div class="device-selection-item-info">Assigned to: ${device.assignedToRoomName}</div>`
            : '';
        
        // Show device ID prominently (same format as devices.html)
        const deviceIdDisplay = device.id.toUpperCase();
        
        deviceListHTML += `
            <div class="device-selection-item ${assignedClass} ${selectedClass}" 
                 data-device-id="${device.id}"
                 onclick="${isAssigned ? '' : `selectDevice('${device.id}', '${roomId}')`}"
                 style="cursor: ${isAssigned ? 'not-allowed' : 'pointer'}">
                <div class="device-selection-item-header">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="device-selection-item-name">${device.name}</span>
                        <span style="font-size: 12px; color: #666; font-weight: 500;">Device ID: ${deviceIdDisplay}</span>
                    </div>
                    ${badgeHTML}
                </div>
                ${assignedInfo}
            </div>
        `;
    });
    
    modal.innerHTML = `
        <div class="device-selection-modal-content">
            <div class="device-selection-modal-header">
                <h3>Select Device for ${room.name}</h3>
                <button class="device-selection-modal-close" onclick="closeDeviceSelectionModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="device-selection-modal-body">
                <div class="device-selection-list">
                    ${deviceListHTML}
                </div>
            </div>
            <div class="device-selection-modal-footer">
                <button class="device-selection-btn device-selection-btn-cancel" onclick="closeDeviceSelectionModal()">
                    Cancel
                </button>
                ${currentDeviceId ? `
                <button class="device-selection-btn device-selection-btn-select" onclick="unassignDeviceFromRoom('${roomId}')">
                    Unassign
                </button>
                ` : ''}
            </div>
        </div>
    `;
    
    modal.classList.add('show');
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeDeviceSelectionModal();
        }
    });
}

/**
 * Select device for room
 */
function selectDevice(deviceId, roomId) {
    // Get room
    const room = rooms.find(r => r.id === roomId);
    if (!room) {
        showToast('Room not found', 'error');
        return;
    }
    
    // Check if device is available
    if (!window.isDeviceAssigned || !window.assignDeviceToRoom) {
        showToast('Device management not available', 'error');
        return;
    }
    
    // Check if device is already assigned to another room
    if (window.isDeviceAssigned(deviceId)) {
        const device = window.getDeviceById ? window.getDeviceById(deviceId) : null;
        if (device && device.assignedToRoom !== roomId) {
            showToast(`Device is already assigned to ${device.assignedToRoomName}`, 'error');
            return;
        }
    }
    
    // Unassign previous device if room had one
    if (room.deviceId && room.deviceId !== deviceId) {
        if (window.unassignDeviceFromRoom) {
            window.unassignDeviceFromRoom(room.deviceId);
        }
    }
    
    // Assign new device
    const result = window.assignDeviceToRoom(deviceId, roomId, room.name);
    if (result.success) {
        // Update room with device ID
        room.deviceId = deviceId;
        
        // Update device input in edit modal
        const deviceInput = document.getElementById('roomDeviceInput');
        if (deviceInput) {
            const device = window.getDeviceById ? window.getDeviceById(deviceId) : null;
            deviceInput.value = device ? device.name : deviceId;
        }
        
        // Save floor plan
        saveCurrentFloorPlan();
        
        // Close device selection modal
        closeDeviceSelectionModal();
        
        showToast(`Device ${deviceId} assigned to ${room.name}`, 'success');
    } else {
        showToast(result.message || 'Failed to assign device', 'error');
    }
}

/**
 * Unassign device from room
 */
function unassignDeviceFromRoom(roomId) {
    // Get room
    const room = rooms.find(r => r.id === roomId);
    if (!room) {
        showToast('Room not found', 'error');
        return;
    }
    
    if (!room.deviceId) {
        showToast('No device assigned to this room', 'info');
        // Close device selection modal if it's open
        const modal = document.getElementById('deviceSelectionModal');
        if (modal) {
            closeDeviceSelectionModal();
        }
        return;
    }
    
    // Unassign device
    if (window.unassignDeviceFromRoom) {
        window.unassignDeviceFromRoom(room.deviceId);
    }
    
    // Remove device from room
    room.deviceId = null;
    
    // Update device input in edit modal
    const deviceInput = document.getElementById('roomDeviceInput');
    if (deviceInput) {
        deviceInput.value = 'Not assigned';
    }
    
    // Save floor plan
    saveCurrentFloorPlan();
    
    // Close device selection modal if it's open
    const modal = document.getElementById('deviceSelectionModal');
    if (modal) {
        closeDeviceSelectionModal();
    }
    
    // Refresh modal to update UI (hide Remove button)
    const svg = document.getElementById('floorPlanCanvas');
    if (svg) {
        showRoomEditDialog(room, svg);
    }
    
    showToast('Device unassigned from room', 'success');
}

/**
 * Close device selection modal
 */
function closeDeviceSelectionModal() {
    const modal = document.getElementById('deviceSelectionModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

/**
 * Update all room statuses
 */
function updateAllRoomStatuses() {
    const svg = document.getElementById('floorPlanCanvas');
    if (!svg) return;
    
    const isDashboard = document.getElementById('editFloorBtn');
    if (!isDashboard) return; // Only update in dashboard mode
    
    // Update and re-render all rooms to show latest sensor values
    rooms.forEach(room => {
        updateRoomStatus(room);
        renderRoom(room, svg);
    });
}

/**
 * Get all rooms from current floor plan
 * Used by app.js to sync device data to rooms
 */
function getAllRoomsFromFloorPlan() {
    if (floorPlanData.currentFloorIndex < 0 || !floorPlanData.floors[floorPlanData.currentFloorIndex]) {
        return [];
    }
    return rooms || [];
}

/**
 * Sync device data to all rooms that use a specific device
 * Called when device data changes in Firebase
 */
function syncDeviceToAllRooms(deviceId) {
    if (!deviceId) return;
    
    // Get all rooms from current floor plan
    const allRooms = getAllRoomsFromFloorPlan();
    
    // Sync device data to each room that uses this device
    allRooms.forEach(room => {
        if (room.deviceId === deviceId) {
            syncDeviceSensorDataToRoom(room);
        }
    });
    
    // Update all room statuses to reflect changes
    updateAllRoomStatuses();
}

// Export functions to window
window.restoreDeviceAssignments = restoreDeviceAssignments;
window.syncDeviceSensorDataToRoom = syncDeviceSensorDataToRoom;
window.syncDeviceToAllRooms = syncDeviceToAllRooms;
window.getAllRoomsFromFloorPlan = getAllRoomsFromFloorPlan;
window.setupRealtimeDataForRoom = setupRealtimeDataForRoom;
window.initFloorPlanEditor = initFloorPlanEditor;
window.showCreateFloorModal = showCreateFloorModal;
window.onFloorSelectorChange = onFloorSelectorChange;
window.toggleDrawingMode = toggleDrawingMode;
// closeRoomEditModal already exported above after function definition
window.toggleRealtimeStar = toggleRealtimeStar;
window.saveRoomEdit = saveRoomEdit;
window.deleteRoom = deleteRoom;
window.saveCurrentFloorPlan = saveCurrentFloorPlan;
window.updateAllRoomStatuses = updateAllRoomStatuses;
window.updateRoomSensorModal = updateRoomSensorModal;
window.setDrawingTool = setDrawingTool;
window.showRenameFloorDialog = showRenameFloorDialog;
window.saveRenameFloor = saveRenameFloor;
window.closeRenameFloorModal = closeRenameFloorModal;
window.saveRoomNameInput = saveRoomNameInput;
window.closeRoomNameInputModal = closeRoomNameInputModal;
window.saveCreateFloor = saveCreateFloor;
window.closeCreateFloorModal = closeCreateFloorModal;
window.showRoomSensorInfo = showRoomSensorInfo;
window.closeRoomSensorModal = closeRoomSensorModal;
window.handleStreamError = handleStreamError;
window.isLocalIP = isLocalIP;
window.initializeCameraStreamListener = initializeCameraStreamListener;
window.updateCameraStream = updateCameraStream;
window.hideCameraStream = hideCameraStream;
window.cleanupCameraStreamListener = cleanupCameraStreamListener;
window.setupModalSensorListener = setupModalSensorListener;
window.cleanupModalSensorListener = cleanupModalSensorListener;
window.showDeviceDropdown = showDeviceDropdown;
window.selectDeviceFromDropdown = selectDeviceFromDropdown;

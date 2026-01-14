/**
 * AI Chat Module
 * Handles chat interface and Gemini API integration
 */

// Gemini API Configuration
// Load from config.js if available, otherwise use fallback values
// IMPORTANT: Create config.js from config.example.js and add your actual API keys
let GEMINI_API_KEY;
let GEMINI_API_URL;

if (window.GEMINI_API_KEY && window.GEMINI_API_URL) {
    // Use configuration from config.js
    GEMINI_API_KEY = window.GEMINI_API_KEY;
    GEMINI_API_URL = window.GEMINI_API_URL;
    console.log('[AI Chat] Using Gemini API configuration from config.js');
} else {
    // Fallback configuration (for development/testing only)
    // In production, always use config.js with actual credentials
    console.warn('[AI Chat] WARNING: config.js not found! Using fallback configuration.');
    console.warn('[AI Chat] Please create config.js from config.example.js with your actual API keys.');
    
    GEMINI_API_KEY = 'AIzaSyAY-m56jzGmR83jJlMYAT82y41FRtdo78Q';
    GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
}

// State - Using stable model automatically
const selectedModel = 'models/gemini-2.5-flash'; // Stable version of Gemini 2.5 Flash
let chatHistory = [];
let firebaseData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeAIChat();
});

/**
 * Initialize AI Chat
 */
async function initializeAIChat() {
    // Using stable model: models/gemini-2.5-flash (automatically selected)
    console.log('[AI CHAT] Using stable model:', selectedModel);
    
    // Load Firebase data (wait for Firebase to be ready)
    if (window.rtdb && window.rtdbRef && window.rtdbGet) {
        await loadFirebaseData();
    } else {
        // Wait for Firebase to be ready
        let attempts = 0;
        const maxAttempts = 25; // 5 seconds
        const checkInterval = setInterval(() => {
            attempts++;
            if (window.rtdb && window.rtdbRef && window.rtdbGet) {
                clearInterval(checkInterval);
                loadFirebaseData().then(() => {
                    generateSuggestedQuestions();
                });
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.warn('[AI CHAT] Firebase not available, continuing without data');
                generateSuggestedQuestions();
            }
        }, 200);
    }
    
    // Generate suggested questions
    generateSuggestedQuestions();
    
    // Setup event listeners
    setupEventListeners();
    
    // Auto-resize textarea
    setupTextareaAutoResize();
}

// Model selector removed - using stable model automatically

/**
 * Load data from Firebase Realtime Database
 */
async function loadFirebaseData() {
    try {
        if (!window.rtdb || !window.rtdbRef || !window.rtdbGet) {
            console.warn('Firebase Realtime Database not available');
            return;
        }
        
        // Load devices data
        const devicesRef = window.rtdbRef(window.rtdb, 'devices');
        const devicesSnapshot = await window.rtdbGet(devicesRef);
        
        const devices = {};
        if (devicesSnapshot.exists()) {
            // Get devices data from snapshot
            const devicesData = devicesSnapshot.val();
            Object.keys(devicesData).forEach(deviceId => {
                devices[deviceId] = devicesData[deviceId];
            });
        }
        
        // Load analytics data (last 24 hours)
        const analyticsRef = window.rtdbRef(window.rtdb, 'analytics');
        const analyticsSnapshot = await window.rtdbGet(analyticsRef);
        
        let analytics = {};
        if (analyticsSnapshot.exists()) {
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            const analyticsData = analyticsSnapshot.val();
            analytics = {
                today: analyticsData[today] || {},
                yesterday: analyticsData[yesterdayStr] || {}
            };
        }
        
        firebaseData = {
            devices,
            analytics,
            timestamp: new Date().toISOString()
        };
        
        console.log('[AI CHAT] Firebase data loaded:', {
            deviceCount: Object.keys(devices).length,
            analyticsDates: Object.keys(analytics)
        });
        
    } catch (error) {
        console.error('[AI CHAT] Error loading Firebase data:', error);
    }
}

/**
 * Generate suggested questions based on Firebase data
 */
function generateSuggestedQuestions() {
    const suggestedQuestionsGrid = document.getElementById('suggestedQuestionsGrid');
    if (!suggestedQuestionsGrid) return;
    
    // Only 4 best questions for better user experience
    const questions = [
        {
            icon: 'fa-chart-line',
            text: 'What is the current air quality status?',
            query: 'What is the current air quality status across all devices?',
            colorClass: 'question-blue'
        },
        {
            icon: 'fa-exclamation-triangle',
            text: 'Are there any rooms with warnings?',
            query: 'Are there any rooms or devices showing warning or critical status? List them.',
            colorClass: 'question-orange'
        },
        {
            icon: 'fa-thermometer-half',
            text: 'What is the average temperature?',
            query: 'What is the average temperature across all devices?',
            colorClass: 'question-red'
        },
        {
            icon: 'fa-microchip',
            text: 'How many devices are online?',
            query: 'How many devices are currently online? List all online devices.',
            colorClass: 'question-green'
        }
    ];
    
    suggestedQuestionsGrid.innerHTML = '';
    questions.forEach((q, index) => {
        const button = document.createElement('button');
        button.className = `suggested-question-btn ${q.colorClass}`;
        button.innerHTML = `
            <i class="fas ${q.icon}"></i>
            <span>${q.text}</span>
        `;
        button.onclick = () => {
            document.getElementById('chatInput').value = q.query;
            sendMessage();
        };
        suggestedQuestionsGrid.appendChild(button);
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    
    // Send on Enter (Shift+Enter for new line)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Send button click
    if (sendButton) {
        sendButton.onclick = sendMessage;
    }
}

/**
 * Auto-resize textarea
 */
function setupTextareaAutoResize() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;
    
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    });
}

/**
 * Send message to AI
 */
async function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const userMessage = chatInput.value.trim();
    
    if (!userMessage) return;
    
    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    // Disable send button
    sendButton.disabled = true;
    
    // Add user message to chat
    addMessageToChat('user', userMessage);
    
    // Hide empty state
    hideEmptyState();
    
    // Show loading indicator
    const loadingId = showLoadingIndicator();
    
    try {
        // Refresh Firebase data before answering to get latest real-time data
        // This ensures AI always has the most up-to-date information
        await loadFirebaseData();
        
        // Prepare context with Firebase data
        const context = buildContextWithFirebaseData();
        
        // Call Gemini API
        const response = await callGeminiAPI(userMessage, context);
        
        // Remove loading indicator
        removeLoadingIndicator(loadingId);
        
        // Add AI response to chat
        addMessageToChat('ai', response);
        
    } catch (error) {
        console.error('[AI CHAT] Error:', error);
        removeLoadingIndicator(loadingId);
        addMessageToChat('ai', `Sorry, I encountered an error: ${error.message}. Please try again.`);
    } finally {
        // Re-enable send button
        sendButton.disabled = false;
    }
}

/**
 * Build context with Firebase data for AI
 * Includes real-time device data, room assignments, and analytics
 */
function buildContextWithFirebaseData() {
    let context = `You are an AI assistant for AeroNexa, an air quality monitoring system. You help users understand their air quality data from sensors.\n\n`;
    
    // Add data timestamp to show how recent the data is
    if (firebaseData && firebaseData.timestamp) {
        context += `Data last updated: ${new Date(firebaseData.timestamp).toLocaleString()}\n\n`;
    }
    
    if (firebaseData && firebaseData.devices) {
        const devices = firebaseData.devices;
        const deviceCount = Object.keys(devices).length;
        
        context += `Current System Status:\n`;
        context += `- Total devices: ${deviceCount}\n`;
        
        if (deviceCount > 0) {
            context += `\nDevice Details:\n`;
            
            // Add device details
            Object.keys(devices).forEach(deviceId => {
                const device = devices[deviceId];
                const sensorData = device.data_sensor || {};
                const camera = device.camera || {};
                const assignedRoom = device.assigned || null;
                
                context += `\nDevice: ${deviceId.toUpperCase()}\n`;
                
                // Add room assignment information if available
                if (assignedRoom) {
                    context += `- Assigned Room: ${assignedRoom}\n`;
                } else {
                    context += `- Assigned Room: Not assigned\n`;
                }
                
                context += `- Camera Status: ${camera.status || 'unknown'}\n`;
                context += `- Camera IP: ${camera.ip || 'N/A'}\n`;
                context += `- Camera RSSI: ${camera.rssi !== undefined ? camera.rssi + ' dBm' : 'N/A'}\n`;
                context += `- Last Seen: ${camera.lastSeen || 'N/A'}\n`;
                
                // Sensor data
                context += `- CO2: ${sensorData.co2 !== undefined ? sensorData.co2 + ' ppm' : 'N/A'}\n`;
                context += `- Temperature: ${sensorData.temperature !== undefined ? sensorData.temperature + ' °C' : 'N/A'}\n`;
                context += `- Humidity: ${sensorData.humidity !== undefined ? sensorData.humidity + ' %' : 'N/A'}\n`;
                context += `- PM2.5 (Dust): ${sensorData.pm25 !== undefined ? sensorData.pm25 + ' μg/m³' : 'N/A'}\n`;
                context += `- PM10: ${sensorData.pm10 !== undefined ? sensorData.pm10 + ' μg/m³' : 'N/A'}\n`;
                context += `- PM1: ${sensorData.pm1 !== undefined ? sensorData.pm1 + ' μg/m³' : 'N/A'}\n`;
                context += `- MQ2 Gas: ${sensorData.mq2 !== undefined ? sensorData.mq2 + ' ppm' : 'N/A'}\n`;
                context += `- MQ2 Raw: ${sensorData.mq2_raw !== undefined ? sensorData.mq2_raw : 'N/A'}\n`;
                context += `- MQ2 Voltage: ${sensorData.mq2_voltage !== undefined ? sensorData.mq2_voltage + ' V' : 'N/A'}\n`;
                
                // Add status indicators based on values
                // CO2 thresholds: normal < 1000, warning 1000-1400, critical > 1400
                if (sensorData.co2 !== undefined) {
                    if (sensorData.co2 >= 1400) {
                        context += `  ⚠️ CO2 level is CRITICAL (very high)\n`;
                    } else if (sensorData.co2 >= 1000) {
                        context += `  ⚠️ CO2 level is WARNING (elevated)\n`;
                    }
                }
                
                // Temperature thresholds: normal < 26, warning 26-29, critical > 29
                if (sensorData.temperature !== undefined) {
                    if (sensorData.temperature > 29) {
                        context += `  ⚠️ Temperature is CRITICAL (very hot)\n`;
                    } else if (sensorData.temperature >= 26) {
                        context += `  ⚠️ Temperature is WARNING (warm)\n`;
                    }
                }
                
                // PM2.5 thresholds: normal < 35, warning 35-55, critical > 55
                if (sensorData.pm25 !== undefined) {
                    if (sensorData.pm25 > 55) {
                        context += `  ⚠️ PM2.5 (Dust) level is CRITICAL (very high)\n`;
                    } else if (sensorData.pm25 >= 35) {
                        context += `  ⚠️ PM2.5 (Dust) level is WARNING (elevated)\n`;
                    }
                }
            });
            
            // Add summary statistics
            context += `\nSummary Statistics:\n`;
            const onlineDevices = Object.keys(devices).filter(deviceId => {
                const device = devices[deviceId];
                return device.camera && device.camera.status === 'online';
            });
            context += `- Online devices: ${onlineDevices.length} out of ${deviceCount}\n`;
            
            // Calculate averages if we have sensor data
            let co2Sum = 0, co2Count = 0;
            let tempSum = 0, tempCount = 0;
            let humiditySum = 0, humidityCount = 0;
            let pm25Sum = 0, pm25Count = 0;
            
            Object.keys(devices).forEach(deviceId => {
                const device = devices[deviceId];
                const sensorData = device.data_sensor || {};
                
                if (sensorData.co2 !== undefined) {
                    co2Sum += sensorData.co2;
                    co2Count++;
                }
                if (sensorData.temperature !== undefined) {
                    tempSum += sensorData.temperature;
                    tempCount++;
                }
                if (sensorData.humidity !== undefined) {
                    humiditySum += sensorData.humidity;
                    humidityCount++;
                }
                if (sensorData.pm25 !== undefined) {
                    pm25Sum += sensorData.pm25;
                    pm25Count++;
                }
            });
            
            if (co2Count > 0) {
                context += `- Average CO2: ${Math.round(co2Sum / co2Count)} ppm\n`;
            }
            if (tempCount > 0) {
                context += `- Average Temperature: ${(tempSum / tempCount).toFixed(1)} °C\n`;
            }
            if (humidityCount > 0) {
                context += `- Average Humidity: ${Math.round(humiditySum / humidityCount)} %\n`;
            }
            if (pm25Count > 0) {
                context += `- Average PM2.5 (Dust): ${Math.round(pm25Sum / pm25Count)} μg/m³\n`;
            }
        } else {
            context += `\nNo devices are currently connected to the system.\n`;
        }
    } else {
        context += `\nNo device data is currently available. The system may be initializing or devices may not be connected.\n`;
    }
    
    // Add analytics data if available
    if (firebaseData && firebaseData.analytics) {
        const analytics = firebaseData.analytics;
        if (analytics.today && Object.keys(analytics.today).length > 0) {
            context += `\nAnalytics Data (Today):\n`;
            const todayHours = Object.keys(analytics.today).length;
            context += `- Hours of data available: ${todayHours}\n`;
        }
    }
    
    context += `\nPlease provide helpful, accurate answers about the air quality data. If asked about specific values, use the data provided above. Format your response in a clear and easy-to-understand manner. When mentioning devices, use their room assignments if available (e.g., "Device AERONEXA-002 in Room X").`;
    
    return context;
}

/**
 * Call Gemini API
 */
async function callGeminiAPI(userMessage, context) {
    const url = `${GEMINI_API_URL}/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`;
    
    // Build conversation history for context
    const conversationHistory = chatHistory.slice(-5).map(msg => {
        return msg.role === 'user' ? `User: ${msg.content}` : `Assistant: ${msg.content}`;
    }).join('\n\n');
    
    const fullPrompt = `${context}\n\n${conversationHistory ? `Previous conversation:\n${conversationHistory}\n\n` : ''}User Question: ${userMessage}\n\nPlease provide a helpful, accurate answer based on the data provided. Be concise but informative.`;
    
    const requestBody = {
        contents: [{
            parts: [{
                text: fullPrompt
            }]
        }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
        }
    };
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `API Error: ${response.status}`;
        console.error('[AI CHAT] API Error:', errorMessage, errorData);
        throw new Error(errorMessage);
    }
    
    const data = await response.json();
    
    // Extract text from response
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const text = data.candidates[0].content.parts[0].text;
        return text;
    }
    
    // Check for safety ratings or blocked content
    if (data.candidates && data.candidates[0] && data.candidates[0].finishReason) {
        const finishReason = data.candidates[0].finishReason;
        if (finishReason === 'SAFETY') {
            throw new Error('Response was blocked due to safety filters. Please rephrase your question.');
        } else if (finishReason === 'MAX_TOKENS') {
            throw new Error('Response was too long. Please ask a more specific question.');
        } else if (finishReason === 'RECITATION') {
            throw new Error('Response was blocked due to content policy. Please rephrase your question.');
        }
    }
    
    throw new Error('No response from AI. Please try again.');
}

/**
 * Add message to chat
 */
async function addMessageToChat(role, content) {
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    if (!chatMessagesContainer) return;
    
    // Remove empty state if exists
    hideEmptyState();
    
    // Hide suggested questions when messages exist (they're now inside chat container)
    const suggestedQuestions = document.getElementById('suggestedQuestions');
    if (suggestedQuestions) {
        suggestedQuestions.style.display = 'none';
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${role}`;
    
    if (role === 'user') {
        // Get user photo URL from Firebase Auth
        let photoURL = null;
        try {
            if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                photoURL = window.firebaseAuth.currentUser.photoURL;
            } else if (window.currentUserPhotoURL) {
                photoURL = window.currentUserPhotoURL;
            }
        } catch (error) {
            console.warn('[AI CHAT] Error getting user photo:', error);
        }
        
        if (photoURL) {
            avatar.classList.add('has-photo');
            avatar.innerHTML = `
                <i class="fas fa-user"></i>
                <img src="${photoURL}" alt="User" onerror="this.parentElement.classList.remove('has-photo'); this.style.display='none'; this.parentElement.querySelector('i').style.display='block';">
            `;
        } else {
            avatar.innerHTML = '<i class="fas fa-user"></i>';
        }
    } else {
        avatar.innerHTML = '<img src="image/Ai.png" alt="AI">';
    }
    
    const messageContentWrapper = document.createElement('div');
    messageContentWrapper.className = `message-content ${role}`;
    
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    
    // Format message content (support markdown-like formatting)
    const formattedContent = formatMessageContent(content);
    messageBubble.innerHTML = formattedContent;
    
    messageContentWrapper.appendChild(messageBubble);
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContentWrapper);
    
    chatMessagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    setTimeout(() => {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }, 100);
    
    // Add to chat history
    chatHistory.push({ role, content });
}

/**
 * Format message content (basic markdown support)
 */
function formatMessageContent(content) {
    if (!content) return '';
    
    // Convert newlines to <br> (but preserve code blocks)
    let formatted = content;
    
    // First, protect code blocks
    const codeBlocks = [];
    formatted = formatted.replace(/```([\s\S]*?)```/g, (match, code) => {
        const id = `CODEBLOCK_${codeBlocks.length}`;
        codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
        return id;
    });
    
    // Convert inline code (but not inside code blocks)
    formatted = formatted.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    
    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Restore code blocks
    codeBlocks.forEach((block, index) => {
        formatted = formatted.replace(`CODEBLOCK_${index}`, block);
    });
    
    // Convert **bold**
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* (but not if it's part of **bold**)
    formatted = formatted.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    
    // Split into paragraphs if there are double line breaks
    const paragraphs = formatted.split('<br><br>');
    if (paragraphs.length > 1) {
        return paragraphs.map(p => p.trim() ? `<p>${p.trim()}</p>` : '').join('');
    }
    
    return formatted;
}

/**
 * Show loading indicator
 */
function showLoadingIndicator() {
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    if (!chatMessagesContainer) return null;
    
    // Hide empty state
    hideEmptyState();
    
    // Hide suggested questions
    const suggestedQuestions = document.getElementById('suggestedQuestions');
    if (suggestedQuestions) {
        suggestedQuestions.style.display = 'none';
    }
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-message ai';
    loadingDiv.id = 'loadingIndicator';
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar ai';
    avatar.innerHTML = '<img src="image/Ai.png" alt="AI">';
    
    const messageContentWrapper = document.createElement('div');
    messageContentWrapper.className = 'message-content ai';
    
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble ai';
    messageBubble.innerHTML = `
        <div class="loading-indicator">
            <span>AI is thinking</span>
            <div class="loading-dots">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
        </div>
    `;
    
    messageContentWrapper.appendChild(messageBubble);
    
    loadingDiv.appendChild(avatar);
    loadingDiv.appendChild(messageContentWrapper);
    
    chatMessagesContainer.appendChild(loadingDiv);
    
    setTimeout(() => {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }, 100);
    
    return 'loadingIndicator';
}

/**
 * Remove loading indicator
 */
function removeLoadingIndicator(loadingId) {
    const loadingIndicator = document.getElementById(loadingId);
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

/**
 * Hide empty state
 */
function hideEmptyState() {
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    if (!chatMessagesContainer) return;
    
    const emptyState = chatMessagesContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
}

// Export functions to window for global access
window.sendMessage = sendMessage;


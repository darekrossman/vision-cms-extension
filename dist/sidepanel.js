/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/utils.ts":
/*!**********************!*\
  !*** ./src/utils.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createBackgroundLogger: () => (/* binding */ createBackgroundLogger),
/* harmony export */   createContentLogger: () => (/* binding */ createContentLogger),
/* harmony export */   createSidePanelLogger: () => (/* binding */ createSidePanelLogger),
/* harmony export */   generateFilename: () => (/* binding */ generateFilename)
/* harmony export */ });
/**
 * Shared utility functions and types for the Vision CMS extension
 */
// Logger for background script
function createBackgroundLogger() {
    const prefix = "🔄 Background:";
    return {
        log: (...args) => console.log(prefix, ...args),
        error: (...args) => console.error(prefix, "ERROR:", ...args),
    };
}
// Logger for side panel
function createSidePanelLogger() {
    const prefix = "📋 Side Panel:";
    return {
        log: (...args) => console.log(prefix, ...args),
        error: (...args) => console.error(prefix, "ERROR:", ...args),
    };
}
// Logger for content script
function createContentLogger() {
    const prefix = "🌐 Content:";
    return {
        log: (...args) => console.log(prefix, ...args),
        error: (...args) => console.error(prefix, "ERROR:", ...args),
    };
}
// Generate a timestamp-based filename
function generateFilename() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
    return `vision_cms_snippet_${timestamp}.png`;
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!**************************!*\
  !*** ./src/sidepanel.ts ***!
  \**************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils */ "./src/utils.ts");

/**
 * Vision CMS Side Panel Script
 * Handles UI interactions and communication with the background service worker
 */
// Configuration and state
let isSelectionModeActive = false;
let currentTab = null;
// Set up logging
const { log, error: logError } = (0,_utils__WEBPACK_IMPORTED_MODULE_0__.createSidePanelLogger)();
// Track if capture is in progress
let captureInProgress = false;
// Store the latest image URL
let latestImageUrl = null;
// DOM elements
let startButton = null;
let processButton = null;
let imageContainer = null;
let loadingIndicator = null;
let statusMessage = null;
// Initialize when the document is loaded
document.addEventListener("DOMContentLoaded", () => {
    log("Initializing side panel UI");
    // Get the active tab information
    chrome.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
        if (tabs.length > 0) {
            currentTab = tabs[0];
            log("Connected to active tab:", currentTab.id, currentTab.url);
        }
        else {
            logError("No active tab found");
        }
    })
        .catch((err) => {
        logError("Failed to get active tab", err);
    });
    // Get reference to toggle button
    const selectionToggle = document.getElementById("selection-toggle");
    const imagePreview = document.getElementById("image-preview");
    // Validate UI elements
    if (!selectionToggle || !imagePreview) {
        logError("Required UI elements not found in DOM");
        return;
    }
    log("UI elements loaded successfully");
    // Set up toggle button event listener
    selectionToggle.addEventListener("click", async () => {
        // Get current state before toggling
        const wasActive = isSelectionModeActive;
        // Toggle selection mode state
        isSelectionModeActive = !wasActive;
        log(`Selection mode ${isSelectionModeActive ? "activated" : "deactivated"}`);
        try {
            // Update UI immediately to provide visual feedback
            updateSelectionToggleState(isSelectionModeActive, selectionToggle);
            if (isSelectionModeActive) {
                // Show loading indicator for better feedback
                showStatus("Starting selection mode...", "info");
                // Start selection mode
                const response = await chrome.runtime.sendMessage({
                    action: "startSelection",
                    source: "sidePanel",
                });
                log("Background service worker response:", response);
                if (response && response.status === "error") {
                    // If there's an error, revert the selection state
                    isSelectionModeActive = false;
                    updateSelectionToggleState(false, selectionToggle);
                    logError("Error starting selection:", response.message);
                    showStatus("Error: " + (response.message || "Failed to start selection"), "error");
                }
                else {
                    showStatus("Select an area on the page", "info");
                }
            }
            else {
                // Show loading indicator
                showStatus("Cancelling selection mode...", "info");
                // Cancel selection mode
                const response = await chrome.runtime.sendMessage({
                    action: "cancelSelection",
                    source: "sidePanel",
                });
                log("Background service worker response:", response);
                if (response && response.status === "error") {
                    logError("Error cancelling selection:", response.message);
                    showStatus("Error: " + (response.message || "Failed to cancel selection"), "error");
                    // Don't revert the UI state since we've already cancelled locally
                }
                else {
                    showStatus("Selection mode cancelled", "info");
                }
            }
        }
        catch (error) {
            logError(`Failed to ${isSelectionModeActive ? "start" : "cancel"} selection mode`, error);
            // Revert the toggle state on error
            isSelectionModeActive = wasActive;
            updateSelectionToggleState(wasActive, selectionToggle);
            // Show error status
            showStatus(`Error: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
    });
    // Reset UI to initial state
    resetUI();
    // Listen for messages from the background service worker
    setupMessageListener();
    // Let the background script know we're ready
    notifyBackgroundReady();
    // Initialize the UI elements and event listeners
    initializeUI();
});
// Reset UI to initial state
function resetUI() {
    log("Resetting UI to initial state");
    const selectionToggle = document.getElementById("selection-toggle");
    const imagePreview = document.getElementById("image-preview");
    if (selectionToggle && imagePreview) {
        // Reset toggle button
        selectionToggle.classList.remove("active");
        isSelectionModeActive = false;
        // Reset image preview
        imagePreview.style.display = "none";
        imagePreview.innerHTML = "";
    }
    captureInProgress = false;
    latestImageUrl = null;
    if (imageContainer) {
        imageContainer.innerHTML = "";
    }
    if (loadingIndicator) {
        loadingIndicator.style.display = "none";
    }
    showStatus("Ready to capture", "info");
    updateButtonState();
}
// Set up message listener
function setupMessageListener() {
    log("Setting up message listener");
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        log("Received message:", message.action, message);
        switch (message.action) {
            case "selectionComplete":
                // We no longer need to handle this separately as the auto-capture works
                sendResponse({ status: "ok" });
                break;
            case "selectionCancelled":
                handleSelectionCancelled();
                sendResponse({ status: "ok" });
                break;
            case "screenshotCaptured":
                if (message.data) {
                    handleScreenshotCaptured(message.data);
                }
                sendResponse({ status: "ok" });
                break;
            case "imageProcessed":
                log("Processed image received:", message.imageUrl);
                displayImage(message.imageUrl);
                sendResponse({ status: "ok" });
                break;
            case "processingError":
                logError("Processing error:", message.error);
                showStatus(`Error: ${message.error}`, "error");
                captureInProgress = false;
                updateButtonState();
                if (loadingIndicator) {
                    loadingIndicator.style.display = "none";
                }
                sendResponse({ status: "ok" });
                break;
            default:
                log("Unknown message action:", message.action);
                sendResponse({ status: "error", message: "Unknown action" });
        }
        return true; // Keep message channel open for async responses
    });
}
// Notify background that the side panel is ready
function notifyBackgroundReady() {
    log("Notifying background service worker that the side panel is ready");
    chrome.runtime
        .sendMessage({
        action: "sidePanelReady",
        source: "sidePanel",
    })
        .catch((error) => {
        logError("Failed to send ready notification to background", error);
    });
}
// Handle selection cancelled message
function handleSelectionCancelled() {
    log("Handling selection cancelled");
    const selectionToggle = document.getElementById("selection-toggle");
    if (selectionToggle) {
        selectionToggle.classList.remove("active");
        isSelectionModeActive = false;
        log("Selection mode deactivated");
    }
}
// Handle screenshot captured message
function handleScreenshotCaptured(dataUrl) {
    log("Handling screenshot captured, data length:", dataUrl.length);
    const imagePreview = document.getElementById("image-preview");
    if (!imagePreview) {
        logError("Image preview element not found");
        return;
    }
    // Clear existing content
    imagePreview.innerHTML = "";
    // Create and add image
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "Captured Snapshot";
    imagePreview.appendChild(img);
    imagePreview.style.display = "block";
    log("Image preview updated with screenshot");
}
// Initialize the UI elements and event listeners
function initializeUI() {
    log("Initializing UI");
    // Get UI elements
    startButton = document.getElementById("startSelectionButton");
    processButton = document.getElementById("processImageButton");
    imageContainer = document.getElementById("imageContainer");
    loadingIndicator = document.getElementById("loadingIndicator");
    statusMessage = document.getElementById("statusMessage");
    if (!startButton ||
        !processButton ||
        !imageContainer ||
        !loadingIndicator ||
        !statusMessage) {
        logError("Failed to find required UI elements");
        return;
    }
    // Hide loading indicator and process button initially
    loadingIndicator.style.display = "none";
    processButton.style.display = "none";
    // Set up event listeners
    startButton.addEventListener("click", startSelection);
    processButton.addEventListener("click", processImage);
    // Listen for window resize to adjust UI
    window.addEventListener("resize", updateUILayout);
    // Update layout initially
    updateUILayout();
}
// Notify background script that sidepanel is open
function notifyBackgroundScript() {
    log("Notifying background script");
    chrome.runtime.sendMessage({ action: "sidePanelOpened" }, (response) => {
        if (chrome.runtime.lastError) {
            logError("Error notifying background script:", chrome.runtime.lastError);
            showStatus("Background script not available. Please reload the extension.", "error");
        }
        else {
            log("Background script notified:", response);
            showStatus("Ready to capture", "info");
        }
    });
}
// Start the selection process in the active tab
function startSelection() {
    log("Starting selection");
    if (captureInProgress) {
        log("Capture already in progress, ignoring");
        return;
    }
    captureInProgress = true;
    updateButtonState();
    showStatus("Select an area on the page...", "info");
    chrome.runtime.sendMessage({ action: "startSelection" }, (response) => {
        if (chrome.runtime.lastError) {
            logError("Error starting selection:", chrome.runtime.lastError);
            showStatus("Error starting selection. Please try again.", "error");
            captureInProgress = false;
            updateButtonState();
        }
        else if (response && response.status === "error") {
            logError("Error response from background:", response.message);
            showStatus(response.message || "Error starting selection", "error");
            captureInProgress = false;
            updateButtonState();
        }
        else {
            log("Selection started successfully");
        }
    });
}
// Process the current image (not used with server-side processing approach)
function processImage() {
    log("Process image button clicked");
    // This function is retained for backward compatibility but not used in server-side processing
}
// Update button states based on current status
function updateButtonState() {
    if (!startButton || !processButton)
        return;
    startButton.disabled = captureInProgress;
    processButton.style.display = latestImageUrl ? "block" : "none";
}
// Show status message with appropriate styling
function showStatus(message, type) {
    if (!statusMessage)
        return;
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.style.display = "block";
}
// Update UI layout based on window size
function updateUILayout() {
    // Adjust any size-dependent UI elements
    if (imageContainer) {
        const maxHeight = window.innerHeight - 200; // Allow space for buttons and status
        imageContainer.style.maxHeight = `${maxHeight}px`;
    }
}
// Display image in the side panel
function displayImage(imageUrl) {
    if (!imageContainer)
        return;
    // Clear previous content
    imageContainer.innerHTML = "";
    // Create image element
    const img = document.createElement("img");
    img.src = imageUrl;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.alt = "Captured screenshot";
    img.onload = () => {
        log("Image loaded successfully");
        // Hide loading indicator once image is loaded
        if (loadingIndicator) {
            loadingIndicator.style.display = "none";
        }
        // Update status
        showStatus("Image processed successfully", "success");
        // Reset capture in progress
        captureInProgress = false;
        updateButtonState();
    };
    img.onerror = () => {
        logError("Error loading image");
        showStatus("Error loading image", "error");
        // Reset capture in progress
        captureInProgress = false;
        updateButtonState();
    };
    imageContainer.appendChild(img);
    // Store latest image URL
    latestImageUrl = imageUrl;
}
// Helper function to update the selection toggle UI state
function updateSelectionToggleState(active, toggleButton) {
    if (active) {
        toggleButton.classList.add("active");
        toggleButton.textContent = "Cancel Selection";
    }
    else {
        toggleButton.classList.remove("active");
        toggleButton.textContent = "Start Selection";
    }
}

})();

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUNBQWlDLDJCQUEyQjtBQUM1RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQ0FBaUMsMEJBQTBCO0FBQzNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3Q0FBd0MsS0FBSztBQUM3QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxvREFBb0Q7QUFDcEQsNENBQTRDLFVBQVU7QUFDdEQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vdmlzaW9uLWNtcy1leHRlbnNpb24vLi9zcmMvdXRpbHMudHMiLCJ3ZWJwYWNrOi8vdmlzaW9uLWNtcy1leHRlbnNpb24vd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vdmlzaW9uLWNtcy1leHRlbnNpb24vd2VicGFjay9ydW50aW1lL2RlZmluZSBwcm9wZXJ0eSBnZXR0ZXJzIiwid2VicGFjazovL3Zpc2lvbi1jbXMtZXh0ZW5zaW9uL3dlYnBhY2svcnVudGltZS9oYXNPd25Qcm9wZXJ0eSBzaG9ydGhhbmQiLCJ3ZWJwYWNrOi8vdmlzaW9uLWNtcy1leHRlbnNpb24vd2VicGFjay9ydW50aW1lL21ha2UgbmFtZXNwYWNlIG9iamVjdCIsIndlYnBhY2s6Ly92aXNpb24tY21zLWV4dGVuc2lvbi8uL3NyYy9zaWRlcGFuZWwudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTaGFyZWQgdXRpbGl0eSBmdW5jdGlvbnMgYW5kIHR5cGVzIGZvciB0aGUgVmlzaW9uIENNUyBleHRlbnNpb25cbiAqL1xuLy8gTG9nZ2VyIGZvciBiYWNrZ3JvdW5kIHNjcmlwdFxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUJhY2tncm91bmRMb2dnZXIoKSB7XG4gICAgY29uc3QgcHJlZml4ID0gXCLwn5SEIEJhY2tncm91bmQ6XCI7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbG9nOiAoLi4uYXJncykgPT4gY29uc29sZS5sb2cocHJlZml4LCAuLi5hcmdzKSxcbiAgICAgICAgZXJyb3I6ICguLi5hcmdzKSA9PiBjb25zb2xlLmVycm9yKHByZWZpeCwgXCJFUlJPUjpcIiwgLi4uYXJncyksXG4gICAgfTtcbn1cbi8vIExvZ2dlciBmb3Igc2lkZSBwYW5lbFxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNpZGVQYW5lbExvZ2dlcigpIHtcbiAgICBjb25zdCBwcmVmaXggPSBcIvCfk4sgU2lkZSBQYW5lbDpcIjtcbiAgICByZXR1cm4ge1xuICAgICAgICBsb2c6ICguLi5hcmdzKSA9PiBjb25zb2xlLmxvZyhwcmVmaXgsIC4uLmFyZ3MpLFxuICAgICAgICBlcnJvcjogKC4uLmFyZ3MpID0+IGNvbnNvbGUuZXJyb3IocHJlZml4LCBcIkVSUk9SOlwiLCAuLi5hcmdzKSxcbiAgICB9O1xufVxuLy8gTG9nZ2VyIGZvciBjb250ZW50IHNjcmlwdFxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNvbnRlbnRMb2dnZXIoKSB7XG4gICAgY29uc3QgcHJlZml4ID0gXCLwn4yQIENvbnRlbnQ6XCI7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbG9nOiAoLi4uYXJncykgPT4gY29uc29sZS5sb2cocHJlZml4LCAuLi5hcmdzKSxcbiAgICAgICAgZXJyb3I6ICguLi5hcmdzKSA9PiBjb25zb2xlLmVycm9yKHByZWZpeCwgXCJFUlJPUjpcIiwgLi4uYXJncyksXG4gICAgfTtcbn1cbi8vIEdlbmVyYXRlIGEgdGltZXN0YW1wLWJhc2VkIGZpbGVuYW1lXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVGaWxlbmFtZSgpIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB5ZWFyID0gZGF0ZS5nZXRGdWxsWWVhcigpO1xuICAgIGNvbnN0IG1vbnRoID0gU3RyaW5nKGRhdGUuZ2V0TW9udGgoKSArIDEpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICBjb25zdCBkYXkgPSBTdHJpbmcoZGF0ZS5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICBjb25zdCBob3VycyA9IFN0cmluZyhkYXRlLmdldEhvdXJzKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICBjb25zdCBtaW51dGVzID0gU3RyaW5nKGRhdGUuZ2V0TWludXRlcygpKS5wYWRTdGFydCgyLCBcIjBcIik7XG4gICAgY29uc3Qgc2Vjb25kcyA9IFN0cmluZyhkYXRlLmdldFNlY29uZHMoKSkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICAgIGNvbnN0IHRpbWVzdGFtcCA9IGAke3llYXJ9JHttb250aH0ke2RheX1fJHtob3Vyc30ke21pbnV0ZXN9JHtzZWNvbmRzfWA7XG4gICAgcmV0dXJuIGB2aXNpb25fY21zX3NuaXBwZXRfJHt0aW1lc3RhbXB9LnBuZ2A7XG59XG4iLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdKG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gZGVmaW5lIGdldHRlciBmdW5jdGlvbnMgZm9yIGhhcm1vbnkgZXhwb3J0c1xuX193ZWJwYWNrX3JlcXVpcmVfXy5kID0gKGV4cG9ydHMsIGRlZmluaXRpb24pID0+IHtcblx0Zm9yKHZhciBrZXkgaW4gZGVmaW5pdGlvbikge1xuXHRcdGlmKF9fd2VicGFja19yZXF1aXJlX18ubyhkZWZpbml0aW9uLCBrZXkpICYmICFfX3dlYnBhY2tfcmVxdWlyZV9fLm8oZXhwb3J0cywga2V5KSkge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIGtleSwgeyBlbnVtZXJhYmxlOiB0cnVlLCBnZXQ6IGRlZmluaXRpb25ba2V5XSB9KTtcblx0XHR9XG5cdH1cbn07IiwiX193ZWJwYWNrX3JlcXVpcmVfXy5vID0gKG9iaiwgcHJvcCkgPT4gKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSIsIi8vIGRlZmluZSBfX2VzTW9kdWxlIG9uIGV4cG9ydHNcbl9fd2VicGFja19yZXF1aXJlX18uciA9IChleHBvcnRzKSA9PiB7XG5cdGlmKHR5cGVvZiBTeW1ib2wgIT09ICd1bmRlZmluZWQnICYmIFN5bWJvbC50b1N0cmluZ1RhZykge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBTeW1ib2wudG9TdHJpbmdUYWcsIHsgdmFsdWU6ICdNb2R1bGUnIH0pO1xuXHR9XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG59OyIsImltcG9ydCB7IGNyZWF0ZVNpZGVQYW5lbExvZ2dlciB9IGZyb20gXCIuL3V0aWxzXCI7XG4vKipcbiAqIFZpc2lvbiBDTVMgU2lkZSBQYW5lbCBTY3JpcHRcbiAqIEhhbmRsZXMgVUkgaW50ZXJhY3Rpb25zIGFuZCBjb21tdW5pY2F0aW9uIHdpdGggdGhlIGJhY2tncm91bmQgc2VydmljZSB3b3JrZXJcbiAqL1xuLy8gQ29uZmlndXJhdGlvbiBhbmQgc3RhdGVcbmxldCBpc1NlbGVjdGlvbk1vZGVBY3RpdmUgPSBmYWxzZTtcbmxldCBjdXJyZW50VGFiID0gbnVsbDtcbi8vIFNldCB1cCBsb2dnaW5nXG5jb25zdCB7IGxvZywgZXJyb3I6IGxvZ0Vycm9yIH0gPSBjcmVhdGVTaWRlUGFuZWxMb2dnZXIoKTtcbi8vIFRyYWNrIGlmIGNhcHR1cmUgaXMgaW4gcHJvZ3Jlc3NcbmxldCBjYXB0dXJlSW5Qcm9ncmVzcyA9IGZhbHNlO1xuLy8gU3RvcmUgdGhlIGxhdGVzdCBpbWFnZSBVUkxcbmxldCBsYXRlc3RJbWFnZVVybCA9IG51bGw7XG4vLyBET00gZWxlbWVudHNcbmxldCBzdGFydEJ1dHRvbiA9IG51bGw7XG5sZXQgcHJvY2Vzc0J1dHRvbiA9IG51bGw7XG5sZXQgaW1hZ2VDb250YWluZXIgPSBudWxsO1xubGV0IGxvYWRpbmdJbmRpY2F0b3IgPSBudWxsO1xubGV0IHN0YXR1c01lc3NhZ2UgPSBudWxsO1xuLy8gSW5pdGlhbGl6ZSB3aGVuIHRoZSBkb2N1bWVudCBpcyBsb2FkZWRcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsICgpID0+IHtcbiAgICBsb2coXCJJbml0aWFsaXppbmcgc2lkZSBwYW5lbCBVSVwiKTtcbiAgICAvLyBHZXQgdGhlIGFjdGl2ZSB0YWIgaW5mb3JtYXRpb25cbiAgICBjaHJvbWUudGFic1xuICAgICAgICAucXVlcnkoeyBhY3RpdmU6IHRydWUsIGN1cnJlbnRXaW5kb3c6IHRydWUgfSlcbiAgICAgICAgLnRoZW4oKHRhYnMpID0+IHtcbiAgICAgICAgaWYgKHRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY3VycmVudFRhYiA9IHRhYnNbMF07XG4gICAgICAgICAgICBsb2coXCJDb25uZWN0ZWQgdG8gYWN0aXZlIHRhYjpcIiwgY3VycmVudFRhYi5pZCwgY3VycmVudFRhYi51cmwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJObyBhY3RpdmUgdGFiIGZvdW5kXCIpO1xuICAgICAgICB9XG4gICAgfSlcbiAgICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gZ2V0IGFjdGl2ZSB0YWJcIiwgZXJyKTtcbiAgICB9KTtcbiAgICAvLyBHZXQgcmVmZXJlbmNlIHRvIHRvZ2dsZSBidXR0b25cbiAgICBjb25zdCBzZWxlY3Rpb25Ub2dnbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNlbGVjdGlvbi10b2dnbGVcIik7XG4gICAgY29uc3QgaW1hZ2VQcmV2aWV3ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpbWFnZS1wcmV2aWV3XCIpO1xuICAgIC8vIFZhbGlkYXRlIFVJIGVsZW1lbnRzXG4gICAgaWYgKCFzZWxlY3Rpb25Ub2dnbGUgfHwgIWltYWdlUHJldmlldykge1xuICAgICAgICBsb2dFcnJvcihcIlJlcXVpcmVkIFVJIGVsZW1lbnRzIG5vdCBmb3VuZCBpbiBET01cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbG9nKFwiVUkgZWxlbWVudHMgbG9hZGVkIHN1Y2Nlc3NmdWxseVwiKTtcbiAgICAvLyBTZXQgdXAgdG9nZ2xlIGJ1dHRvbiBldmVudCBsaXN0ZW5lclxuICAgIHNlbGVjdGlvblRvZ2dsZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBHZXQgY3VycmVudCBzdGF0ZSBiZWZvcmUgdG9nZ2xpbmdcbiAgICAgICAgY29uc3Qgd2FzQWN0aXZlID0gaXNTZWxlY3Rpb25Nb2RlQWN0aXZlO1xuICAgICAgICAvLyBUb2dnbGUgc2VsZWN0aW9uIG1vZGUgc3RhdGVcbiAgICAgICAgaXNTZWxlY3Rpb25Nb2RlQWN0aXZlID0gIXdhc0FjdGl2ZTtcbiAgICAgICAgbG9nKGBTZWxlY3Rpb24gbW9kZSAke2lzU2VsZWN0aW9uTW9kZUFjdGl2ZSA/IFwiYWN0aXZhdGVkXCIgOiBcImRlYWN0aXZhdGVkXCJ9YCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBVcGRhdGUgVUkgaW1tZWRpYXRlbHkgdG8gcHJvdmlkZSB2aXN1YWwgZmVlZGJhY2tcbiAgICAgICAgICAgIHVwZGF0ZVNlbGVjdGlvblRvZ2dsZVN0YXRlKGlzU2VsZWN0aW9uTW9kZUFjdGl2ZSwgc2VsZWN0aW9uVG9nZ2xlKTtcbiAgICAgICAgICAgIGlmIChpc1NlbGVjdGlvbk1vZGVBY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAvLyBTaG93IGxvYWRpbmcgaW5kaWNhdG9yIGZvciBiZXR0ZXIgZmVlZGJhY2tcbiAgICAgICAgICAgICAgICBzaG93U3RhdHVzKFwiU3RhcnRpbmcgc2VsZWN0aW9uIG1vZGUuLi5cIiwgXCJpbmZvXCIpO1xuICAgICAgICAgICAgICAgIC8vIFN0YXJ0IHNlbGVjdGlvbiBtb2RlXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogXCJzdGFydFNlbGVjdGlvblwiLFxuICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IFwic2lkZVBhbmVsXCIsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgbG9nKFwiQmFja2dyb3VuZCBzZXJ2aWNlIHdvcmtlciByZXNwb25zZTpcIiwgcmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdGF0dXMgPT09IFwiZXJyb3JcIikge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSdzIGFuIGVycm9yLCByZXZlcnQgdGhlIHNlbGVjdGlvbiBzdGF0ZVxuICAgICAgICAgICAgICAgICAgICBpc1NlbGVjdGlvbk1vZGVBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlU2VsZWN0aW9uVG9nZ2xlU3RhdGUoZmFsc2UsIHNlbGVjdGlvblRvZ2dsZSk7XG4gICAgICAgICAgICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3Igc3RhcnRpbmcgc2VsZWN0aW9uOlwiLCByZXNwb25zZS5tZXNzYWdlKTtcbiAgICAgICAgICAgICAgICAgICAgc2hvd1N0YXR1cyhcIkVycm9yOiBcIiArIChyZXNwb25zZS5tZXNzYWdlIHx8IFwiRmFpbGVkIHRvIHN0YXJ0IHNlbGVjdGlvblwiKSwgXCJlcnJvclwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNob3dTdGF0dXMoXCJTZWxlY3QgYW4gYXJlYSBvbiB0aGUgcGFnZVwiLCBcImluZm9cIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gU2hvdyBsb2FkaW5nIGluZGljYXRvclxuICAgICAgICAgICAgICAgIHNob3dTdGF0dXMoXCJDYW5jZWxsaW5nIHNlbGVjdGlvbiBtb2RlLi4uXCIsIFwiaW5mb1wiKTtcbiAgICAgICAgICAgICAgICAvLyBDYW5jZWwgc2VsZWN0aW9uIG1vZGVcbiAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcImNhbmNlbFNlbGVjdGlvblwiLFxuICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IFwic2lkZVBhbmVsXCIsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgbG9nKFwiQmFja2dyb3VuZCBzZXJ2aWNlIHdvcmtlciByZXNwb25zZTpcIiwgcmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdGF0dXMgPT09IFwiZXJyb3JcIikge1xuICAgICAgICAgICAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIGNhbmNlbGxpbmcgc2VsZWN0aW9uOlwiLCByZXNwb25zZS5tZXNzYWdlKTtcbiAgICAgICAgICAgICAgICAgICAgc2hvd1N0YXR1cyhcIkVycm9yOiBcIiArIChyZXNwb25zZS5tZXNzYWdlIHx8IFwiRmFpbGVkIHRvIGNhbmNlbCBzZWxlY3Rpb25cIiksIFwiZXJyb3JcIik7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IHJldmVydCB0aGUgVUkgc3RhdGUgc2luY2Ugd2UndmUgYWxyZWFkeSBjYW5jZWxsZWQgbG9jYWxseVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvd1N0YXR1cyhcIlNlbGVjdGlvbiBtb2RlIGNhbmNlbGxlZFwiLCBcImluZm9cIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbG9nRXJyb3IoYEZhaWxlZCB0byAke2lzU2VsZWN0aW9uTW9kZUFjdGl2ZSA/IFwic3RhcnRcIiA6IFwiY2FuY2VsXCJ9IHNlbGVjdGlvbiBtb2RlYCwgZXJyb3IpO1xuICAgICAgICAgICAgLy8gUmV2ZXJ0IHRoZSB0b2dnbGUgc3RhdGUgb24gZXJyb3JcbiAgICAgICAgICAgIGlzU2VsZWN0aW9uTW9kZUFjdGl2ZSA9IHdhc0FjdGl2ZTtcbiAgICAgICAgICAgIHVwZGF0ZVNlbGVjdGlvblRvZ2dsZVN0YXRlKHdhc0FjdGl2ZSwgc2VsZWN0aW9uVG9nZ2xlKTtcbiAgICAgICAgICAgIC8vIFNob3cgZXJyb3Igc3RhdHVzXG4gICAgICAgICAgICBzaG93U3RhdHVzKGBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCwgXCJlcnJvclwiKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIC8vIFJlc2V0IFVJIHRvIGluaXRpYWwgc3RhdGVcbiAgICByZXNldFVJKCk7XG4gICAgLy8gTGlzdGVuIGZvciBtZXNzYWdlcyBmcm9tIHRoZSBiYWNrZ3JvdW5kIHNlcnZpY2Ugd29ya2VyXG4gICAgc2V0dXBNZXNzYWdlTGlzdGVuZXIoKTtcbiAgICAvLyBMZXQgdGhlIGJhY2tncm91bmQgc2NyaXB0IGtub3cgd2UncmUgcmVhZHlcbiAgICBub3RpZnlCYWNrZ3JvdW5kUmVhZHkoKTtcbiAgICAvLyBJbml0aWFsaXplIHRoZSBVSSBlbGVtZW50cyBhbmQgZXZlbnQgbGlzdGVuZXJzXG4gICAgaW5pdGlhbGl6ZVVJKCk7XG59KTtcbi8vIFJlc2V0IFVJIHRvIGluaXRpYWwgc3RhdGVcbmZ1bmN0aW9uIHJlc2V0VUkoKSB7XG4gICAgbG9nKFwiUmVzZXR0aW5nIFVJIHRvIGluaXRpYWwgc3RhdGVcIik7XG4gICAgY29uc3Qgc2VsZWN0aW9uVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWxlY3Rpb24tdG9nZ2xlXCIpO1xuICAgIGNvbnN0IGltYWdlUHJldmlldyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaW1hZ2UtcHJldmlld1wiKTtcbiAgICBpZiAoc2VsZWN0aW9uVG9nZ2xlICYmIGltYWdlUHJldmlldykge1xuICAgICAgICAvLyBSZXNldCB0b2dnbGUgYnV0dG9uXG4gICAgICAgIHNlbGVjdGlvblRvZ2dsZS5jbGFzc0xpc3QucmVtb3ZlKFwiYWN0aXZlXCIpO1xuICAgICAgICBpc1NlbGVjdGlvbk1vZGVBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgLy8gUmVzZXQgaW1hZ2UgcHJldmlld1xuICAgICAgICBpbWFnZVByZXZpZXcuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICBpbWFnZVByZXZpZXcuaW5uZXJIVE1MID0gXCJcIjtcbiAgICB9XG4gICAgY2FwdHVyZUluUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICBsYXRlc3RJbWFnZVVybCA9IG51bGw7XG4gICAgaWYgKGltYWdlQ29udGFpbmVyKSB7XG4gICAgICAgIGltYWdlQ29udGFpbmVyLmlubmVySFRNTCA9IFwiXCI7XG4gICAgfVxuICAgIGlmIChsb2FkaW5nSW5kaWNhdG9yKSB7XG4gICAgICAgIGxvYWRpbmdJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cbiAgICBzaG93U3RhdHVzKFwiUmVhZHkgdG8gY2FwdHVyZVwiLCBcImluZm9cIik7XG4gICAgdXBkYXRlQnV0dG9uU3RhdGUoKTtcbn1cbi8vIFNldCB1cCBtZXNzYWdlIGxpc3RlbmVyXG5mdW5jdGlvbiBzZXR1cE1lc3NhZ2VMaXN0ZW5lcigpIHtcbiAgICBsb2coXCJTZXR0aW5nIHVwIG1lc3NhZ2UgbGlzdGVuZXJcIik7XG4gICAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xuICAgICAgICBsb2coXCJSZWNlaXZlZCBtZXNzYWdlOlwiLCBtZXNzYWdlLmFjdGlvbiwgbWVzc2FnZSk7XG4gICAgICAgIHN3aXRjaCAobWVzc2FnZS5hY3Rpb24pIHtcbiAgICAgICAgICAgIGNhc2UgXCJzZWxlY3Rpb25Db21wbGV0ZVwiOlxuICAgICAgICAgICAgICAgIC8vIFdlIG5vIGxvbmdlciBuZWVkIHRvIGhhbmRsZSB0aGlzIHNlcGFyYXRlbHkgYXMgdGhlIGF1dG8tY2FwdHVyZSB3b3Jrc1xuICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJva1wiIH0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInNlbGVjdGlvbkNhbmNlbGxlZFwiOlxuICAgICAgICAgICAgICAgIGhhbmRsZVNlbGVjdGlvbkNhbmNlbGxlZCgpO1xuICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJva1wiIH0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInNjcmVlbnNob3RDYXB0dXJlZFwiOlxuICAgICAgICAgICAgICAgIGlmIChtZXNzYWdlLmRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlU2NyZWVuc2hvdENhcHR1cmVkKG1lc3NhZ2UuZGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJva1wiIH0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImltYWdlUHJvY2Vzc2VkXCI6XG4gICAgICAgICAgICAgICAgbG9nKFwiUHJvY2Vzc2VkIGltYWdlIHJlY2VpdmVkOlwiLCBtZXNzYWdlLmltYWdlVXJsKTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5SW1hZ2UobWVzc2FnZS5pbWFnZVVybCk7XG4gICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIgfSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwicHJvY2Vzc2luZ0Vycm9yXCI6XG4gICAgICAgICAgICAgICAgbG9nRXJyb3IoXCJQcm9jZXNzaW5nIGVycm9yOlwiLCBtZXNzYWdlLmVycm9yKTtcbiAgICAgICAgICAgICAgICBzaG93U3RhdHVzKGBFcnJvcjogJHttZXNzYWdlLmVycm9yfWAsIFwiZXJyb3JcIik7XG4gICAgICAgICAgICAgICAgY2FwdHVyZUluUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB1cGRhdGVCdXR0b25TdGF0ZSgpO1xuICAgICAgICAgICAgICAgIGlmIChsb2FkaW5nSW5kaWNhdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvYWRpbmdJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6IFwib2tcIiB9KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgbG9nKFwiVW5rbm93biBtZXNzYWdlIGFjdGlvbjpcIiwgbWVzc2FnZS5hY3Rpb24pO1xuICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJlcnJvclwiLCBtZXNzYWdlOiBcIlVua25vd24gYWN0aW9uXCIgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7IC8vIEtlZXAgbWVzc2FnZSBjaGFubmVsIG9wZW4gZm9yIGFzeW5jIHJlc3BvbnNlc1xuICAgIH0pO1xufVxuLy8gTm90aWZ5IGJhY2tncm91bmQgdGhhdCB0aGUgc2lkZSBwYW5lbCBpcyByZWFkeVxuZnVuY3Rpb24gbm90aWZ5QmFja2dyb3VuZFJlYWR5KCkge1xuICAgIGxvZyhcIk5vdGlmeWluZyBiYWNrZ3JvdW5kIHNlcnZpY2Ugd29ya2VyIHRoYXQgdGhlIHNpZGUgcGFuZWwgaXMgcmVhZHlcIik7XG4gICAgY2hyb21lLnJ1bnRpbWVcbiAgICAgICAgLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgYWN0aW9uOiBcInNpZGVQYW5lbFJlYWR5XCIsXG4gICAgICAgIHNvdXJjZTogXCJzaWRlUGFuZWxcIixcbiAgICB9KVxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGxvZ0Vycm9yKFwiRmFpbGVkIHRvIHNlbmQgcmVhZHkgbm90aWZpY2F0aW9uIHRvIGJhY2tncm91bmRcIiwgZXJyb3IpO1xuICAgIH0pO1xufVxuLy8gSGFuZGxlIHNlbGVjdGlvbiBjYW5jZWxsZWQgbWVzc2FnZVxuZnVuY3Rpb24gaGFuZGxlU2VsZWN0aW9uQ2FuY2VsbGVkKCkge1xuICAgIGxvZyhcIkhhbmRsaW5nIHNlbGVjdGlvbiBjYW5jZWxsZWRcIik7XG4gICAgY29uc3Qgc2VsZWN0aW9uVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWxlY3Rpb24tdG9nZ2xlXCIpO1xuICAgIGlmIChzZWxlY3Rpb25Ub2dnbGUpIHtcbiAgICAgICAgc2VsZWN0aW9uVG9nZ2xlLmNsYXNzTGlzdC5yZW1vdmUoXCJhY3RpdmVcIik7XG4gICAgICAgIGlzU2VsZWN0aW9uTW9kZUFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICBsb2coXCJTZWxlY3Rpb24gbW9kZSBkZWFjdGl2YXRlZFwiKTtcbiAgICB9XG59XG4vLyBIYW5kbGUgc2NyZWVuc2hvdCBjYXB0dXJlZCBtZXNzYWdlXG5mdW5jdGlvbiBoYW5kbGVTY3JlZW5zaG90Q2FwdHVyZWQoZGF0YVVybCkge1xuICAgIGxvZyhcIkhhbmRsaW5nIHNjcmVlbnNob3QgY2FwdHVyZWQsIGRhdGEgbGVuZ3RoOlwiLCBkYXRhVXJsLmxlbmd0aCk7XG4gICAgY29uc3QgaW1hZ2VQcmV2aWV3ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpbWFnZS1wcmV2aWV3XCIpO1xuICAgIGlmICghaW1hZ2VQcmV2aWV3KSB7XG4gICAgICAgIGxvZ0Vycm9yKFwiSW1hZ2UgcHJldmlldyBlbGVtZW50IG5vdCBmb3VuZFwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBDbGVhciBleGlzdGluZyBjb250ZW50XG4gICAgaW1hZ2VQcmV2aWV3LmlubmVySFRNTCA9IFwiXCI7XG4gICAgLy8gQ3JlYXRlIGFuZCBhZGQgaW1hZ2VcbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgIGltZy5zcmMgPSBkYXRhVXJsO1xuICAgIGltZy5hbHQgPSBcIkNhcHR1cmVkIFNuYXBzaG90XCI7XG4gICAgaW1hZ2VQcmV2aWV3LmFwcGVuZENoaWxkKGltZyk7XG4gICAgaW1hZ2VQcmV2aWV3LnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgbG9nKFwiSW1hZ2UgcHJldmlldyB1cGRhdGVkIHdpdGggc2NyZWVuc2hvdFwiKTtcbn1cbi8vIEluaXRpYWxpemUgdGhlIFVJIGVsZW1lbnRzIGFuZCBldmVudCBsaXN0ZW5lcnNcbmZ1bmN0aW9uIGluaXRpYWxpemVVSSgpIHtcbiAgICBsb2coXCJJbml0aWFsaXppbmcgVUlcIik7XG4gICAgLy8gR2V0IFVJIGVsZW1lbnRzXG4gICAgc3RhcnRCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXJ0U2VsZWN0aW9uQnV0dG9uXCIpO1xuICAgIHByb2Nlc3NCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2Nlc3NJbWFnZUJ1dHRvblwiKTtcbiAgICBpbWFnZUNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaW1hZ2VDb250YWluZXJcIik7XG4gICAgbG9hZGluZ0luZGljYXRvciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibG9hZGluZ0luZGljYXRvclwiKTtcbiAgICBzdGF0dXNNZXNzYWdlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNNZXNzYWdlXCIpO1xuICAgIGlmICghc3RhcnRCdXR0b24gfHxcbiAgICAgICAgIXByb2Nlc3NCdXR0b24gfHxcbiAgICAgICAgIWltYWdlQ29udGFpbmVyIHx8XG4gICAgICAgICFsb2FkaW5nSW5kaWNhdG9yIHx8XG4gICAgICAgICFzdGF0dXNNZXNzYWdlKSB7XG4gICAgICAgIGxvZ0Vycm9yKFwiRmFpbGVkIHRvIGZpbmQgcmVxdWlyZWQgVUkgZWxlbWVudHNcIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gSGlkZSBsb2FkaW5nIGluZGljYXRvciBhbmQgcHJvY2VzcyBidXR0b24gaW5pdGlhbGx5XG4gICAgbG9hZGluZ0luZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgcHJvY2Vzc0J1dHRvbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgLy8gU2V0IHVwIGV2ZW50IGxpc3RlbmVyc1xuICAgIHN0YXJ0QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGFydFNlbGVjdGlvbik7XG4gICAgcHJvY2Vzc0J1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgcHJvY2Vzc0ltYWdlKTtcbiAgICAvLyBMaXN0ZW4gZm9yIHdpbmRvdyByZXNpemUgdG8gYWRqdXN0IFVJXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVUlMYXlvdXQpO1xuICAgIC8vIFVwZGF0ZSBsYXlvdXQgaW5pdGlhbGx5XG4gICAgdXBkYXRlVUlMYXlvdXQoKTtcbn1cbi8vIE5vdGlmeSBiYWNrZ3JvdW5kIHNjcmlwdCB0aGF0IHNpZGVwYW5lbCBpcyBvcGVuXG5mdW5jdGlvbiBub3RpZnlCYWNrZ3JvdW5kU2NyaXB0KCkge1xuICAgIGxvZyhcIk5vdGlmeWluZyBiYWNrZ3JvdW5kIHNjcmlwdFwiKTtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogXCJzaWRlUGFuZWxPcGVuZWRcIiB9LCAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBub3RpZnlpbmcgYmFja2dyb3VuZCBzY3JpcHQ6XCIsIGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcik7XG4gICAgICAgICAgICBzaG93U3RhdHVzKFwiQmFja2dyb3VuZCBzY3JpcHQgbm90IGF2YWlsYWJsZS4gUGxlYXNlIHJlbG9hZCB0aGUgZXh0ZW5zaW9uLlwiLCBcImVycm9yXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbG9nKFwiQmFja2dyb3VuZCBzY3JpcHQgbm90aWZpZWQ6XCIsIHJlc3BvbnNlKTtcbiAgICAgICAgICAgIHNob3dTdGF0dXMoXCJSZWFkeSB0byBjYXB0dXJlXCIsIFwiaW5mb1wiKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuLy8gU3RhcnQgdGhlIHNlbGVjdGlvbiBwcm9jZXNzIGluIHRoZSBhY3RpdmUgdGFiXG5mdW5jdGlvbiBzdGFydFNlbGVjdGlvbigpIHtcbiAgICBsb2coXCJTdGFydGluZyBzZWxlY3Rpb25cIik7XG4gICAgaWYgKGNhcHR1cmVJblByb2dyZXNzKSB7XG4gICAgICAgIGxvZyhcIkNhcHR1cmUgYWxyZWFkeSBpbiBwcm9ncmVzcywgaWdub3JpbmdcIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY2FwdHVyZUluUHJvZ3Jlc3MgPSB0cnVlO1xuICAgIHVwZGF0ZUJ1dHRvblN0YXRlKCk7XG4gICAgc2hvd1N0YXR1cyhcIlNlbGVjdCBhbiBhcmVhIG9uIHRoZSBwYWdlLi4uXCIsIFwiaW5mb1wiKTtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogXCJzdGFydFNlbGVjdGlvblwiIH0sIChyZXNwb25zZSkgPT4ge1xuICAgICAgICBpZiAoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIHN0YXJ0aW5nIHNlbGVjdGlvbjpcIiwgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKTtcbiAgICAgICAgICAgIHNob3dTdGF0dXMoXCJFcnJvciBzdGFydGluZyBzZWxlY3Rpb24uIFBsZWFzZSB0cnkgYWdhaW4uXCIsIFwiZXJyb3JcIik7XG4gICAgICAgICAgICBjYXB0dXJlSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgICAgICAgICAgdXBkYXRlQnV0dG9uU3RhdGUoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdGF0dXMgPT09IFwiZXJyb3JcIikge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciByZXNwb25zZSBmcm9tIGJhY2tncm91bmQ6XCIsIHJlc3BvbnNlLm1lc3NhZ2UpO1xuICAgICAgICAgICAgc2hvd1N0YXR1cyhyZXNwb25zZS5tZXNzYWdlIHx8IFwiRXJyb3Igc3RhcnRpbmcgc2VsZWN0aW9uXCIsIFwiZXJyb3JcIik7XG4gICAgICAgICAgICBjYXB0dXJlSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgICAgICAgICAgdXBkYXRlQnV0dG9uU3RhdGUoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGxvZyhcIlNlbGVjdGlvbiBzdGFydGVkIHN1Y2Nlc3NmdWxseVwiKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuLy8gUHJvY2VzcyB0aGUgY3VycmVudCBpbWFnZSAobm90IHVzZWQgd2l0aCBzZXJ2ZXItc2lkZSBwcm9jZXNzaW5nIGFwcHJvYWNoKVxuZnVuY3Rpb24gcHJvY2Vzc0ltYWdlKCkge1xuICAgIGxvZyhcIlByb2Nlc3MgaW1hZ2UgYnV0dG9uIGNsaWNrZWRcIik7XG4gICAgLy8gVGhpcyBmdW5jdGlvbiBpcyByZXRhaW5lZCBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSBidXQgbm90IHVzZWQgaW4gc2VydmVyLXNpZGUgcHJvY2Vzc2luZ1xufVxuLy8gVXBkYXRlIGJ1dHRvbiBzdGF0ZXMgYmFzZWQgb24gY3VycmVudCBzdGF0dXNcbmZ1bmN0aW9uIHVwZGF0ZUJ1dHRvblN0YXRlKCkge1xuICAgIGlmICghc3RhcnRCdXR0b24gfHwgIXByb2Nlc3NCdXR0b24pXG4gICAgICAgIHJldHVybjtcbiAgICBzdGFydEJ1dHRvbi5kaXNhYmxlZCA9IGNhcHR1cmVJblByb2dyZXNzO1xuICAgIHByb2Nlc3NCdXR0b24uc3R5bGUuZGlzcGxheSA9IGxhdGVzdEltYWdlVXJsID8gXCJibG9ja1wiIDogXCJub25lXCI7XG59XG4vLyBTaG93IHN0YXR1cyBtZXNzYWdlIHdpdGggYXBwcm9wcmlhdGUgc3R5bGluZ1xuZnVuY3Rpb24gc2hvd1N0YXR1cyhtZXNzYWdlLCB0eXBlKSB7XG4gICAgaWYgKCFzdGF0dXNNZXNzYWdlKVxuICAgICAgICByZXR1cm47XG4gICAgc3RhdHVzTWVzc2FnZS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gICAgc3RhdHVzTWVzc2FnZS5jbGFzc05hbWUgPSBgc3RhdHVzICR7dHlwZX1gO1xuICAgIHN0YXR1c01lc3NhZ2Uuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbn1cbi8vIFVwZGF0ZSBVSSBsYXlvdXQgYmFzZWQgb24gd2luZG93IHNpemVcbmZ1bmN0aW9uIHVwZGF0ZVVJTGF5b3V0KCkge1xuICAgIC8vIEFkanVzdCBhbnkgc2l6ZS1kZXBlbmRlbnQgVUkgZWxlbWVudHNcbiAgICBpZiAoaW1hZ2VDb250YWluZXIpIHtcbiAgICAgICAgY29uc3QgbWF4SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0IC0gMjAwOyAvLyBBbGxvdyBzcGFjZSBmb3IgYnV0dG9ucyBhbmQgc3RhdHVzXG4gICAgICAgIGltYWdlQ29udGFpbmVyLnN0eWxlLm1heEhlaWdodCA9IGAke21heEhlaWdodH1weGA7XG4gICAgfVxufVxuLy8gRGlzcGxheSBpbWFnZSBpbiB0aGUgc2lkZSBwYW5lbFxuZnVuY3Rpb24gZGlzcGxheUltYWdlKGltYWdlVXJsKSB7XG4gICAgaWYgKCFpbWFnZUNvbnRhaW5lcilcbiAgICAgICAgcmV0dXJuO1xuICAgIC8vIENsZWFyIHByZXZpb3VzIGNvbnRlbnRcbiAgICBpbWFnZUNvbnRhaW5lci5pbm5lckhUTUwgPSBcIlwiO1xuICAgIC8vIENyZWF0ZSBpbWFnZSBlbGVtZW50XG4gICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICBpbWcuc3JjID0gaW1hZ2VVcmw7XG4gICAgaW1nLnN0eWxlLm1heFdpZHRoID0gXCIxMDAlXCI7XG4gICAgaW1nLnN0eWxlLmhlaWdodCA9IFwiYXV0b1wiO1xuICAgIGltZy5hbHQgPSBcIkNhcHR1cmVkIHNjcmVlbnNob3RcIjtcbiAgICBpbWcub25sb2FkID0gKCkgPT4ge1xuICAgICAgICBsb2coXCJJbWFnZSBsb2FkZWQgc3VjY2Vzc2Z1bGx5XCIpO1xuICAgICAgICAvLyBIaWRlIGxvYWRpbmcgaW5kaWNhdG9yIG9uY2UgaW1hZ2UgaXMgbG9hZGVkXG4gICAgICAgIGlmIChsb2FkaW5nSW5kaWNhdG9yKSB7XG4gICAgICAgICAgICBsb2FkaW5nSW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgfVxuICAgICAgICAvLyBVcGRhdGUgc3RhdHVzXG4gICAgICAgIHNob3dTdGF0dXMoXCJJbWFnZSBwcm9jZXNzZWQgc3VjY2Vzc2Z1bGx5XCIsIFwic3VjY2Vzc1wiKTtcbiAgICAgICAgLy8gUmVzZXQgY2FwdHVyZSBpbiBwcm9ncmVzc1xuICAgICAgICBjYXB0dXJlSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgICAgICB1cGRhdGVCdXR0b25TdGF0ZSgpO1xuICAgIH07XG4gICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XG4gICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgbG9hZGluZyBpbWFnZVwiKTtcbiAgICAgICAgc2hvd1N0YXR1cyhcIkVycm9yIGxvYWRpbmcgaW1hZ2VcIiwgXCJlcnJvclwiKTtcbiAgICAgICAgLy8gUmVzZXQgY2FwdHVyZSBpbiBwcm9ncmVzc1xuICAgICAgICBjYXB0dXJlSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgICAgICB1cGRhdGVCdXR0b25TdGF0ZSgpO1xuICAgIH07XG4gICAgaW1hZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQoaW1nKTtcbiAgICAvLyBTdG9yZSBsYXRlc3QgaW1hZ2UgVVJMXG4gICAgbGF0ZXN0SW1hZ2VVcmwgPSBpbWFnZVVybDtcbn1cbi8vIEhlbHBlciBmdW5jdGlvbiB0byB1cGRhdGUgdGhlIHNlbGVjdGlvbiB0b2dnbGUgVUkgc3RhdGVcbmZ1bmN0aW9uIHVwZGF0ZVNlbGVjdGlvblRvZ2dsZVN0YXRlKGFjdGl2ZSwgdG9nZ2xlQnV0dG9uKSB7XG4gICAgaWYgKGFjdGl2ZSkge1xuICAgICAgICB0b2dnbGVCdXR0b24uY2xhc3NMaXN0LmFkZChcImFjdGl2ZVwiKTtcbiAgICAgICAgdG9nZ2xlQnV0dG9uLnRleHRDb250ZW50ID0gXCJDYW5jZWwgU2VsZWN0aW9uXCI7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB0b2dnbGVCdXR0b24uY2xhc3NMaXN0LnJlbW92ZShcImFjdGl2ZVwiKTtcbiAgICAgICAgdG9nZ2xlQnV0dG9uLnRleHRDb250ZW50ID0gXCJTdGFydCBTZWxlY3Rpb25cIjtcbiAgICB9XG59XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=
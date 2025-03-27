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
/*!***************************!*\
  !*** ./src/background.ts ***!
  \***************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils */ "./src/utils.ts");

// Configuration
const API_ENDPOINT = "http://localhost:3000/process-image";
// Default prompt for image analysis
const DEFAULT_PROMPT = "Describe what's in this image and extract any text content.";
// State tracking
let isActive = true;
// Set up logging
const { log, error: logError } = (0,_utils__WEBPACK_IMPORTED_MODULE_0__.createBackgroundLogger)();
// Log when the service worker starts
log("Service worker started - v1.0");
// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
    log("Extension installed");
    chrome.storage.local.set({ isActive: true });
    // Set up the side panel to open on action click
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => logError("Error setting sidePanel behavior:", error));
    isActive = true;
});
// Initialize extension on browser startup
chrome.runtime.onStartup.addListener(() => {
    log("Extension started");
    chrome.storage.local.set({ isActive: true });
    // Set up the side panel to open on action click
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => logError("Error setting sidePanel behavior:", error));
    isActive = true;
});
// Handle extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab || !tab.id) {
        logError("No valid tab for action click");
        return;
    }
    try {
        log("Action clicked on tab:", tab.id);
        // Make sure content scripts are injected
        await ensureContentScriptsInjected(tab.id);
        // Open the side panel
        try {
            await chrome.sidePanel.open({ tabId: tab.id });
            log("Side panel opened for tab:", tab.id);
        }
        catch (error) {
            logError("Error opening side panel:", error);
        }
    }
    catch (error) {
        logError("Action click handling error:", error);
    }
});
// Handle start selection action
function handleStartSelection(tabId, sendResponse) {
    log("Handling startSelection for tab", tabId);
    if (!tabId) {
        logError("No tab ID provided for selection");
        sendResponse({ status: "error", message: "No tab ID" });
        return;
    }
    isActive = true;
    // First make sure the content script is injected
    ensureContentScriptsInjected(tabId)
        .then(() => {
        // After ensuring content script is injected, send the startSelection message
        return chrome.tabs.sendMessage(tabId, {
            action: "startSelection",
            source: "background",
        });
    })
        .then((response) => {
        log("Content script acknowledged startSelection:", response);
        sendResponse({ status: "ok" });
    })
        .catch((err) => {
        logError("Error starting selection:", err);
        sendResponse({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
        });
    });
}
// Helper function to ensure content scripts are injected
async function ensureContentScriptsInjected(tabId) {
    log("Ensuring content scripts are injected for tab:", tabId);
    // First check if we can communicate with the content script
    try {
        // Try to ping the content script to see if it's loaded
        const response = await chrome.tabs.sendMessage(tabId, { action: "ping" });
        log("Content script already loaded in tab:", tabId, response);
        return; // Content script is responsive, no need to inject
    }
    catch (error) {
        // Content script not loaded or not responsive, inject it
        log("Content script not loaded or not responsive, injecting scripts...");
    }
    try {
        // Inject the content script
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content.js"],
        });
        // Also inject html2canvas support script if needed
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ["content-html2canvas.js.js"],
            });
        }
        catch (error) {
            // Not critical if this fails
            log("Note: html2canvas script injection skipped or failed:", error);
        }
        log("Content scripts injected successfully in tab:", tabId);
        // Wait a moment to ensure scripts initialize
        await new Promise((resolve) => setTimeout(resolve, 300));
        // Verify the content script is now responsive
        try {
            await chrome.tabs.sendMessage(tabId, { action: "ping" });
            log("Content script successfully initialized in tab:", tabId);
        }
        catch (verifyError) {
            logError("Content script injection succeeded but script is not responsive:", verifyError);
            throw new Error("Content script injection succeeded but script is not responsive");
        }
    }
    catch (error) {
        logError("Error injecting content scripts:", error);
        throw error;
    }
}
// Handle messages from content script or side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const isFromContentScript = sender.tab && sender.tab.id;
    const isFromSidePanel = message.source === "sidePanel";
    log("Message received:", message.action, isFromContentScript
        ? `from content script (tab ${sender.tab.id})`
        : isFromSidePanel
            ? "from side panel"
            : "from unknown source");
    switch (message.action) {
        case "ping":
            // Respond to ping request to check if service worker is alive
            log("Responding to ping");
            sendResponse({ status: "ok", response: "pong" });
            break;
        case "sidePanelReady":
            log("Side panel is ready");
            sendResponse({ status: "ok" });
            break;
        case "contentScriptReady":
            log("Content script is ready on tab", sender.tab?.id);
            sendResponse({ status: "ok" });
            break;
        case "startSelection":
            if (isFromSidePanel) {
                // When from side panel, get the current active tab
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs.length > 0 && tabs[0].id) {
                        log("Side panel requested selection, using active tab:", tabs[0].id);
                        handleStartSelection(tabs[0].id, sendResponse);
                    }
                    else {
                        logError("No active tab found for selection from side panel");
                        sendResponse({ status: "error", message: "No active tab found" });
                    }
                });
                return true; // Keep response channel open
            }
            else {
                // When from content script, use the sender tab
                handleStartSelection(sender.tab?.id, sendResponse);
            }
            break;
        case "cancelSelection":
            if (isFromSidePanel) {
                // Handle cancellation request from side panel
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs.length > 0 && tabs[0].id) {
                        log("Cancelling selection on tab:", tabs[0].id);
                        // Send cancellation message to content script, but don't fail if content script isn't responding
                        ensureContentScriptsInjected(tabs[0].id)
                            .then(() => {
                            return chrome.tabs.sendMessage(tabs[0].id, {
                                action: "cancelSelection",
                            });
                        })
                            .then(() => {
                            log("Sent cancelSelection to content script");
                            sendResponse({ status: "ok" });
                        })
                            .catch((err) => {
                            // Don't treat this as an error, as the content script might not be in selection mode
                            log("Note: Could not send cancelSelection to tab, but proceeding anyway:", err);
                            // Still return success to the side panel to let it update the UI
                            sendResponse({ status: "ok" });
                        });
                    }
                    else {
                        logError("No active tab found for cancellation");
                        sendResponse({ status: "error", message: "No active tab found" });
                    }
                });
                return true; // Keep response channel open
            }
            break;
        case "selectionComplete":
            log("Selection completed on tab", sender.tab?.id);
            sendResponse({ status: "ok" });
            break;
        case "selectionCancelled":
            log("Selection cancelled on tab", sender.tab?.id);
            sendResponse({ status: "ok" });
            break;
        case "processSelection":
            handleProcessSelection(sender.tab?.id, message.rect, sendResponse);
            return true; // Keep the message channel open for the async response
        case "sidePanelOpened":
            log("Side panel opened");
            // Ensure the side panel is up to date with any existing screenshots
            sendResponse({ status: "ok" });
            break;
        default:
            log("Unknown message action:", message.action);
            sendResponse({ status: "error", message: "Unknown action" });
    }
    return true; // Keep the channel open for future responses
});
// Handle process selection action (replaces captureSelection)
async function handleProcessSelection(tabId, rect, sendResponse) {
    log("Handling processSelection for tab", tabId);
    if (!tabId) {
        logError("No tab ID provided for processing");
        sendResponse({ status: "error", message: "No tab ID" });
        return;
    }
    try {
        // Capture the full screenshot of the visible tab
        const screenshot = await chrome.tabs.captureVisibleTab({ format: "png" });
        // Get the device pixel ratio from the tab
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.devicePixelRatio || 1,
        });
        // Use the result, defaulting to 1 if undefined
        const devicePixelRatio = result ?? 1;
        log("Screenshot captured, uploading to server with selection data");
        // Create form data with the full screenshot and selection coordinates
        const formData = new FormData();
        // Convert base64 data URL to blob
        const base64Data = screenshot.replace(/^data:image\/png;base64,/, "");
        const byteCharacters = atob(base64Data);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        const blob = new Blob(byteArrays, { type: "image/png" });
        // Add data to FormData
        formData.append("image", blob, "screenshot.png");
        formData.append("x", rect.x.toString());
        formData.append("y", rect.y.toString());
        formData.append("width", rect.width.toString());
        formData.append("height", rect.height.toString());
        formData.append("dpr", devicePixelRatio.toString());
        // Send to the server for processing
        const response = await fetch(API_ENDPOINT, {
            method: "POST",
            body: formData,
        });
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.imageUrl) {
            throw new Error("No image URL in server response");
        }
        log("Server processed image successfully, URL:", data.imageUrl);
        // Notify the side panel of the successful image processing
        chrome.runtime.sendMessage({
            action: "imageProcessed",
            imageUrl: data.imageUrl,
            timestamp: new Date().toISOString(),
        });
        sendResponse({ status: "ok", imageUrl: data.imageUrl });
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logError("Error processing selection:", errorMessage);
        // Notify the side panel of the error
        chrome.runtime.sendMessage({
            action: "processingError",
            error: errorMessage,
        });
        sendResponse({ status: "error", message: errorMessage });
    }
}
// Safe way to notify popup without causing errors if it's not open
function notifyPopup(message) {
    try {
        chrome.runtime.sendMessage(message).catch(() => {
            // Ignore errors - popup is likely just not open
        });
    }
    catch (error) {
        // Ignore errors - popup is likely just not open
    }
}
// Process the screenshot without downloading - only display in side panel
async function saveScreenshot(dataUrl) {
    try {
        log("Processing screenshot for display in side panel only");
        // Verify image has content
        const base64Data = dataUrl.split(",")[1];
        const decodedLength = atob(base64Data).length;
        log(`Image size: ${decodedLength} bytes`);
        if (decodedLength < 100) {
            log("Warning: Image appears to be very small");
        }
        // We're no longer downloading the image or sending it to the analysis server
        // Just log that we've processed it
        log("Screenshot processed successfully for side panel display");
    }
    catch (error) {
        logError("Error processing screenshot:", error);
    }
}
// Keep the service worker alive
keepAlive();
// Function to keep the service worker alive
function keepAlive() {
    setInterval(() => {
        const timestamp = new Date().toISOString();
        log(`Service worker alive check: ${timestamp}`);
    }, 25000); // Every 25 seconds
}

})();

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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Q0E7QUFDQTtBQUNBLFNBQVM7QUFDVCx1QkFBdUIsdUNBQXVDO0FBQzlEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1QsdUJBQXVCLHdDQUF3QztBQUMvRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVM7QUFDVDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwyQkFBMkIsZUFBZTtBQUMxQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsMkNBQTJDLFVBQVU7QUFDckQsS0FBSyxVQUFVO0FBQ2YiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly92aXNpb24tY21zLWV4dGVuc2lvbi8uL3NyYy91dGlscy50cyIsIndlYnBhY2s6Ly92aXNpb24tY21zLWV4dGVuc2lvbi93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly92aXNpb24tY21zLWV4dGVuc2lvbi93ZWJwYWNrL3J1bnRpbWUvZGVmaW5lIHByb3BlcnR5IGdldHRlcnMiLCJ3ZWJwYWNrOi8vdmlzaW9uLWNtcy1leHRlbnNpb24vd2VicGFjay9ydW50aW1lL2hhc093blByb3BlcnR5IHNob3J0aGFuZCIsIndlYnBhY2s6Ly92aXNpb24tY21zLWV4dGVuc2lvbi93ZWJwYWNrL3J1bnRpbWUvbWFrZSBuYW1lc3BhY2Ugb2JqZWN0Iiwid2VicGFjazovL3Zpc2lvbi1jbXMtZXh0ZW5zaW9uLy4vc3JjL2JhY2tncm91bmQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTaGFyZWQgdXRpbGl0eSBmdW5jdGlvbnMgYW5kIHR5cGVzIGZvciB0aGUgVmlzaW9uIENNUyBleHRlbnNpb25cbiAqL1xuLy8gTG9nZ2VyIGZvciBiYWNrZ3JvdW5kIHNjcmlwdFxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUJhY2tncm91bmRMb2dnZXIoKSB7XG4gICAgY29uc3QgcHJlZml4ID0gXCLwn5SEIEJhY2tncm91bmQ6XCI7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbG9nOiAoLi4uYXJncykgPT4gY29uc29sZS5sb2cocHJlZml4LCAuLi5hcmdzKSxcbiAgICAgICAgZXJyb3I6ICguLi5hcmdzKSA9PiBjb25zb2xlLmVycm9yKHByZWZpeCwgXCJFUlJPUjpcIiwgLi4uYXJncyksXG4gICAgfTtcbn1cbi8vIExvZ2dlciBmb3Igc2lkZSBwYW5lbFxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNpZGVQYW5lbExvZ2dlcigpIHtcbiAgICBjb25zdCBwcmVmaXggPSBcIvCfk4sgU2lkZSBQYW5lbDpcIjtcbiAgICByZXR1cm4ge1xuICAgICAgICBsb2c6ICguLi5hcmdzKSA9PiBjb25zb2xlLmxvZyhwcmVmaXgsIC4uLmFyZ3MpLFxuICAgICAgICBlcnJvcjogKC4uLmFyZ3MpID0+IGNvbnNvbGUuZXJyb3IocHJlZml4LCBcIkVSUk9SOlwiLCAuLi5hcmdzKSxcbiAgICB9O1xufVxuLy8gTG9nZ2VyIGZvciBjb250ZW50IHNjcmlwdFxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNvbnRlbnRMb2dnZXIoKSB7XG4gICAgY29uc3QgcHJlZml4ID0gXCLwn4yQIENvbnRlbnQ6XCI7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbG9nOiAoLi4uYXJncykgPT4gY29uc29sZS5sb2cocHJlZml4LCAuLi5hcmdzKSxcbiAgICAgICAgZXJyb3I6ICguLi5hcmdzKSA9PiBjb25zb2xlLmVycm9yKHByZWZpeCwgXCJFUlJPUjpcIiwgLi4uYXJncyksXG4gICAgfTtcbn1cbi8vIEdlbmVyYXRlIGEgdGltZXN0YW1wLWJhc2VkIGZpbGVuYW1lXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVGaWxlbmFtZSgpIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB5ZWFyID0gZGF0ZS5nZXRGdWxsWWVhcigpO1xuICAgIGNvbnN0IG1vbnRoID0gU3RyaW5nKGRhdGUuZ2V0TW9udGgoKSArIDEpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICBjb25zdCBkYXkgPSBTdHJpbmcoZGF0ZS5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICBjb25zdCBob3VycyA9IFN0cmluZyhkYXRlLmdldEhvdXJzKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICBjb25zdCBtaW51dGVzID0gU3RyaW5nKGRhdGUuZ2V0TWludXRlcygpKS5wYWRTdGFydCgyLCBcIjBcIik7XG4gICAgY29uc3Qgc2Vjb25kcyA9IFN0cmluZyhkYXRlLmdldFNlY29uZHMoKSkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICAgIGNvbnN0IHRpbWVzdGFtcCA9IGAke3llYXJ9JHttb250aH0ke2RheX1fJHtob3Vyc30ke21pbnV0ZXN9JHtzZWNvbmRzfWA7XG4gICAgcmV0dXJuIGB2aXNpb25fY21zX3NuaXBwZXRfJHt0aW1lc3RhbXB9LnBuZ2A7XG59XG4iLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdKG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gZGVmaW5lIGdldHRlciBmdW5jdGlvbnMgZm9yIGhhcm1vbnkgZXhwb3J0c1xuX193ZWJwYWNrX3JlcXVpcmVfXy5kID0gKGV4cG9ydHMsIGRlZmluaXRpb24pID0+IHtcblx0Zm9yKHZhciBrZXkgaW4gZGVmaW5pdGlvbikge1xuXHRcdGlmKF9fd2VicGFja19yZXF1aXJlX18ubyhkZWZpbml0aW9uLCBrZXkpICYmICFfX3dlYnBhY2tfcmVxdWlyZV9fLm8oZXhwb3J0cywga2V5KSkge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIGtleSwgeyBlbnVtZXJhYmxlOiB0cnVlLCBnZXQ6IGRlZmluaXRpb25ba2V5XSB9KTtcblx0XHR9XG5cdH1cbn07IiwiX193ZWJwYWNrX3JlcXVpcmVfXy5vID0gKG9iaiwgcHJvcCkgPT4gKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSIsIi8vIGRlZmluZSBfX2VzTW9kdWxlIG9uIGV4cG9ydHNcbl9fd2VicGFja19yZXF1aXJlX18uciA9IChleHBvcnRzKSA9PiB7XG5cdGlmKHR5cGVvZiBTeW1ib2wgIT09ICd1bmRlZmluZWQnICYmIFN5bWJvbC50b1N0cmluZ1RhZykge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBTeW1ib2wudG9TdHJpbmdUYWcsIHsgdmFsdWU6ICdNb2R1bGUnIH0pO1xuXHR9XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG59OyIsImltcG9ydCB7IGNyZWF0ZUJhY2tncm91bmRMb2dnZXIgfSBmcm9tIFwiLi91dGlsc1wiO1xuLy8gQ29uZmlndXJhdGlvblxuY29uc3QgQVBJX0VORFBPSU5UID0gXCJodHRwOi8vbG9jYWxob3N0OjMwMDAvcHJvY2Vzcy1pbWFnZVwiO1xuLy8gRGVmYXVsdCBwcm9tcHQgZm9yIGltYWdlIGFuYWx5c2lzXG5jb25zdCBERUZBVUxUX1BST01QVCA9IFwiRGVzY3JpYmUgd2hhdCdzIGluIHRoaXMgaW1hZ2UgYW5kIGV4dHJhY3QgYW55IHRleHQgY29udGVudC5cIjtcbi8vIFN0YXRlIHRyYWNraW5nXG5sZXQgaXNBY3RpdmUgPSB0cnVlO1xuLy8gU2V0IHVwIGxvZ2dpbmdcbmNvbnN0IHsgbG9nLCBlcnJvcjogbG9nRXJyb3IgfSA9IGNyZWF0ZUJhY2tncm91bmRMb2dnZXIoKTtcbi8vIExvZyB3aGVuIHRoZSBzZXJ2aWNlIHdvcmtlciBzdGFydHNcbmxvZyhcIlNlcnZpY2Ugd29ya2VyIHN0YXJ0ZWQgLSB2MS4wXCIpO1xuLy8gSW5pdGlhbGl6ZSBleHRlbnNpb24gb24gaW5zdGFsbFxuY2hyb21lLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuICAgIGxvZyhcIkV4dGVuc2lvbiBpbnN0YWxsZWRcIik7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgaXNBY3RpdmU6IHRydWUgfSk7XG4gICAgLy8gU2V0IHVwIHRoZSBzaWRlIHBhbmVsIHRvIG9wZW4gb24gYWN0aW9uIGNsaWNrXG4gICAgY2hyb21lLnNpZGVQYW5lbFxuICAgICAgICAuc2V0UGFuZWxCZWhhdmlvcih7IG9wZW5QYW5lbE9uQWN0aW9uQ2xpY2s6IHRydWUgfSlcbiAgICAgICAgLmNhdGNoKChlcnJvcikgPT4gbG9nRXJyb3IoXCJFcnJvciBzZXR0aW5nIHNpZGVQYW5lbCBiZWhhdmlvcjpcIiwgZXJyb3IpKTtcbiAgICBpc0FjdGl2ZSA9IHRydWU7XG59KTtcbi8vIEluaXRpYWxpemUgZXh0ZW5zaW9uIG9uIGJyb3dzZXIgc3RhcnR1cFxuY2hyb21lLnJ1bnRpbWUub25TdGFydHVwLmFkZExpc3RlbmVyKCgpID0+IHtcbiAgICBsb2coXCJFeHRlbnNpb24gc3RhcnRlZFwiKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBpc0FjdGl2ZTogdHJ1ZSB9KTtcbiAgICAvLyBTZXQgdXAgdGhlIHNpZGUgcGFuZWwgdG8gb3BlbiBvbiBhY3Rpb24gY2xpY2tcbiAgICBjaHJvbWUuc2lkZVBhbmVsXG4gICAgICAgIC5zZXRQYW5lbEJlaGF2aW9yKHsgb3BlblBhbmVsT25BY3Rpb25DbGljazogdHJ1ZSB9KVxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiBsb2dFcnJvcihcIkVycm9yIHNldHRpbmcgc2lkZVBhbmVsIGJlaGF2aW9yOlwiLCBlcnJvcikpO1xuICAgIGlzQWN0aXZlID0gdHJ1ZTtcbn0pO1xuLy8gSGFuZGxlIGV4dGVuc2lvbiBpY29uIGNsaWNrc1xuY2hyb21lLmFjdGlvbi5vbkNsaWNrZWQuYWRkTGlzdGVuZXIoYXN5bmMgKHRhYikgPT4ge1xuICAgIGlmICghdGFiIHx8ICF0YWIuaWQpIHtcbiAgICAgICAgbG9nRXJyb3IoXCJObyB2YWxpZCB0YWIgZm9yIGFjdGlvbiBjbGlja1wiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBsb2coXCJBY3Rpb24gY2xpY2tlZCBvbiB0YWI6XCIsIHRhYi5pZCk7XG4gICAgICAgIC8vIE1ha2Ugc3VyZSBjb250ZW50IHNjcmlwdHMgYXJlIGluamVjdGVkXG4gICAgICAgIGF3YWl0IGVuc3VyZUNvbnRlbnRTY3JpcHRzSW5qZWN0ZWQodGFiLmlkKTtcbiAgICAgICAgLy8gT3BlbiB0aGUgc2lkZSBwYW5lbFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnNpZGVQYW5lbC5vcGVuKHsgdGFiSWQ6IHRhYi5pZCB9KTtcbiAgICAgICAgICAgIGxvZyhcIlNpZGUgcGFuZWwgb3BlbmVkIGZvciB0YWI6XCIsIHRhYi5pZCk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIG9wZW5pbmcgc2lkZSBwYW5lbDpcIiwgZXJyb3IpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dFcnJvcihcIkFjdGlvbiBjbGljayBoYW5kbGluZyBlcnJvcjpcIiwgZXJyb3IpO1xuICAgIH1cbn0pO1xuLy8gSGFuZGxlIHN0YXJ0IHNlbGVjdGlvbiBhY3Rpb25cbmZ1bmN0aW9uIGhhbmRsZVN0YXJ0U2VsZWN0aW9uKHRhYklkLCBzZW5kUmVzcG9uc2UpIHtcbiAgICBsb2coXCJIYW5kbGluZyBzdGFydFNlbGVjdGlvbiBmb3IgdGFiXCIsIHRhYklkKTtcbiAgICBpZiAoIXRhYklkKSB7XG4gICAgICAgIGxvZ0Vycm9yKFwiTm8gdGFiIElEIHByb3ZpZGVkIGZvciBzZWxlY3Rpb25cIik7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJlcnJvclwiLCBtZXNzYWdlOiBcIk5vIHRhYiBJRFwiIH0pO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlzQWN0aXZlID0gdHJ1ZTtcbiAgICAvLyBGaXJzdCBtYWtlIHN1cmUgdGhlIGNvbnRlbnQgc2NyaXB0IGlzIGluamVjdGVkXG4gICAgZW5zdXJlQ29udGVudFNjcmlwdHNJbmplY3RlZCh0YWJJZClcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAvLyBBZnRlciBlbnN1cmluZyBjb250ZW50IHNjcmlwdCBpcyBpbmplY3RlZCwgc2VuZCB0aGUgc3RhcnRTZWxlY3Rpb24gbWVzc2FnZVxuICAgICAgICByZXR1cm4gY2hyb21lLnRhYnMuc2VuZE1lc3NhZ2UodGFiSWQsIHtcbiAgICAgICAgICAgIGFjdGlvbjogXCJzdGFydFNlbGVjdGlvblwiLFxuICAgICAgICAgICAgc291cmNlOiBcImJhY2tncm91bmRcIixcbiAgICAgICAgfSk7XG4gICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGxvZyhcIkNvbnRlbnQgc2NyaXB0IGFja25vd2xlZGdlZCBzdGFydFNlbGVjdGlvbjpcIiwgcmVzcG9uc2UpO1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6IFwib2tcIiB9KTtcbiAgICB9KVxuICAgICAgICAuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICBsb2dFcnJvcihcIkVycm9yIHN0YXJ0aW5nIHNlbGVjdGlvbjpcIiwgZXJyKTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgIHN0YXR1czogXCJlcnJvclwiLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpLFxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBlbnN1cmUgY29udGVudCBzY3JpcHRzIGFyZSBpbmplY3RlZFxuYXN5bmMgZnVuY3Rpb24gZW5zdXJlQ29udGVudFNjcmlwdHNJbmplY3RlZCh0YWJJZCkge1xuICAgIGxvZyhcIkVuc3VyaW5nIGNvbnRlbnQgc2NyaXB0cyBhcmUgaW5qZWN0ZWQgZm9yIHRhYjpcIiwgdGFiSWQpO1xuICAgIC8vIEZpcnN0IGNoZWNrIGlmIHdlIGNhbiBjb21tdW5pY2F0ZSB3aXRoIHRoZSBjb250ZW50IHNjcmlwdFxuICAgIHRyeSB7XG4gICAgICAgIC8vIFRyeSB0byBwaW5nIHRoZSBjb250ZW50IHNjcmlwdCB0byBzZWUgaWYgaXQncyBsb2FkZWRcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUudGFicy5zZW5kTWVzc2FnZSh0YWJJZCwgeyBhY3Rpb246IFwicGluZ1wiIH0pO1xuICAgICAgICBsb2coXCJDb250ZW50IHNjcmlwdCBhbHJlYWR5IGxvYWRlZCBpbiB0YWI6XCIsIHRhYklkLCByZXNwb25zZSk7XG4gICAgICAgIHJldHVybjsgLy8gQ29udGVudCBzY3JpcHQgaXMgcmVzcG9uc2l2ZSwgbm8gbmVlZCB0byBpbmplY3RcbiAgICB9XG4gICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIC8vIENvbnRlbnQgc2NyaXB0IG5vdCBsb2FkZWQgb3Igbm90IHJlc3BvbnNpdmUsIGluamVjdCBpdFxuICAgICAgICBsb2coXCJDb250ZW50IHNjcmlwdCBub3QgbG9hZGVkIG9yIG5vdCByZXNwb25zaXZlLCBpbmplY3Rpbmcgc2NyaXB0cy4uLlwiKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gSW5qZWN0IHRoZSBjb250ZW50IHNjcmlwdFxuICAgICAgICBhd2FpdCBjaHJvbWUuc2NyaXB0aW5nLmV4ZWN1dGVTY3JpcHQoe1xuICAgICAgICAgICAgdGFyZ2V0OiB7IHRhYklkIH0sXG4gICAgICAgICAgICBmaWxlczogW1wiY29udGVudC5qc1wiXSxcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIEFsc28gaW5qZWN0IGh0bWwyY2FudmFzIHN1cHBvcnQgc2NyaXB0IGlmIG5lZWRlZFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0KHtcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IHsgdGFiSWQgfSxcbiAgICAgICAgICAgICAgICBmaWxlczogW1wiY29udGVudC1odG1sMmNhbnZhcy5qcy5qc1wiXSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgLy8gTm90IGNyaXRpY2FsIGlmIHRoaXMgZmFpbHNcbiAgICAgICAgICAgIGxvZyhcIk5vdGU6IGh0bWwyY2FudmFzIHNjcmlwdCBpbmplY3Rpb24gc2tpcHBlZCBvciBmYWlsZWQ6XCIsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICBsb2coXCJDb250ZW50IHNjcmlwdHMgaW5qZWN0ZWQgc3VjY2Vzc2Z1bGx5IGluIHRhYjpcIiwgdGFiSWQpO1xuICAgICAgICAvLyBXYWl0IGEgbW9tZW50IHRvIGVuc3VyZSBzY3JpcHRzIGluaXRpYWxpemVcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMzAwKSk7XG4gICAgICAgIC8vIFZlcmlmeSB0aGUgY29udGVudCBzY3JpcHQgaXMgbm93IHJlc3BvbnNpdmVcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYklkLCB7IGFjdGlvbjogXCJwaW5nXCIgfSk7XG4gICAgICAgICAgICBsb2coXCJDb250ZW50IHNjcmlwdCBzdWNjZXNzZnVsbHkgaW5pdGlhbGl6ZWQgaW4gdGFiOlwiLCB0YWJJZCk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKHZlcmlmeUVycm9yKSB7XG4gICAgICAgICAgICBsb2dFcnJvcihcIkNvbnRlbnQgc2NyaXB0IGluamVjdGlvbiBzdWNjZWVkZWQgYnV0IHNjcmlwdCBpcyBub3QgcmVzcG9uc2l2ZTpcIiwgdmVyaWZ5RXJyb3IpO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ29udGVudCBzY3JpcHQgaW5qZWN0aW9uIHN1Y2NlZWRlZCBidXQgc2NyaXB0IGlzIG5vdCByZXNwb25zaXZlXCIpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dFcnJvcihcIkVycm9yIGluamVjdGluZyBjb250ZW50IHNjcmlwdHM6XCIsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxufVxuLy8gSGFuZGxlIG1lc3NhZ2VzIGZyb20gY29udGVudCBzY3JpcHQgb3Igc2lkZSBwYW5lbFxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xuICAgIGNvbnN0IGlzRnJvbUNvbnRlbnRTY3JpcHQgPSBzZW5kZXIudGFiICYmIHNlbmRlci50YWIuaWQ7XG4gICAgY29uc3QgaXNGcm9tU2lkZVBhbmVsID0gbWVzc2FnZS5zb3VyY2UgPT09IFwic2lkZVBhbmVsXCI7XG4gICAgbG9nKFwiTWVzc2FnZSByZWNlaXZlZDpcIiwgbWVzc2FnZS5hY3Rpb24sIGlzRnJvbUNvbnRlbnRTY3JpcHRcbiAgICAgICAgPyBgZnJvbSBjb250ZW50IHNjcmlwdCAodGFiICR7c2VuZGVyLnRhYi5pZH0pYFxuICAgICAgICA6IGlzRnJvbVNpZGVQYW5lbFxuICAgICAgICAgICAgPyBcImZyb20gc2lkZSBwYW5lbFwiXG4gICAgICAgICAgICA6IFwiZnJvbSB1bmtub3duIHNvdXJjZVwiKTtcbiAgICBzd2l0Y2ggKG1lc3NhZ2UuYWN0aW9uKSB7XG4gICAgICAgIGNhc2UgXCJwaW5nXCI6XG4gICAgICAgICAgICAvLyBSZXNwb25kIHRvIHBpbmcgcmVxdWVzdCB0byBjaGVjayBpZiBzZXJ2aWNlIHdvcmtlciBpcyBhbGl2ZVxuICAgICAgICAgICAgbG9nKFwiUmVzcG9uZGluZyB0byBwaW5nXCIpO1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIsIHJlc3BvbnNlOiBcInBvbmdcIiB9KTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwic2lkZVBhbmVsUmVhZHlcIjpcbiAgICAgICAgICAgIGxvZyhcIlNpZGUgcGFuZWwgaXMgcmVhZHlcIik7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6IFwib2tcIiB9KTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiY29udGVudFNjcmlwdFJlYWR5XCI6XG4gICAgICAgICAgICBsb2coXCJDb250ZW50IHNjcmlwdCBpcyByZWFkeSBvbiB0YWJcIiwgc2VuZGVyLnRhYj8uaWQpO1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIgfSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInN0YXJ0U2VsZWN0aW9uXCI6XG4gICAgICAgICAgICBpZiAoaXNGcm9tU2lkZVBhbmVsKSB7XG4gICAgICAgICAgICAgICAgLy8gV2hlbiBmcm9tIHNpZGUgcGFuZWwsIGdldCB0aGUgY3VycmVudCBhY3RpdmUgdGFiXG4gICAgICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoeyBhY3RpdmU6IHRydWUsIGN1cnJlbnRXaW5kb3c6IHRydWUgfSwgKHRhYnMpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRhYnMubGVuZ3RoID4gMCAmJiB0YWJzWzBdLmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsb2coXCJTaWRlIHBhbmVsIHJlcXVlc3RlZCBzZWxlY3Rpb24sIHVzaW5nIGFjdGl2ZSB0YWI6XCIsIHRhYnNbMF0uaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlU3RhcnRTZWxlY3Rpb24odGFic1swXS5pZCwgc2VuZFJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ0Vycm9yKFwiTm8gYWN0aXZlIHRhYiBmb3VuZCBmb3Igc2VsZWN0aW9uIGZyb20gc2lkZSBwYW5lbFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJlcnJvclwiLCBtZXNzYWdlOiBcIk5vIGFjdGl2ZSB0YWIgZm91bmRcIiB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBLZWVwIHJlc3BvbnNlIGNoYW5uZWwgb3BlblxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gV2hlbiBmcm9tIGNvbnRlbnQgc2NyaXB0LCB1c2UgdGhlIHNlbmRlciB0YWJcbiAgICAgICAgICAgICAgICBoYW5kbGVTdGFydFNlbGVjdGlvbihzZW5kZXIudGFiPy5pZCwgc2VuZFJlc3BvbnNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiY2FuY2VsU2VsZWN0aW9uXCI6XG4gICAgICAgICAgICBpZiAoaXNGcm9tU2lkZVBhbmVsKSB7XG4gICAgICAgICAgICAgICAgLy8gSGFuZGxlIGNhbmNlbGxhdGlvbiByZXF1ZXN0IGZyb20gc2lkZSBwYW5lbFxuICAgICAgICAgICAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0sICh0YWJzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0YWJzLmxlbmd0aCA+IDAgJiYgdGFic1swXS5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbG9nKFwiQ2FuY2VsbGluZyBzZWxlY3Rpb24gb24gdGFiOlwiLCB0YWJzWzBdLmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNlbmQgY2FuY2VsbGF0aW9uIG1lc3NhZ2UgdG8gY29udGVudCBzY3JpcHQsIGJ1dCBkb24ndCBmYWlsIGlmIGNvbnRlbnQgc2NyaXB0IGlzbid0IHJlc3BvbmRpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuc3VyZUNvbnRlbnRTY3JpcHRzSW5qZWN0ZWQodGFic1swXS5pZClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYnNbMF0uaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcImNhbmNlbFNlbGVjdGlvblwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9nKFwiU2VudCBjYW5jZWxTZWxlY3Rpb24gdG8gY29udGVudCBzY3JpcHRcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgdHJlYXQgdGhpcyBhcyBhbiBlcnJvciwgYXMgdGhlIGNvbnRlbnQgc2NyaXB0IG1pZ2h0IG5vdCBiZSBpbiBzZWxlY3Rpb24gbW9kZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvZyhcIk5vdGU6IENvdWxkIG5vdCBzZW5kIGNhbmNlbFNlbGVjdGlvbiB0byB0YWIsIGJ1dCBwcm9jZWVkaW5nIGFueXdheTpcIiwgZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBTdGlsbCByZXR1cm4gc3VjY2VzcyB0byB0aGUgc2lkZSBwYW5lbCB0byBsZXQgaXQgdXBkYXRlIHRoZSBVSVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJva1wiIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dFcnJvcihcIk5vIGFjdGl2ZSB0YWIgZm91bmQgZm9yIGNhbmNlbGxhdGlvblwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJlcnJvclwiLCBtZXNzYWdlOiBcIk5vIGFjdGl2ZSB0YWIgZm91bmRcIiB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBLZWVwIHJlc3BvbnNlIGNoYW5uZWwgb3BlblxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzZWxlY3Rpb25Db21wbGV0ZVwiOlxuICAgICAgICAgICAgbG9nKFwiU2VsZWN0aW9uIGNvbXBsZXRlZCBvbiB0YWJcIiwgc2VuZGVyLnRhYj8uaWQpO1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIgfSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInNlbGVjdGlvbkNhbmNlbGxlZFwiOlxuICAgICAgICAgICAgbG9nKFwiU2VsZWN0aW9uIGNhbmNlbGxlZCBvbiB0YWJcIiwgc2VuZGVyLnRhYj8uaWQpO1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIgfSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInByb2Nlc3NTZWxlY3Rpb25cIjpcbiAgICAgICAgICAgIGhhbmRsZVByb2Nlc3NTZWxlY3Rpb24oc2VuZGVyLnRhYj8uaWQsIG1lc3NhZ2UucmVjdCwgc2VuZFJlc3BvbnNlKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBLZWVwIHRoZSBtZXNzYWdlIGNoYW5uZWwgb3BlbiBmb3IgdGhlIGFzeW5jIHJlc3BvbnNlXG4gICAgICAgIGNhc2UgXCJzaWRlUGFuZWxPcGVuZWRcIjpcbiAgICAgICAgICAgIGxvZyhcIlNpZGUgcGFuZWwgb3BlbmVkXCIpO1xuICAgICAgICAgICAgLy8gRW5zdXJlIHRoZSBzaWRlIHBhbmVsIGlzIHVwIHRvIGRhdGUgd2l0aCBhbnkgZXhpc3Rpbmcgc2NyZWVuc2hvdHNcbiAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJva1wiIH0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBsb2coXCJVbmtub3duIG1lc3NhZ2UgYWN0aW9uOlwiLCBtZXNzYWdlLmFjdGlvbik7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6IFwiZXJyb3JcIiwgbWVzc2FnZTogXCJVbmtub3duIGFjdGlvblwiIH0pO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTsgLy8gS2VlcCB0aGUgY2hhbm5lbCBvcGVuIGZvciBmdXR1cmUgcmVzcG9uc2VzXG59KTtcbi8vIEhhbmRsZSBwcm9jZXNzIHNlbGVjdGlvbiBhY3Rpb24gKHJlcGxhY2VzIGNhcHR1cmVTZWxlY3Rpb24pXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVQcm9jZXNzU2VsZWN0aW9uKHRhYklkLCByZWN0LCBzZW5kUmVzcG9uc2UpIHtcbiAgICBsb2coXCJIYW5kbGluZyBwcm9jZXNzU2VsZWN0aW9uIGZvciB0YWJcIiwgdGFiSWQpO1xuICAgIGlmICghdGFiSWQpIHtcbiAgICAgICAgbG9nRXJyb3IoXCJObyB0YWIgSUQgcHJvdmlkZWQgZm9yIHByb2Nlc3NpbmdcIik7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJlcnJvclwiLCBtZXNzYWdlOiBcIk5vIHRhYiBJRFwiIH0pO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIENhcHR1cmUgdGhlIGZ1bGwgc2NyZWVuc2hvdCBvZiB0aGUgdmlzaWJsZSB0YWJcbiAgICAgICAgY29uc3Qgc2NyZWVuc2hvdCA9IGF3YWl0IGNocm9tZS50YWJzLmNhcHR1cmVWaXNpYmxlVGFiKHsgZm9ybWF0OiBcInBuZ1wiIH0pO1xuICAgICAgICAvLyBHZXQgdGhlIGRldmljZSBwaXhlbCByYXRpbyBmcm9tIHRoZSB0YWJcbiAgICAgICAgY29uc3QgW3sgcmVzdWx0IH1dID0gYXdhaXQgY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0KHtcbiAgICAgICAgICAgIHRhcmdldDogeyB0YWJJZCB9LFxuICAgICAgICAgICAgZnVuYzogKCkgPT4gd2luZG93LmRldmljZVBpeGVsUmF0aW8gfHwgMSxcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIFVzZSB0aGUgcmVzdWx0LCBkZWZhdWx0aW5nIHRvIDEgaWYgdW5kZWZpbmVkXG4gICAgICAgIGNvbnN0IGRldmljZVBpeGVsUmF0aW8gPSByZXN1bHQgPz8gMTtcbiAgICAgICAgbG9nKFwiU2NyZWVuc2hvdCBjYXB0dXJlZCwgdXBsb2FkaW5nIHRvIHNlcnZlciB3aXRoIHNlbGVjdGlvbiBkYXRhXCIpO1xuICAgICAgICAvLyBDcmVhdGUgZm9ybSBkYXRhIHdpdGggdGhlIGZ1bGwgc2NyZWVuc2hvdCBhbmQgc2VsZWN0aW9uIGNvb3JkaW5hdGVzXG4gICAgICAgIGNvbnN0IGZvcm1EYXRhID0gbmV3IEZvcm1EYXRhKCk7XG4gICAgICAgIC8vIENvbnZlcnQgYmFzZTY0IGRhdGEgVVJMIHRvIGJsb2JcbiAgICAgICAgY29uc3QgYmFzZTY0RGF0YSA9IHNjcmVlbnNob3QucmVwbGFjZSgvXmRhdGE6aW1hZ2VcXC9wbmc7YmFzZTY0LC8sIFwiXCIpO1xuICAgICAgICBjb25zdCBieXRlQ2hhcmFjdGVycyA9IGF0b2IoYmFzZTY0RGF0YSk7XG4gICAgICAgIGNvbnN0IGJ5dGVBcnJheXMgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgb2Zmc2V0ID0gMDsgb2Zmc2V0IDwgYnl0ZUNoYXJhY3RlcnMubGVuZ3RoOyBvZmZzZXQgKz0gNTEyKSB7XG4gICAgICAgICAgICBjb25zdCBzbGljZSA9IGJ5dGVDaGFyYWN0ZXJzLnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgNTEyKTtcbiAgICAgICAgICAgIGNvbnN0IGJ5dGVOdW1iZXJzID0gbmV3IEFycmF5KHNsaWNlLmxlbmd0aCk7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNsaWNlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgYnl0ZU51bWJlcnNbaV0gPSBzbGljZS5jaGFyQ29kZUF0KGkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYnl0ZUFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnl0ZU51bWJlcnMpO1xuICAgICAgICAgICAgYnl0ZUFycmF5cy5wdXNoKGJ5dGVBcnJheSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKGJ5dGVBcnJheXMsIHsgdHlwZTogXCJpbWFnZS9wbmdcIiB9KTtcbiAgICAgICAgLy8gQWRkIGRhdGEgdG8gRm9ybURhdGFcbiAgICAgICAgZm9ybURhdGEuYXBwZW5kKFwiaW1hZ2VcIiwgYmxvYiwgXCJzY3JlZW5zaG90LnBuZ1wiKTtcbiAgICAgICAgZm9ybURhdGEuYXBwZW5kKFwieFwiLCByZWN0LngudG9TdHJpbmcoKSk7XG4gICAgICAgIGZvcm1EYXRhLmFwcGVuZChcInlcIiwgcmVjdC55LnRvU3RyaW5nKCkpO1xuICAgICAgICBmb3JtRGF0YS5hcHBlbmQoXCJ3aWR0aFwiLCByZWN0LndpZHRoLnRvU3RyaW5nKCkpO1xuICAgICAgICBmb3JtRGF0YS5hcHBlbmQoXCJoZWlnaHRcIiwgcmVjdC5oZWlnaHQudG9TdHJpbmcoKSk7XG4gICAgICAgIGZvcm1EYXRhLmFwcGVuZChcImRwclwiLCBkZXZpY2VQaXhlbFJhdGlvLnRvU3RyaW5nKCkpO1xuICAgICAgICAvLyBTZW5kIHRvIHRoZSBzZXJ2ZXIgZm9yIHByb2Nlc3NpbmdcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChBUElfRU5EUE9JTlQsIHtcbiAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICAgICAgICBib2R5OiBmb3JtRGF0YSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgU2VydmVyIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgIGlmICghZGF0YS5pbWFnZVVybCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gaW1hZ2UgVVJMIGluIHNlcnZlciByZXNwb25zZVwiKTtcbiAgICAgICAgfVxuICAgICAgICBsb2coXCJTZXJ2ZXIgcHJvY2Vzc2VkIGltYWdlIHN1Y2Nlc3NmdWxseSwgVVJMOlwiLCBkYXRhLmltYWdlVXJsKTtcbiAgICAgICAgLy8gTm90aWZ5IHRoZSBzaWRlIHBhbmVsIG9mIHRoZSBzdWNjZXNzZnVsIGltYWdlIHByb2Nlc3NpbmdcbiAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgYWN0aW9uOiBcImltYWdlUHJvY2Vzc2VkXCIsXG4gICAgICAgICAgICBpbWFnZVVybDogZGF0YS5pbWFnZVVybCxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICB9KTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIsIGltYWdlVXJsOiBkYXRhLmltYWdlVXJsIH0pO1xuICAgIH1cbiAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcbiAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBwcm9jZXNzaW5nIHNlbGVjdGlvbjpcIiwgZXJyb3JNZXNzYWdlKTtcbiAgICAgICAgLy8gTm90aWZ5IHRoZSBzaWRlIHBhbmVsIG9mIHRoZSBlcnJvclxuICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICBhY3Rpb246IFwicHJvY2Vzc2luZ0Vycm9yXCIsXG4gICAgICAgICAgICBlcnJvcjogZXJyb3JNZXNzYWdlLFxuICAgICAgICB9KTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcImVycm9yXCIsIG1lc3NhZ2U6IGVycm9yTWVzc2FnZSB9KTtcbiAgICB9XG59XG4vLyBTYWZlIHdheSB0byBub3RpZnkgcG9wdXAgd2l0aG91dCBjYXVzaW5nIGVycm9ycyBpZiBpdCdzIG5vdCBvcGVuXG5mdW5jdGlvbiBub3RpZnlQb3B1cChtZXNzYWdlKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UobWVzc2FnZSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgLy8gSWdub3JlIGVycm9ycyAtIHBvcHVwIGlzIGxpa2VseSBqdXN0IG5vdCBvcGVuXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gSWdub3JlIGVycm9ycyAtIHBvcHVwIGlzIGxpa2VseSBqdXN0IG5vdCBvcGVuXG4gICAgfVxufVxuLy8gUHJvY2VzcyB0aGUgc2NyZWVuc2hvdCB3aXRob3V0IGRvd25sb2FkaW5nIC0gb25seSBkaXNwbGF5IGluIHNpZGUgcGFuZWxcbmFzeW5jIGZ1bmN0aW9uIHNhdmVTY3JlZW5zaG90KGRhdGFVcmwpIHtcbiAgICB0cnkge1xuICAgICAgICBsb2coXCJQcm9jZXNzaW5nIHNjcmVlbnNob3QgZm9yIGRpc3BsYXkgaW4gc2lkZSBwYW5lbCBvbmx5XCIpO1xuICAgICAgICAvLyBWZXJpZnkgaW1hZ2UgaGFzIGNvbnRlbnRcbiAgICAgICAgY29uc3QgYmFzZTY0RGF0YSA9IGRhdGFVcmwuc3BsaXQoXCIsXCIpWzFdO1xuICAgICAgICBjb25zdCBkZWNvZGVkTGVuZ3RoID0gYXRvYihiYXNlNjREYXRhKS5sZW5ndGg7XG4gICAgICAgIGxvZyhgSW1hZ2Ugc2l6ZTogJHtkZWNvZGVkTGVuZ3RofSBieXRlc2ApO1xuICAgICAgICBpZiAoZGVjb2RlZExlbmd0aCA8IDEwMCkge1xuICAgICAgICAgICAgbG9nKFwiV2FybmluZzogSW1hZ2UgYXBwZWFycyB0byBiZSB2ZXJ5IHNtYWxsXCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIFdlJ3JlIG5vIGxvbmdlciBkb3dubG9hZGluZyB0aGUgaW1hZ2Ugb3Igc2VuZGluZyBpdCB0byB0aGUgYW5hbHlzaXMgc2VydmVyXG4gICAgICAgIC8vIEp1c3QgbG9nIHRoYXQgd2UndmUgcHJvY2Vzc2VkIGl0XG4gICAgICAgIGxvZyhcIlNjcmVlbnNob3QgcHJvY2Vzc2VkIHN1Y2Nlc3NmdWxseSBmb3Igc2lkZSBwYW5lbCBkaXNwbGF5XCIpO1xuICAgIH1cbiAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBwcm9jZXNzaW5nIHNjcmVlbnNob3Q6XCIsIGVycm9yKTtcbiAgICB9XG59XG4vLyBLZWVwIHRoZSBzZXJ2aWNlIHdvcmtlciBhbGl2ZVxua2VlcEFsaXZlKCk7XG4vLyBGdW5jdGlvbiB0byBrZWVwIHRoZSBzZXJ2aWNlIHdvcmtlciBhbGl2ZVxuZnVuY3Rpb24ga2VlcEFsaXZlKCkge1xuICAgIHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgICAgICBsb2coYFNlcnZpY2Ugd29ya2VyIGFsaXZlIGNoZWNrOiAke3RpbWVzdGFtcH1gKTtcbiAgICB9LCAyNTAwMCk7IC8vIEV2ZXJ5IDI1IHNlY29uZHNcbn1cbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==
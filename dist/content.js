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
/*!************************!*\
  !*** ./src/content.ts ***!
  \************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils */ "./src/utils.ts");

// Variables for selection
let isSelecting = false;
let startPoint = null;
let selectedRect = null;
let selectionOverlay = null;
// Set up logging
const { log, error: logError } = (0,_utils__WEBPACK_IMPORTED_MODULE_0__.createContentLogger)();
// Announce when content script loads
log("Content script initialized");
chrome.runtime
    .sendMessage({ action: "contentScriptReady" })
    .then((response) => {
    log("Background acknowledged contentScriptReady:", response);
})
    .catch((err) => {
    logError("Failed to notify background of content script ready:", err);
});
// Set up message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log("Message received:", message.action, message);
    switch (message.action) {
        case "ping":
            // Simple response to check if content script is loaded
            log("Ping received, responding with pong");
            sendResponse({ status: "ok", response: "pong", from: "content_script" });
            break;
        case "startSelection":
            try {
                log("Starting selection process");
                // First check if we're already in selection mode
                if (isSelecting) {
                    log("Selection already in progress, ignoring duplicate request");
                    sendResponse({ status: "ok", message: "Selection already in progress" });
                    return true;
                }
                startSelection();
                sendResponse({ status: "ok" });
            }
            catch (error) {
                logError("Error starting selection:", error);
                sendResponse({
                    status: "error",
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            break;
        case "cancelSelection":
            try {
                log("Cancelling selection");
                cancelSelection();
                sendResponse({ status: "ok" });
            }
            catch (error) {
                logError("Error cancelling selection:", error);
                // Still return OK to avoid state mismatches
                sendResponse({ status: "ok" });
            }
            break;
        default:
            log("Unknown action:", message.action);
            sendResponse({ status: "error", message: "Unknown action" });
    }
    return true; // Keep message channel open for async responses
});
// Create and manage selection overlay
function createOverlay() {
    // Remove any existing overlay
    if (selectionOverlay) {
        selectionOverlay.remove();
    }
    // Create a container for our overlay panels
    const overlay = document.createElement("div");
    overlay.className = "vision-cms-selection";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.zIndex = "2147483647";
    overlay.style.pointerEvents = "none"; // Let mouse events pass through
    overlay.style.display = "none";
    overlay.style.boxSizing = "border-box";
    // Create the four panels that will form our overlay
    // These will be positioned to leave a "hole" where the selection is
    const panels = ["top", "right", "bottom", "left"].map((position) => {
        const panel = document.createElement("div");
        panel.className = `vision-cms-overlay-panel vision-cms-overlay-${position}`;
        panel.style.position = "absolute";
        panel.style.backgroundColor = "rgba(0, 0, 0, 0.5)"; // Dimmed background
        panel.style.pointerEvents = "none";
        panel.style.overflow = "hidden";
        return panel;
    });
    // Add panels to the overlay container
    panels.forEach((panel) => overlay.appendChild(panel));
    // Add a thin border element to highlight the selection
    const selectionBorder = document.createElement("div");
    selectionBorder.className = "vision-cms-selection-border";
    selectionBorder.style.position = "absolute";
    selectionBorder.style.boxSizing = "border-box";
    selectionBorder.style.border = "1px dashed white"; // White dashed border
    selectionBorder.style.pointerEvents = "none";
    overlay.appendChild(selectionBorder);
    document.body.appendChild(overlay);
    selectionOverlay = overlay;
    return overlay;
}
// Update overlay position
function updateOverlay(e) {
    if (!startPoint || !selectionOverlay)
        return;
    // Calculate the selection rectangle coordinates
    const x = Math.min(startPoint.x, e.clientX);
    const y = Math.min(startPoint.y, e.clientY);
    const width = Math.abs(e.clientX - startPoint.x);
    const height = Math.abs(e.clientY - startPoint.y);
    // Ensure minimum size for visibility
    const minSize = 5;
    const adjustedWidth = Math.max(width, minSize);
    const adjustedHeight = Math.max(height, minSize);
    // Show the overlay if it's hidden
    selectionOverlay.style.display = "block";
    // Update the positions of the four overlay panels
    // TOP panel (full width, from top of screen to top of selection)
    const topPanel = selectionOverlay.querySelector(".vision-cms-overlay-top");
    if (topPanel) {
        topPanel.style.top = "0";
        topPanel.style.left = "0";
        topPanel.style.width = "100%";
        topPanel.style.height = `${y}px`;
    }
    // RIGHT panel (from right of selection to right of screen, from top of selection to bottom of selection)
    const rightPanel = selectionOverlay.querySelector(".vision-cms-overlay-right");
    if (rightPanel) {
        rightPanel.style.top = `${y}px`;
        rightPanel.style.left = `${x + adjustedWidth}px`;
        rightPanel.style.width = `calc(100% - ${x + adjustedWidth}px)`;
        rightPanel.style.height = `${adjustedHeight}px`;
    }
    // BOTTOM panel (full width, from bottom of selection to bottom of screen)
    const bottomPanel = selectionOverlay.querySelector(".vision-cms-overlay-bottom");
    if (bottomPanel) {
        bottomPanel.style.top = `${y + adjustedHeight}px`;
        bottomPanel.style.left = "0";
        bottomPanel.style.width = "100%";
        bottomPanel.style.height = `calc(100% - ${y + adjustedHeight}px)`;
    }
    // LEFT panel (from left of screen to left of selection, from top of selection to bottom of selection)
    const leftPanel = selectionOverlay.querySelector(".vision-cms-overlay-left");
    if (leftPanel) {
        leftPanel.style.top = `${y}px`;
        leftPanel.style.left = "0";
        leftPanel.style.width = `${x}px`;
        leftPanel.style.height = `${adjustedHeight}px`;
    }
    // Update the selection border
    const selectionBorder = selectionOverlay.querySelector(".vision-cms-selection-border");
    if (selectionBorder) {
        selectionBorder.style.top = `${y}px`;
        selectionBorder.style.left = `${x}px`;
        selectionBorder.style.width = `${adjustedWidth}px`;
        selectionBorder.style.height = `${adjustedHeight}px`;
    }
    // Store the selection coordinates as data attributes for reference
    selectionOverlay.dataset.selectionX = String(x);
    selectionOverlay.dataset.selectionY = String(y);
    selectionOverlay.dataset.selectionWidth = String(adjustedWidth);
    selectionOverlay.dataset.selectionHeight = String(adjustedHeight);
}
// Start selection process
function startSelection() {
    console.log("Starting selection process");
    isSelecting = true;
    selectionOverlay = createOverlay();
    // Add CSS to disable text selection across the page and add viewport border
    const styleEl = document.createElement("style");
    styleEl.id = "vision-cms-disable-selection-style";
    styleEl.textContent = `
    body.vision-cms-selecting {
      user-select: none !important;
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      cursor: crosshair !important;
    }
    
    html.vision-cms-selecting {
      border: 1px solid #1a73e8 !important;
      box-sizing: border-box !important;
    }
  `;
    document.head.appendChild(styleEl);
    // Add class to body and html to apply styles
    document.body.classList.add("vision-cms-selecting");
    document.documentElement.classList.add("vision-cms-selecting");
    setupSelectionEventListeners();
}
// Set up event listeners for selection
function setupSelectionEventListeners() {
    // Remove any existing listeners first
    cleanupSelectionEventListeners();
    // Handle mouse down - start the selection rectangle
    const handleMouseDown = (e) => {
        // Prevent default browser behavior including text selection
        e.preventDefault();
        startPoint = { x: e.clientX, y: e.clientY };
        // Clear any existing selection overlay and create a new one
        if (selectionOverlay) {
            selectionOverlay.remove();
        }
        selectionOverlay = createOverlay();
        document.addEventListener("mousemove", updateOverlay);
    };
    // Handle mouse move - prevent text selection
    const handleMouseMove = (e) => {
        e.preventDefault();
    };
    // Handle mouse up - finish the selection and capture
    const handleMouseUp = (e) => {
        if (!startPoint || !selectionOverlay)
            return;
        // Prevent default browser behavior
        e.preventDefault();
        // Stop tracking mouse movement for this selection
        document.removeEventListener("mousemove", updateOverlay);
        // Get selection dimensions from the data attributes
        const x = Number(selectionOverlay.dataset.selectionX || "0");
        const y = Number(selectionOverlay.dataset.selectionY || "0");
        const width = Number(selectionOverlay.dataset.selectionWidth || "0");
        const height = Number(selectionOverlay.dataset.selectionHeight || "0");
        // Create a custom rect object with the stored dimensions
        selectedRect = {
            left: x,
            top: y,
            right: x + width,
            bottom: y + height,
            width: width,
            height: height,
            x: x,
            y: y,
            toJSON: () => ({ x, y, width, height }),
        };
        console.log("Selection completed, rect:", selectedRect);
        // Notify that selection is complete
        chrome.runtime.sendMessage({ action: "selectionComplete" });
        // Check if selection has a minimum size
        if (width > 10 && height > 10) {
            processSelection(selectedRect);
        }
        else {
            // Selection too small, just clean up this selection (not exit selection mode)
            console.log("Selection too small, removing just this selection");
            if (selectionOverlay) {
                selectionOverlay.remove();
                selectionOverlay = null;
            }
            startPoint = null;
        }
    };
    // Handle key down - escape exits selection mode
    const handleKeyDown = (e) => {
        if (e.key === "Escape") {
            cancelSelection();
        }
    };
    // Store the handlers on the window to be able to remove them later
    window.visionCmsMouseDown = handleMouseDown;
    window.visionCmsMouseMove = handleMouseMove;
    window.visionCmsMouseUp = handleMouseUp;
    window.visionCmsKeyDown = handleKeyDown;
    // Add the event listeners
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
}
// Clean up event listeners for selection
function cleanupSelectionEventListeners() {
    // Remove event listeners if they exist
    if (window.visionCmsMouseDown) {
        document.removeEventListener("mousedown", window.visionCmsMouseDown);
    }
    if (window.visionCmsMouseMove) {
        document.removeEventListener("mousemove", window.visionCmsMouseMove);
    }
    if (window.visionCmsMouseUp) {
        document.removeEventListener("mouseup", window.visionCmsMouseUp);
    }
    if (window.visionCmsKeyDown) {
        document.removeEventListener("keydown", window.visionCmsKeyDown);
    }
    // Remove mousemove listener for the current overlay if any
    document.removeEventListener("mousemove", updateOverlay);
}
// Cancel selection process
function cancelSelection() {
    console.log("Cancelling selection mode");
    isSelecting = false;
    if (selectionOverlay) {
        selectionOverlay.remove();
        selectionOverlay = null;
    }
    startPoint = null;
    selectedRect = null;
    // Remove the selection prevention styles
    document.body.classList.remove("vision-cms-selecting");
    document.documentElement.classList.remove("vision-cms-selecting");
    const styleEl = document.getElementById("vision-cms-disable-selection-style");
    if (styleEl) {
        styleEl.remove();
    }
    // Remove event listeners
    cleanupSelectionEventListeners();
    // Notify that selection was cancelled
    chrome.runtime.sendMessage({ action: "selectionCancelled" });
}
// Create capture visual indicator
function createCaptureIndicator(message, color = "#1a73e8") {
    const indicator = document.createElement("div");
    indicator.style.position = "fixed";
    indicator.style.top = "20px";
    indicator.style.left = "50%";
    indicator.style.transform = "translateX(-50%)";
    indicator.style.backgroundColor = color;
    indicator.style.color = "white";
    indicator.style.padding = "10px 20px";
    indicator.style.borderRadius = "4px";
    indicator.style.fontWeight = "bold";
    indicator.style.zIndex = "2147483647";
    indicator.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
    indicator.textContent = message;
    document.body.appendChild(indicator);
    return indicator;
}
// Update the capture indicator
function updateCaptureIndicator(indicator, message, color) {
    indicator.textContent = message;
    indicator.style.backgroundColor = color;
}
// Process the selected area by sending to background script
async function processSelection(rect) {
    console.log("Processing selection:", rect);
    // Create a visual indicator
    const indicator = createCaptureIndicator("Processing...");
    try {
        // Hide the selection border to ensure it's not in the captured image
        const selectionBorder = selectionOverlay?.querySelector(".vision-cms-selection-border");
        if (selectionBorder) {
            selectionBorder.style.display = "none";
        }
        // Display a processing UI
        if (selectionOverlay) {
            // Add a processing animation to the overlay
            selectionOverlay.style.background = "transparent"; // Ensure overlay is transparent for capture
            // Add a loading spinner inside the overlay
            const spinner = document.createElement("div");
            spinner.style.position = "absolute";
            spinner.style.top = "50%";
            spinner.style.left = "50%";
            spinner.style.transform = "translate(-50%, -50%)";
            spinner.style.width = "40px";
            spinner.style.height = "40px";
            spinner.style.border = "4px solid rgba(255, 255, 255, 0.3)";
            spinner.style.borderTop = "4px solid #1a73e8";
            spinner.style.borderRadius = "50%";
            spinner.style.animation = "vision-cms-spin 1s linear infinite";
            // Add the animation keyframes
            const style = document.createElement("style");
            style.textContent = `
        @keyframes vision-cms-spin {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `;
            document.head.appendChild(style);
            selectionOverlay.appendChild(spinner);
        }
        // Allow a brief moment for the UI to update before capturing
        await new Promise((resolve) => setTimeout(resolve, 50));
        // Send the selection to the background script for processing
        const response = await chrome.runtime.sendMessage({
            action: "processSelection",
            rect: {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
            },
        });
        console.log("Background script response:", response);
        // Show success indicator
        updateCaptureIndicator(indicator, "Processed!", "green");
        // Remove the selection overlay but stay in selection mode
        if (selectionOverlay) {
            selectionOverlay.remove();
            selectionOverlay = null;
        }
        startPoint = null;
        // Auto-remove indicator after delay
        setTimeout(() => indicator.remove(), 3000);
    }
    catch (error) {
        console.error("Processing failed:", error);
        // Show error
        updateCaptureIndicator(indicator, "Error!", "red");
        setTimeout(() => indicator.remove(), 3000);
        throw error;
    }
}

})();

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHVCQUF1QjtBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDZCQUE2QixxQkFBcUI7QUFDbEQ7QUFDQTtBQUNBO0FBQ0EscUNBQXFDLDZCQUE2QjtBQUNsRTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxpQ0FBaUMsOEJBQThCO0FBQy9EO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwrREFBK0Q7QUFDL0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxlQUFlO0FBQ2YsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWE7QUFDYixTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL3Zpc2lvbi1jbXMtZXh0ZW5zaW9uLy4vc3JjL3V0aWxzLnRzIiwid2VicGFjazovL3Zpc2lvbi1jbXMtZXh0ZW5zaW9uL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL3Zpc2lvbi1jbXMtZXh0ZW5zaW9uL3dlYnBhY2svcnVudGltZS9kZWZpbmUgcHJvcGVydHkgZ2V0dGVycyIsIndlYnBhY2s6Ly92aXNpb24tY21zLWV4dGVuc2lvbi93ZWJwYWNrL3J1bnRpbWUvaGFzT3duUHJvcGVydHkgc2hvcnRoYW5kIiwid2VicGFjazovL3Zpc2lvbi1jbXMtZXh0ZW5zaW9uL3dlYnBhY2svcnVudGltZS9tYWtlIG5hbWVzcGFjZSBvYmplY3QiLCJ3ZWJwYWNrOi8vdmlzaW9uLWNtcy1leHRlbnNpb24vLi9zcmMvY29udGVudC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFNoYXJlZCB1dGlsaXR5IGZ1bmN0aW9ucyBhbmQgdHlwZXMgZm9yIHRoZSBWaXNpb24gQ01TIGV4dGVuc2lvblxuICovXG4vLyBMb2dnZXIgZm9yIGJhY2tncm91bmQgc2NyaXB0XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQmFja2dyb3VuZExvZ2dlcigpIHtcbiAgICBjb25zdCBwcmVmaXggPSBcIvCflIQgQmFja2dyb3VuZDpcIjtcbiAgICByZXR1cm4ge1xuICAgICAgICBsb2c6ICguLi5hcmdzKSA9PiBjb25zb2xlLmxvZyhwcmVmaXgsIC4uLmFyZ3MpLFxuICAgICAgICBlcnJvcjogKC4uLmFyZ3MpID0+IGNvbnNvbGUuZXJyb3IocHJlZml4LCBcIkVSUk9SOlwiLCAuLi5hcmdzKSxcbiAgICB9O1xufVxuLy8gTG9nZ2VyIGZvciBzaWRlIHBhbmVsXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU2lkZVBhbmVsTG9nZ2VyKCkge1xuICAgIGNvbnN0IHByZWZpeCA9IFwi8J+TiyBTaWRlIFBhbmVsOlwiO1xuICAgIHJldHVybiB7XG4gICAgICAgIGxvZzogKC4uLmFyZ3MpID0+IGNvbnNvbGUubG9nKHByZWZpeCwgLi4uYXJncyksXG4gICAgICAgIGVycm9yOiAoLi4uYXJncykgPT4gY29uc29sZS5lcnJvcihwcmVmaXgsIFwiRVJST1I6XCIsIC4uLmFyZ3MpLFxuICAgIH07XG59XG4vLyBMb2dnZXIgZm9yIGNvbnRlbnQgc2NyaXB0XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29udGVudExvZ2dlcigpIHtcbiAgICBjb25zdCBwcmVmaXggPSBcIvCfjJAgQ29udGVudDpcIjtcbiAgICByZXR1cm4ge1xuICAgICAgICBsb2c6ICguLi5hcmdzKSA9PiBjb25zb2xlLmxvZyhwcmVmaXgsIC4uLmFyZ3MpLFxuICAgICAgICBlcnJvcjogKC4uLmFyZ3MpID0+IGNvbnNvbGUuZXJyb3IocHJlZml4LCBcIkVSUk9SOlwiLCAuLi5hcmdzKSxcbiAgICB9O1xufVxuLy8gR2VuZXJhdGUgYSB0aW1lc3RhbXAtYmFzZWQgZmlsZW5hbWVcbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUZpbGVuYW1lKCkge1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IHllYXIgPSBkYXRlLmdldEZ1bGxZZWFyKCk7XG4gICAgY29uc3QgbW9udGggPSBTdHJpbmcoZGF0ZS5nZXRNb250aCgpICsgMSkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICAgIGNvbnN0IGRheSA9IFN0cmluZyhkYXRlLmdldERhdGUoKSkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICAgIGNvbnN0IGhvdXJzID0gU3RyaW5nKGRhdGUuZ2V0SG91cnMoKSkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICAgIGNvbnN0IG1pbnV0ZXMgPSBTdHJpbmcoZGF0ZS5nZXRNaW51dGVzKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICBjb25zdCBzZWNvbmRzID0gU3RyaW5nKGRhdGUuZ2V0U2Vjb25kcygpKS5wYWRTdGFydCgyLCBcIjBcIik7XG4gICAgY29uc3QgdGltZXN0YW1wID0gYCR7eWVhcn0ke21vbnRofSR7ZGF5fV8ke2hvdXJzfSR7bWludXRlc30ke3NlY29uZHN9YDtcbiAgICByZXR1cm4gYHZpc2lvbl9jbXNfc25pcHBldF8ke3RpbWVzdGFtcH0ucG5nYDtcbn1cbiIsIi8vIFRoZSBtb2R1bGUgY2FjaGVcbnZhciBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX18gPSB7fTtcblxuLy8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbmZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG5cdHZhciBjYWNoZWRNb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdO1xuXHRpZiAoY2FjaGVkTW9kdWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkTW9kdWxlLmV4cG9ydHM7XG5cdH1cblx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcblx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF0gPSB7XG5cdFx0Ly8gbm8gbW9kdWxlLmlkIG5lZWRlZFxuXHRcdC8vIG5vIG1vZHVsZS5sb2FkZWQgbmVlZGVkXG5cdFx0ZXhwb3J0czoge31cblx0fTtcblxuXHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cblx0X193ZWJwYWNrX21vZHVsZXNfX1ttb2R1bGVJZF0obW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cblx0Ly8gUmV0dXJuIHRoZSBleHBvcnRzIG9mIHRoZSBtb2R1bGVcblx0cmV0dXJuIG1vZHVsZS5leHBvcnRzO1xufVxuXG4iLCIvLyBkZWZpbmUgZ2V0dGVyIGZ1bmN0aW9ucyBmb3IgaGFybW9ueSBleHBvcnRzXG5fX3dlYnBhY2tfcmVxdWlyZV9fLmQgPSAoZXhwb3J0cywgZGVmaW5pdGlvbikgPT4ge1xuXHRmb3IodmFyIGtleSBpbiBkZWZpbml0aW9uKSB7XG5cdFx0aWYoX193ZWJwYWNrX3JlcXVpcmVfXy5vKGRlZmluaXRpb24sIGtleSkgJiYgIV9fd2VicGFja19yZXF1aXJlX18ubyhleHBvcnRzLCBrZXkpKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywga2V5LCB7IGVudW1lcmFibGU6IHRydWUsIGdldDogZGVmaW5pdGlvbltrZXldIH0pO1xuXHRcdH1cblx0fVxufTsiLCJfX3dlYnBhY2tfcmVxdWlyZV9fLm8gPSAob2JqLCBwcm9wKSA9PiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCkpIiwiLy8gZGVmaW5lIF9fZXNNb2R1bGUgb24gZXhwb3J0c1xuX193ZWJwYWNrX3JlcXVpcmVfXy5yID0gKGV4cG9ydHMpID0+IHtcblx0aWYodHlwZW9mIFN5bWJvbCAhPT0gJ3VuZGVmaW5lZCcgJiYgU3ltYm9sLnRvU3RyaW5nVGFnKSB7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFN5bWJvbC50b1N0cmluZ1RhZywgeyB2YWx1ZTogJ01vZHVsZScgfSk7XG5cdH1cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsICdfX2VzTW9kdWxlJywgeyB2YWx1ZTogdHJ1ZSB9KTtcbn07IiwiaW1wb3J0IHsgY3JlYXRlQ29udGVudExvZ2dlciB9IGZyb20gXCIuL3V0aWxzXCI7XG4vLyBWYXJpYWJsZXMgZm9yIHNlbGVjdGlvblxubGV0IGlzU2VsZWN0aW5nID0gZmFsc2U7XG5sZXQgc3RhcnRQb2ludCA9IG51bGw7XG5sZXQgc2VsZWN0ZWRSZWN0ID0gbnVsbDtcbmxldCBzZWxlY3Rpb25PdmVybGF5ID0gbnVsbDtcbi8vIFNldCB1cCBsb2dnaW5nXG5jb25zdCB7IGxvZywgZXJyb3I6IGxvZ0Vycm9yIH0gPSBjcmVhdGVDb250ZW50TG9nZ2VyKCk7XG4vLyBBbm5vdW5jZSB3aGVuIGNvbnRlbnQgc2NyaXB0IGxvYWRzXG5sb2coXCJDb250ZW50IHNjcmlwdCBpbml0aWFsaXplZFwiKTtcbmNocm9tZS5ydW50aW1lXG4gICAgLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiBcImNvbnRlbnRTY3JpcHRSZWFkeVwiIH0pXG4gICAgLnRoZW4oKHJlc3BvbnNlKSA9PiB7XG4gICAgbG9nKFwiQmFja2dyb3VuZCBhY2tub3dsZWRnZWQgY29udGVudFNjcmlwdFJlYWR5OlwiLCByZXNwb25zZSk7XG59KVxuICAgIC5jYXRjaCgoZXJyKSA9PiB7XG4gICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gbm90aWZ5IGJhY2tncm91bmQgb2YgY29udGVudCBzY3JpcHQgcmVhZHk6XCIsIGVycik7XG59KTtcbi8vIFNldCB1cCBtZXNzYWdlIGxpc3RlbmVyXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gICAgbG9nKFwiTWVzc2FnZSByZWNlaXZlZDpcIiwgbWVzc2FnZS5hY3Rpb24sIG1lc3NhZ2UpO1xuICAgIHN3aXRjaCAobWVzc2FnZS5hY3Rpb24pIHtcbiAgICAgICAgY2FzZSBcInBpbmdcIjpcbiAgICAgICAgICAgIC8vIFNpbXBsZSByZXNwb25zZSB0byBjaGVjayBpZiBjb250ZW50IHNjcmlwdCBpcyBsb2FkZWRcbiAgICAgICAgICAgIGxvZyhcIlBpbmcgcmVjZWl2ZWQsIHJlc3BvbmRpbmcgd2l0aCBwb25nXCIpO1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIsIHJlc3BvbnNlOiBcInBvbmdcIiwgZnJvbTogXCJjb250ZW50X3NjcmlwdFwiIH0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzdGFydFNlbGVjdGlvblwiOlxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBsb2coXCJTdGFydGluZyBzZWxlY3Rpb24gcHJvY2Vzc1wiKTtcbiAgICAgICAgICAgICAgICAvLyBGaXJzdCBjaGVjayBpZiB3ZSdyZSBhbHJlYWR5IGluIHNlbGVjdGlvbiBtb2RlXG4gICAgICAgICAgICAgICAgaWYgKGlzU2VsZWN0aW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZyhcIlNlbGVjdGlvbiBhbHJlYWR5IGluIHByb2dyZXNzLCBpZ25vcmluZyBkdXBsaWNhdGUgcmVxdWVzdFwiKTtcbiAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIsIG1lc3NhZ2U6IFwiU2VsZWN0aW9uIGFscmVhZHkgaW4gcHJvZ3Jlc3NcIiB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHN0YXJ0U2VsZWN0aW9uKCk7XG4gICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIHN0YXJ0aW5nIHNlbGVjdGlvbjpcIiwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1czogXCJlcnJvclwiLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImNhbmNlbFNlbGVjdGlvblwiOlxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBsb2coXCJDYW5jZWxsaW5nIHNlbGVjdGlvblwiKTtcbiAgICAgICAgICAgICAgICBjYW5jZWxTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6IFwib2tcIiB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgY2FuY2VsbGluZyBzZWxlY3Rpb246XCIsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAvLyBTdGlsbCByZXR1cm4gT0sgdG8gYXZvaWQgc3RhdGUgbWlzbWF0Y2hlc1xuICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJva1wiIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBsb2coXCJVbmtub3duIGFjdGlvbjpcIiwgbWVzc2FnZS5hY3Rpb24pO1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcImVycm9yXCIsIG1lc3NhZ2U6IFwiVW5rbm93biBhY3Rpb25cIiB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7IC8vIEtlZXAgbWVzc2FnZSBjaGFubmVsIG9wZW4gZm9yIGFzeW5jIHJlc3BvbnNlc1xufSk7XG4vLyBDcmVhdGUgYW5kIG1hbmFnZSBzZWxlY3Rpb24gb3ZlcmxheVxuZnVuY3Rpb24gY3JlYXRlT3ZlcmxheSgpIHtcbiAgICAvLyBSZW1vdmUgYW55IGV4aXN0aW5nIG92ZXJsYXlcbiAgICBpZiAoc2VsZWN0aW9uT3ZlcmxheSkge1xuICAgICAgICBzZWxlY3Rpb25PdmVybGF5LnJlbW92ZSgpO1xuICAgIH1cbiAgICAvLyBDcmVhdGUgYSBjb250YWluZXIgZm9yIG91ciBvdmVybGF5IHBhbmVsc1xuICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJ2aXNpb24tY21zLXNlbGVjdGlvblwiO1xuICAgIG92ZXJsYXkuc3R5bGUucG9zaXRpb24gPSBcImZpeGVkXCI7XG4gICAgb3ZlcmxheS5zdHlsZS50b3AgPSBcIjBcIjtcbiAgICBvdmVybGF5LnN0eWxlLmxlZnQgPSBcIjBcIjtcbiAgICBvdmVybGF5LnN0eWxlLndpZHRoID0gXCIxMDAlXCI7XG4gICAgb3ZlcmxheS5zdHlsZS5oZWlnaHQgPSBcIjEwMCVcIjtcbiAgICBvdmVybGF5LnN0eWxlLnpJbmRleCA9IFwiMjE0NzQ4MzY0N1wiO1xuICAgIG92ZXJsYXkuc3R5bGUucG9pbnRlckV2ZW50cyA9IFwibm9uZVwiOyAvLyBMZXQgbW91c2UgZXZlbnRzIHBhc3MgdGhyb3VnaFxuICAgIG92ZXJsYXkuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIG92ZXJsYXkuc3R5bGUuYm94U2l6aW5nID0gXCJib3JkZXItYm94XCI7XG4gICAgLy8gQ3JlYXRlIHRoZSBmb3VyIHBhbmVscyB0aGF0IHdpbGwgZm9ybSBvdXIgb3ZlcmxheVxuICAgIC8vIFRoZXNlIHdpbGwgYmUgcG9zaXRpb25lZCB0byBsZWF2ZSBhIFwiaG9sZVwiIHdoZXJlIHRoZSBzZWxlY3Rpb24gaXNcbiAgICBjb25zdCBwYW5lbHMgPSBbXCJ0b3BcIiwgXCJyaWdodFwiLCBcImJvdHRvbVwiLCBcImxlZnRcIl0ubWFwKChwb3NpdGlvbikgPT4ge1xuICAgICAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHBhbmVsLmNsYXNzTmFtZSA9IGB2aXNpb24tY21zLW92ZXJsYXktcGFuZWwgdmlzaW9uLWNtcy1vdmVybGF5LSR7cG9zaXRpb259YDtcbiAgICAgICAgcGFuZWwuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgICAgIHBhbmVsLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwicmdiYSgwLCAwLCAwLCAwLjUpXCI7IC8vIERpbW1lZCBiYWNrZ3JvdW5kXG4gICAgICAgIHBhbmVsLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcIm5vbmVcIjtcbiAgICAgICAgcGFuZWwuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuICAgICAgICByZXR1cm4gcGFuZWw7XG4gICAgfSk7XG4gICAgLy8gQWRkIHBhbmVscyB0byB0aGUgb3ZlcmxheSBjb250YWluZXJcbiAgICBwYW5lbHMuZm9yRWFjaCgocGFuZWwpID0+IG92ZXJsYXkuYXBwZW5kQ2hpbGQocGFuZWwpKTtcbiAgICAvLyBBZGQgYSB0aGluIGJvcmRlciBlbGVtZW50IHRvIGhpZ2hsaWdodCB0aGUgc2VsZWN0aW9uXG4gICAgY29uc3Qgc2VsZWN0aW9uQm9yZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBzZWxlY3Rpb25Cb3JkZXIuY2xhc3NOYW1lID0gXCJ2aXNpb24tY21zLXNlbGVjdGlvbi1ib3JkZXJcIjtcbiAgICBzZWxlY3Rpb25Cb3JkZXIuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgc2VsZWN0aW9uQm9yZGVyLnN0eWxlLmJveFNpemluZyA9IFwiYm9yZGVyLWJveFwiO1xuICAgIHNlbGVjdGlvbkJvcmRlci5zdHlsZS5ib3JkZXIgPSBcIjFweCBkYXNoZWQgd2hpdGVcIjsgLy8gV2hpdGUgZGFzaGVkIGJvcmRlclxuICAgIHNlbGVjdGlvbkJvcmRlci5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJub25lXCI7XG4gICAgb3ZlcmxheS5hcHBlbmRDaGlsZChzZWxlY3Rpb25Cb3JkZXIpO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG4gICAgc2VsZWN0aW9uT3ZlcmxheSA9IG92ZXJsYXk7XG4gICAgcmV0dXJuIG92ZXJsYXk7XG59XG4vLyBVcGRhdGUgb3ZlcmxheSBwb3NpdGlvblxuZnVuY3Rpb24gdXBkYXRlT3ZlcmxheShlKSB7XG4gICAgaWYgKCFzdGFydFBvaW50IHx8ICFzZWxlY3Rpb25PdmVybGF5KVxuICAgICAgICByZXR1cm47XG4gICAgLy8gQ2FsY3VsYXRlIHRoZSBzZWxlY3Rpb24gcmVjdGFuZ2xlIGNvb3JkaW5hdGVzXG4gICAgY29uc3QgeCA9IE1hdGgubWluKHN0YXJ0UG9pbnQueCwgZS5jbGllbnRYKTtcbiAgICBjb25zdCB5ID0gTWF0aC5taW4oc3RhcnRQb2ludC55LCBlLmNsaWVudFkpO1xuICAgIGNvbnN0IHdpZHRoID0gTWF0aC5hYnMoZS5jbGllbnRYIC0gc3RhcnRQb2ludC54KTtcbiAgICBjb25zdCBoZWlnaHQgPSBNYXRoLmFicyhlLmNsaWVudFkgLSBzdGFydFBvaW50LnkpO1xuICAgIC8vIEVuc3VyZSBtaW5pbXVtIHNpemUgZm9yIHZpc2liaWxpdHlcbiAgICBjb25zdCBtaW5TaXplID0gNTtcbiAgICBjb25zdCBhZGp1c3RlZFdpZHRoID0gTWF0aC5tYXgod2lkdGgsIG1pblNpemUpO1xuICAgIGNvbnN0IGFkanVzdGVkSGVpZ2h0ID0gTWF0aC5tYXgoaGVpZ2h0LCBtaW5TaXplKTtcbiAgICAvLyBTaG93IHRoZSBvdmVybGF5IGlmIGl0J3MgaGlkZGVuXG4gICAgc2VsZWN0aW9uT3ZlcmxheS5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIC8vIFVwZGF0ZSB0aGUgcG9zaXRpb25zIG9mIHRoZSBmb3VyIG92ZXJsYXkgcGFuZWxzXG4gICAgLy8gVE9QIHBhbmVsIChmdWxsIHdpZHRoLCBmcm9tIHRvcCBvZiBzY3JlZW4gdG8gdG9wIG9mIHNlbGVjdGlvbilcbiAgICBjb25zdCB0b3BQYW5lbCA9IHNlbGVjdGlvbk92ZXJsYXkucXVlcnlTZWxlY3RvcihcIi52aXNpb24tY21zLW92ZXJsYXktdG9wXCIpO1xuICAgIGlmICh0b3BQYW5lbCkge1xuICAgICAgICB0b3BQYW5lbC5zdHlsZS50b3AgPSBcIjBcIjtcbiAgICAgICAgdG9wUGFuZWwuc3R5bGUubGVmdCA9IFwiMFwiO1xuICAgICAgICB0b3BQYW5lbC5zdHlsZS53aWR0aCA9IFwiMTAwJVwiO1xuICAgICAgICB0b3BQYW5lbC5zdHlsZS5oZWlnaHQgPSBgJHt5fXB4YDtcbiAgICB9XG4gICAgLy8gUklHSFQgcGFuZWwgKGZyb20gcmlnaHQgb2Ygc2VsZWN0aW9uIHRvIHJpZ2h0IG9mIHNjcmVlbiwgZnJvbSB0b3Agb2Ygc2VsZWN0aW9uIHRvIGJvdHRvbSBvZiBzZWxlY3Rpb24pXG4gICAgY29uc3QgcmlnaHRQYW5lbCA9IHNlbGVjdGlvbk92ZXJsYXkucXVlcnlTZWxlY3RvcihcIi52aXNpb24tY21zLW92ZXJsYXktcmlnaHRcIik7XG4gICAgaWYgKHJpZ2h0UGFuZWwpIHtcbiAgICAgICAgcmlnaHRQYW5lbC5zdHlsZS50b3AgPSBgJHt5fXB4YDtcbiAgICAgICAgcmlnaHRQYW5lbC5zdHlsZS5sZWZ0ID0gYCR7eCArIGFkanVzdGVkV2lkdGh9cHhgO1xuICAgICAgICByaWdodFBhbmVsLnN0eWxlLndpZHRoID0gYGNhbGMoMTAwJSAtICR7eCArIGFkanVzdGVkV2lkdGh9cHgpYDtcbiAgICAgICAgcmlnaHRQYW5lbC5zdHlsZS5oZWlnaHQgPSBgJHthZGp1c3RlZEhlaWdodH1weGA7XG4gICAgfVxuICAgIC8vIEJPVFRPTSBwYW5lbCAoZnVsbCB3aWR0aCwgZnJvbSBib3R0b20gb2Ygc2VsZWN0aW9uIHRvIGJvdHRvbSBvZiBzY3JlZW4pXG4gICAgY29uc3QgYm90dG9tUGFuZWwgPSBzZWxlY3Rpb25PdmVybGF5LnF1ZXJ5U2VsZWN0b3IoXCIudmlzaW9uLWNtcy1vdmVybGF5LWJvdHRvbVwiKTtcbiAgICBpZiAoYm90dG9tUGFuZWwpIHtcbiAgICAgICAgYm90dG9tUGFuZWwuc3R5bGUudG9wID0gYCR7eSArIGFkanVzdGVkSGVpZ2h0fXB4YDtcbiAgICAgICAgYm90dG9tUGFuZWwuc3R5bGUubGVmdCA9IFwiMFwiO1xuICAgICAgICBib3R0b21QYW5lbC5zdHlsZS53aWR0aCA9IFwiMTAwJVwiO1xuICAgICAgICBib3R0b21QYW5lbC5zdHlsZS5oZWlnaHQgPSBgY2FsYygxMDAlIC0gJHt5ICsgYWRqdXN0ZWRIZWlnaHR9cHgpYDtcbiAgICB9XG4gICAgLy8gTEVGVCBwYW5lbCAoZnJvbSBsZWZ0IG9mIHNjcmVlbiB0byBsZWZ0IG9mIHNlbGVjdGlvbiwgZnJvbSB0b3Agb2Ygc2VsZWN0aW9uIHRvIGJvdHRvbSBvZiBzZWxlY3Rpb24pXG4gICAgY29uc3QgbGVmdFBhbmVsID0gc2VsZWN0aW9uT3ZlcmxheS5xdWVyeVNlbGVjdG9yKFwiLnZpc2lvbi1jbXMtb3ZlcmxheS1sZWZ0XCIpO1xuICAgIGlmIChsZWZ0UGFuZWwpIHtcbiAgICAgICAgbGVmdFBhbmVsLnN0eWxlLnRvcCA9IGAke3l9cHhgO1xuICAgICAgICBsZWZ0UGFuZWwuc3R5bGUubGVmdCA9IFwiMFwiO1xuICAgICAgICBsZWZ0UGFuZWwuc3R5bGUud2lkdGggPSBgJHt4fXB4YDtcbiAgICAgICAgbGVmdFBhbmVsLnN0eWxlLmhlaWdodCA9IGAke2FkanVzdGVkSGVpZ2h0fXB4YDtcbiAgICB9XG4gICAgLy8gVXBkYXRlIHRoZSBzZWxlY3Rpb24gYm9yZGVyXG4gICAgY29uc3Qgc2VsZWN0aW9uQm9yZGVyID0gc2VsZWN0aW9uT3ZlcmxheS5xdWVyeVNlbGVjdG9yKFwiLnZpc2lvbi1jbXMtc2VsZWN0aW9uLWJvcmRlclwiKTtcbiAgICBpZiAoc2VsZWN0aW9uQm9yZGVyKSB7XG4gICAgICAgIHNlbGVjdGlvbkJvcmRlci5zdHlsZS50b3AgPSBgJHt5fXB4YDtcbiAgICAgICAgc2VsZWN0aW9uQm9yZGVyLnN0eWxlLmxlZnQgPSBgJHt4fXB4YDtcbiAgICAgICAgc2VsZWN0aW9uQm9yZGVyLnN0eWxlLndpZHRoID0gYCR7YWRqdXN0ZWRXaWR0aH1weGA7XG4gICAgICAgIHNlbGVjdGlvbkJvcmRlci5zdHlsZS5oZWlnaHQgPSBgJHthZGp1c3RlZEhlaWdodH1weGA7XG4gICAgfVxuICAgIC8vIFN0b3JlIHRoZSBzZWxlY3Rpb24gY29vcmRpbmF0ZXMgYXMgZGF0YSBhdHRyaWJ1dGVzIGZvciByZWZlcmVuY2VcbiAgICBzZWxlY3Rpb25PdmVybGF5LmRhdGFzZXQuc2VsZWN0aW9uWCA9IFN0cmluZyh4KTtcbiAgICBzZWxlY3Rpb25PdmVybGF5LmRhdGFzZXQuc2VsZWN0aW9uWSA9IFN0cmluZyh5KTtcbiAgICBzZWxlY3Rpb25PdmVybGF5LmRhdGFzZXQuc2VsZWN0aW9uV2lkdGggPSBTdHJpbmcoYWRqdXN0ZWRXaWR0aCk7XG4gICAgc2VsZWN0aW9uT3ZlcmxheS5kYXRhc2V0LnNlbGVjdGlvbkhlaWdodCA9IFN0cmluZyhhZGp1c3RlZEhlaWdodCk7XG59XG4vLyBTdGFydCBzZWxlY3Rpb24gcHJvY2Vzc1xuZnVuY3Rpb24gc3RhcnRTZWxlY3Rpb24oKSB7XG4gICAgY29uc29sZS5sb2coXCJTdGFydGluZyBzZWxlY3Rpb24gcHJvY2Vzc1wiKTtcbiAgICBpc1NlbGVjdGluZyA9IHRydWU7XG4gICAgc2VsZWN0aW9uT3ZlcmxheSA9IGNyZWF0ZU92ZXJsYXkoKTtcbiAgICAvLyBBZGQgQ1NTIHRvIGRpc2FibGUgdGV4dCBzZWxlY3Rpb24gYWNyb3NzIHRoZSBwYWdlIGFuZCBhZGQgdmlld3BvcnQgYm9yZGVyXG4gICAgY29uc3Qgc3R5bGVFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICBzdHlsZUVsLmlkID0gXCJ2aXNpb24tY21zLWRpc2FibGUtc2VsZWN0aW9uLXN0eWxlXCI7XG4gICAgc3R5bGVFbC50ZXh0Q29udGVudCA9IGBcbiAgICBib2R5LnZpc2lvbi1jbXMtc2VsZWN0aW5nIHtcbiAgICAgIHVzZXItc2VsZWN0OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICAtd2Via2l0LXVzZXItc2VsZWN0OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICAtbW96LXVzZXItc2VsZWN0OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICAtbXMtdXNlci1zZWxlY3Q6IG5vbmUgIWltcG9ydGFudDtcbiAgICAgIGN1cnNvcjogY3Jvc3NoYWlyICFpbXBvcnRhbnQ7XG4gICAgfVxuICAgIFxuICAgIGh0bWwudmlzaW9uLWNtcy1zZWxlY3Rpbmcge1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgIzFhNzNlOCAhaW1wb3J0YW50O1xuICAgICAgYm94LXNpemluZzogYm9yZGVyLWJveCAhaW1wb3J0YW50O1xuICAgIH1cbiAgYDtcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlRWwpO1xuICAgIC8vIEFkZCBjbGFzcyB0byBib2R5IGFuZCBodG1sIHRvIGFwcGx5IHN0eWxlc1xuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZChcInZpc2lvbi1jbXMtc2VsZWN0aW5nXCIpO1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGFzc0xpc3QuYWRkKFwidmlzaW9uLWNtcy1zZWxlY3RpbmdcIik7XG4gICAgc2V0dXBTZWxlY3Rpb25FdmVudExpc3RlbmVycygpO1xufVxuLy8gU2V0IHVwIGV2ZW50IGxpc3RlbmVycyBmb3Igc2VsZWN0aW9uXG5mdW5jdGlvbiBzZXR1cFNlbGVjdGlvbkV2ZW50TGlzdGVuZXJzKCkge1xuICAgIC8vIFJlbW92ZSBhbnkgZXhpc3RpbmcgbGlzdGVuZXJzIGZpcnN0XG4gICAgY2xlYW51cFNlbGVjdGlvbkV2ZW50TGlzdGVuZXJzKCk7XG4gICAgLy8gSGFuZGxlIG1vdXNlIGRvd24gLSBzdGFydCB0aGUgc2VsZWN0aW9uIHJlY3RhbmdsZVxuICAgIGNvbnN0IGhhbmRsZU1vdXNlRG93biA9IChlKSA9PiB7XG4gICAgICAgIC8vIFByZXZlbnQgZGVmYXVsdCBicm93c2VyIGJlaGF2aW9yIGluY2x1ZGluZyB0ZXh0IHNlbGVjdGlvblxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHN0YXJ0UG9pbnQgPSB7IHg6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZIH07XG4gICAgICAgIC8vIENsZWFyIGFueSBleGlzdGluZyBzZWxlY3Rpb24gb3ZlcmxheSBhbmQgY3JlYXRlIGEgbmV3IG9uZVxuICAgICAgICBpZiAoc2VsZWN0aW9uT3ZlcmxheSkge1xuICAgICAgICAgICAgc2VsZWN0aW9uT3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBzZWxlY3Rpb25PdmVybGF5ID0gY3JlYXRlT3ZlcmxheSgpO1xuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIHVwZGF0ZU92ZXJsYXkpO1xuICAgIH07XG4gICAgLy8gSGFuZGxlIG1vdXNlIG1vdmUgLSBwcmV2ZW50IHRleHQgc2VsZWN0aW9uXG4gICAgY29uc3QgaGFuZGxlTW91c2VNb3ZlID0gKGUpID0+IHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH07XG4gICAgLy8gSGFuZGxlIG1vdXNlIHVwIC0gZmluaXNoIHRoZSBzZWxlY3Rpb24gYW5kIGNhcHR1cmVcbiAgICBjb25zdCBoYW5kbGVNb3VzZVVwID0gKGUpID0+IHtcbiAgICAgICAgaWYgKCFzdGFydFBvaW50IHx8ICFzZWxlY3Rpb25PdmVybGF5KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAvLyBQcmV2ZW50IGRlZmF1bHQgYnJvd3NlciBiZWhhdmlvclxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIC8vIFN0b3AgdHJhY2tpbmcgbW91c2UgbW92ZW1lbnQgZm9yIHRoaXMgc2VsZWN0aW9uXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdXBkYXRlT3ZlcmxheSk7XG4gICAgICAgIC8vIEdldCBzZWxlY3Rpb24gZGltZW5zaW9ucyBmcm9tIHRoZSBkYXRhIGF0dHJpYnV0ZXNcbiAgICAgICAgY29uc3QgeCA9IE51bWJlcihzZWxlY3Rpb25PdmVybGF5LmRhdGFzZXQuc2VsZWN0aW9uWCB8fCBcIjBcIik7XG4gICAgICAgIGNvbnN0IHkgPSBOdW1iZXIoc2VsZWN0aW9uT3ZlcmxheS5kYXRhc2V0LnNlbGVjdGlvblkgfHwgXCIwXCIpO1xuICAgICAgICBjb25zdCB3aWR0aCA9IE51bWJlcihzZWxlY3Rpb25PdmVybGF5LmRhdGFzZXQuc2VsZWN0aW9uV2lkdGggfHwgXCIwXCIpO1xuICAgICAgICBjb25zdCBoZWlnaHQgPSBOdW1iZXIoc2VsZWN0aW9uT3ZlcmxheS5kYXRhc2V0LnNlbGVjdGlvbkhlaWdodCB8fCBcIjBcIik7XG4gICAgICAgIC8vIENyZWF0ZSBhIGN1c3RvbSByZWN0IG9iamVjdCB3aXRoIHRoZSBzdG9yZWQgZGltZW5zaW9uc1xuICAgICAgICBzZWxlY3RlZFJlY3QgPSB7XG4gICAgICAgICAgICBsZWZ0OiB4LFxuICAgICAgICAgICAgdG9wOiB5LFxuICAgICAgICAgICAgcmlnaHQ6IHggKyB3aWR0aCxcbiAgICAgICAgICAgIGJvdHRvbTogeSArIGhlaWdodCxcbiAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICAgICAgeDogeCxcbiAgICAgICAgICAgIHk6IHksXG4gICAgICAgICAgICB0b0pTT046ICgpID0+ICh7IHgsIHksIHdpZHRoLCBoZWlnaHQgfSksXG4gICAgICAgIH07XG4gICAgICAgIGNvbnNvbGUubG9nKFwiU2VsZWN0aW9uIGNvbXBsZXRlZCwgcmVjdDpcIiwgc2VsZWN0ZWRSZWN0KTtcbiAgICAgICAgLy8gTm90aWZ5IHRoYXQgc2VsZWN0aW9uIGlzIGNvbXBsZXRlXG4gICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiBcInNlbGVjdGlvbkNvbXBsZXRlXCIgfSk7XG4gICAgICAgIC8vIENoZWNrIGlmIHNlbGVjdGlvbiBoYXMgYSBtaW5pbXVtIHNpemVcbiAgICAgICAgaWYgKHdpZHRoID4gMTAgJiYgaGVpZ2h0ID4gMTApIHtcbiAgICAgICAgICAgIHByb2Nlc3NTZWxlY3Rpb24oc2VsZWN0ZWRSZWN0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIFNlbGVjdGlvbiB0b28gc21hbGwsIGp1c3QgY2xlYW4gdXAgdGhpcyBzZWxlY3Rpb24gKG5vdCBleGl0IHNlbGVjdGlvbiBtb2RlKVxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJTZWxlY3Rpb24gdG9vIHNtYWxsLCByZW1vdmluZyBqdXN0IHRoaXMgc2VsZWN0aW9uXCIpO1xuICAgICAgICAgICAgaWYgKHNlbGVjdGlvbk92ZXJsYXkpIHtcbiAgICAgICAgICAgICAgICBzZWxlY3Rpb25PdmVybGF5LnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgIHNlbGVjdGlvbk92ZXJsYXkgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhcnRQb2ludCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8vIEhhbmRsZSBrZXkgZG93biAtIGVzY2FwZSBleGl0cyBzZWxlY3Rpb24gbW9kZVxuICAgIGNvbnN0IGhhbmRsZUtleURvd24gPSAoZSkgPT4ge1xuICAgICAgICBpZiAoZS5rZXkgPT09IFwiRXNjYXBlXCIpIHtcbiAgICAgICAgICAgIGNhbmNlbFNlbGVjdGlvbigpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvLyBTdG9yZSB0aGUgaGFuZGxlcnMgb24gdGhlIHdpbmRvdyB0byBiZSBhYmxlIHRvIHJlbW92ZSB0aGVtIGxhdGVyXG4gICAgd2luZG93LnZpc2lvbkNtc01vdXNlRG93biA9IGhhbmRsZU1vdXNlRG93bjtcbiAgICB3aW5kb3cudmlzaW9uQ21zTW91c2VNb3ZlID0gaGFuZGxlTW91c2VNb3ZlO1xuICAgIHdpbmRvdy52aXNpb25DbXNNb3VzZVVwID0gaGFuZGxlTW91c2VVcDtcbiAgICB3aW5kb3cudmlzaW9uQ21zS2V5RG93biA9IGhhbmRsZUtleURvd247XG4gICAgLy8gQWRkIHRoZSBldmVudCBsaXN0ZW5lcnNcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIGhhbmRsZU1vdXNlRG93bik7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBoYW5kbGVNb3VzZU1vdmUpO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIGhhbmRsZU1vdXNlVXApO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xufVxuLy8gQ2xlYW4gdXAgZXZlbnQgbGlzdGVuZXJzIGZvciBzZWxlY3Rpb25cbmZ1bmN0aW9uIGNsZWFudXBTZWxlY3Rpb25FdmVudExpc3RlbmVycygpIHtcbiAgICAvLyBSZW1vdmUgZXZlbnQgbGlzdGVuZXJzIGlmIHRoZXkgZXhpc3RcbiAgICBpZiAod2luZG93LnZpc2lvbkNtc01vdXNlRG93bikge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIHdpbmRvdy52aXNpb25DbXNNb3VzZURvd24pO1xuICAgIH1cbiAgICBpZiAod2luZG93LnZpc2lvbkNtc01vdXNlTW92ZSkge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIHdpbmRvdy52aXNpb25DbXNNb3VzZU1vdmUpO1xuICAgIH1cbiAgICBpZiAod2luZG93LnZpc2lvbkNtc01vdXNlVXApIHtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgd2luZG93LnZpc2lvbkNtc01vdXNlVXApO1xuICAgIH1cbiAgICBpZiAod2luZG93LnZpc2lvbkNtc0tleURvd24pIHtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgd2luZG93LnZpc2lvbkNtc0tleURvd24pO1xuICAgIH1cbiAgICAvLyBSZW1vdmUgbW91c2Vtb3ZlIGxpc3RlbmVyIGZvciB0aGUgY3VycmVudCBvdmVybGF5IGlmIGFueVxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdXBkYXRlT3ZlcmxheSk7XG59XG4vLyBDYW5jZWwgc2VsZWN0aW9uIHByb2Nlc3NcbmZ1bmN0aW9uIGNhbmNlbFNlbGVjdGlvbigpIHtcbiAgICBjb25zb2xlLmxvZyhcIkNhbmNlbGxpbmcgc2VsZWN0aW9uIG1vZGVcIik7XG4gICAgaXNTZWxlY3RpbmcgPSBmYWxzZTtcbiAgICBpZiAoc2VsZWN0aW9uT3ZlcmxheSkge1xuICAgICAgICBzZWxlY3Rpb25PdmVybGF5LnJlbW92ZSgpO1xuICAgICAgICBzZWxlY3Rpb25PdmVybGF5ID0gbnVsbDtcbiAgICB9XG4gICAgc3RhcnRQb2ludCA9IG51bGw7XG4gICAgc2VsZWN0ZWRSZWN0ID0gbnVsbDtcbiAgICAvLyBSZW1vdmUgdGhlIHNlbGVjdGlvbiBwcmV2ZW50aW9uIHN0eWxlc1xuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2lvbi1jbXMtc2VsZWN0aW5nXCIpO1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaW9uLWNtcy1zZWxlY3RpbmdcIik7XG4gICAgY29uc3Qgc3R5bGVFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidmlzaW9uLWNtcy1kaXNhYmxlLXNlbGVjdGlvbi1zdHlsZVwiKTtcbiAgICBpZiAoc3R5bGVFbCkge1xuICAgICAgICBzdHlsZUVsLnJlbW92ZSgpO1xuICAgIH1cbiAgICAvLyBSZW1vdmUgZXZlbnQgbGlzdGVuZXJzXG4gICAgY2xlYW51cFNlbGVjdGlvbkV2ZW50TGlzdGVuZXJzKCk7XG4gICAgLy8gTm90aWZ5IHRoYXQgc2VsZWN0aW9uIHdhcyBjYW5jZWxsZWRcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogXCJzZWxlY3Rpb25DYW5jZWxsZWRcIiB9KTtcbn1cbi8vIENyZWF0ZSBjYXB0dXJlIHZpc3VhbCBpbmRpY2F0b3JcbmZ1bmN0aW9uIGNyZWF0ZUNhcHR1cmVJbmRpY2F0b3IobWVzc2FnZSwgY29sb3IgPSBcIiMxYTczZThcIikge1xuICAgIGNvbnN0IGluZGljYXRvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgaW5kaWNhdG9yLnN0eWxlLnBvc2l0aW9uID0gXCJmaXhlZFwiO1xuICAgIGluZGljYXRvci5zdHlsZS50b3AgPSBcIjIwcHhcIjtcbiAgICBpbmRpY2F0b3Iuc3R5bGUubGVmdCA9IFwiNTAlXCI7XG4gICAgaW5kaWNhdG9yLnN0eWxlLnRyYW5zZm9ybSA9IFwidHJhbnNsYXRlWCgtNTAlKVwiO1xuICAgIGluZGljYXRvci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBjb2xvcjtcbiAgICBpbmRpY2F0b3Iuc3R5bGUuY29sb3IgPSBcIndoaXRlXCI7XG4gICAgaW5kaWNhdG9yLnN0eWxlLnBhZGRpbmcgPSBcIjEwcHggMjBweFwiO1xuICAgIGluZGljYXRvci5zdHlsZS5ib3JkZXJSYWRpdXMgPSBcIjRweFwiO1xuICAgIGluZGljYXRvci5zdHlsZS5mb250V2VpZ2h0ID0gXCJib2xkXCI7XG4gICAgaW5kaWNhdG9yLnN0eWxlLnpJbmRleCA9IFwiMjE0NzQ4MzY0N1wiO1xuICAgIGluZGljYXRvci5zdHlsZS5ib3hTaGFkb3cgPSBcIjAgMnB4IDEwcHggcmdiYSgwLDAsMCwwLjIpXCI7XG4gICAgaW5kaWNhdG9yLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGluZGljYXRvcik7XG4gICAgcmV0dXJuIGluZGljYXRvcjtcbn1cbi8vIFVwZGF0ZSB0aGUgY2FwdHVyZSBpbmRpY2F0b3JcbmZ1bmN0aW9uIHVwZGF0ZUNhcHR1cmVJbmRpY2F0b3IoaW5kaWNhdG9yLCBtZXNzYWdlLCBjb2xvcikge1xuICAgIGluZGljYXRvci50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gICAgaW5kaWNhdG9yLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGNvbG9yO1xufVxuLy8gUHJvY2VzcyB0aGUgc2VsZWN0ZWQgYXJlYSBieSBzZW5kaW5nIHRvIGJhY2tncm91bmQgc2NyaXB0XG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzU2VsZWN0aW9uKHJlY3QpIHtcbiAgICBjb25zb2xlLmxvZyhcIlByb2Nlc3Npbmcgc2VsZWN0aW9uOlwiLCByZWN0KTtcbiAgICAvLyBDcmVhdGUgYSB2aXN1YWwgaW5kaWNhdG9yXG4gICAgY29uc3QgaW5kaWNhdG9yID0gY3JlYXRlQ2FwdHVyZUluZGljYXRvcihcIlByb2Nlc3NpbmcuLi5cIik7XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gSGlkZSB0aGUgc2VsZWN0aW9uIGJvcmRlciB0byBlbnN1cmUgaXQncyBub3QgaW4gdGhlIGNhcHR1cmVkIGltYWdlXG4gICAgICAgIGNvbnN0IHNlbGVjdGlvbkJvcmRlciA9IHNlbGVjdGlvbk92ZXJsYXk/LnF1ZXJ5U2VsZWN0b3IoXCIudmlzaW9uLWNtcy1zZWxlY3Rpb24tYm9yZGVyXCIpO1xuICAgICAgICBpZiAoc2VsZWN0aW9uQm9yZGVyKSB7XG4gICAgICAgICAgICBzZWxlY3Rpb25Cb3JkZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICB9XG4gICAgICAgIC8vIERpc3BsYXkgYSBwcm9jZXNzaW5nIFVJXG4gICAgICAgIGlmIChzZWxlY3Rpb25PdmVybGF5KSB7XG4gICAgICAgICAgICAvLyBBZGQgYSBwcm9jZXNzaW5nIGFuaW1hdGlvbiB0byB0aGUgb3ZlcmxheVxuICAgICAgICAgICAgc2VsZWN0aW9uT3ZlcmxheS5zdHlsZS5iYWNrZ3JvdW5kID0gXCJ0cmFuc3BhcmVudFwiOyAvLyBFbnN1cmUgb3ZlcmxheSBpcyB0cmFuc3BhcmVudCBmb3IgY2FwdHVyZVxuICAgICAgICAgICAgLy8gQWRkIGEgbG9hZGluZyBzcGlubmVyIGluc2lkZSB0aGUgb3ZlcmxheVxuICAgICAgICAgICAgY29uc3Qgc3Bpbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBzcGlubmVyLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xuICAgICAgICAgICAgc3Bpbm5lci5zdHlsZS50b3AgPSBcIjUwJVwiO1xuICAgICAgICAgICAgc3Bpbm5lci5zdHlsZS5sZWZ0ID0gXCI1MCVcIjtcbiAgICAgICAgICAgIHNwaW5uZXIuc3R5bGUudHJhbnNmb3JtID0gXCJ0cmFuc2xhdGUoLTUwJSwgLTUwJSlcIjtcbiAgICAgICAgICAgIHNwaW5uZXIuc3R5bGUud2lkdGggPSBcIjQwcHhcIjtcbiAgICAgICAgICAgIHNwaW5uZXIuc3R5bGUuaGVpZ2h0ID0gXCI0MHB4XCI7XG4gICAgICAgICAgICBzcGlubmVyLnN0eWxlLmJvcmRlciA9IFwiNHB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4zKVwiO1xuICAgICAgICAgICAgc3Bpbm5lci5zdHlsZS5ib3JkZXJUb3AgPSBcIjRweCBzb2xpZCAjMWE3M2U4XCI7XG4gICAgICAgICAgICBzcGlubmVyLnN0eWxlLmJvcmRlclJhZGl1cyA9IFwiNTAlXCI7XG4gICAgICAgICAgICBzcGlubmVyLnN0eWxlLmFuaW1hdGlvbiA9IFwidmlzaW9uLWNtcy1zcGluIDFzIGxpbmVhciBpbmZpbml0ZVwiO1xuICAgICAgICAgICAgLy8gQWRkIHRoZSBhbmltYXRpb24ga2V5ZnJhbWVzXG4gICAgICAgICAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICAgICAgICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgICBAa2V5ZnJhbWVzIHZpc2lvbi1jbXMtc3BpbiB7XG4gICAgICAgICAgMCUgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLCAtNTAlKSByb3RhdGUoMGRlZyk7IH1cbiAgICAgICAgICAxMDAlIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGUoLTUwJSwgLTUwJSkgcm90YXRlKDM2MGRlZyk7IH1cbiAgICAgICAgfVxuICAgICAgYDtcbiAgICAgICAgICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuICAgICAgICAgICAgc2VsZWN0aW9uT3ZlcmxheS5hcHBlbmRDaGlsZChzcGlubmVyKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBBbGxvdyBhIGJyaWVmIG1vbWVudCBmb3IgdGhlIFVJIHRvIHVwZGF0ZSBiZWZvcmUgY2FwdHVyaW5nXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwKSk7XG4gICAgICAgIC8vIFNlbmQgdGhlIHNlbGVjdGlvbiB0byB0aGUgYmFja2dyb3VuZCBzY3JpcHQgZm9yIHByb2Nlc3NpbmdcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICBhY3Rpb246IFwicHJvY2Vzc1NlbGVjdGlvblwiLFxuICAgICAgICAgICAgcmVjdDoge1xuICAgICAgICAgICAgICAgIHg6IHJlY3QubGVmdCxcbiAgICAgICAgICAgICAgICB5OiByZWN0LnRvcCxcbiAgICAgICAgICAgICAgICB3aWR0aDogcmVjdC53aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHJlY3QuaGVpZ2h0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiQmFja2dyb3VuZCBzY3JpcHQgcmVzcG9uc2U6XCIsIHJlc3BvbnNlKTtcbiAgICAgICAgLy8gU2hvdyBzdWNjZXNzIGluZGljYXRvclxuICAgICAgICB1cGRhdGVDYXB0dXJlSW5kaWNhdG9yKGluZGljYXRvciwgXCJQcm9jZXNzZWQhXCIsIFwiZ3JlZW5cIik7XG4gICAgICAgIC8vIFJlbW92ZSB0aGUgc2VsZWN0aW9uIG92ZXJsYXkgYnV0IHN0YXkgaW4gc2VsZWN0aW9uIG1vZGVcbiAgICAgICAgaWYgKHNlbGVjdGlvbk92ZXJsYXkpIHtcbiAgICAgICAgICAgIHNlbGVjdGlvbk92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgICAgICBzZWxlY3Rpb25PdmVybGF5ID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBzdGFydFBvaW50ID0gbnVsbDtcbiAgICAgICAgLy8gQXV0by1yZW1vdmUgaW5kaWNhdG9yIGFmdGVyIGRlbGF5XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gaW5kaWNhdG9yLnJlbW92ZSgpLCAzMDAwKTtcbiAgICB9XG4gICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJQcm9jZXNzaW5nIGZhaWxlZDpcIiwgZXJyb3IpO1xuICAgICAgICAvLyBTaG93IGVycm9yXG4gICAgICAgIHVwZGF0ZUNhcHR1cmVJbmRpY2F0b3IoaW5kaWNhdG9yLCBcIkVycm9yIVwiLCBcInJlZFwiKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBpbmRpY2F0b3IucmVtb3ZlKCksIDMwMDApO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG59XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/*!**********************!*\
  !*** ./src/popup.ts ***!
  \**********************/

document.addEventListener("DOMContentLoaded", () => {
    const startButton = document.getElementById("startSelection");
    const saveButton = document.getElementById("saveSnippet");
    const statusDiv = document.getElementById("status");
    const resultDiv = document.createElement("div");
    resultDiv.className = "result";
    resultDiv.style.display = "none";
    document.querySelector(".container")?.appendChild(resultDiv);
    // Create an image info div to show information about the downloaded image
    const imageInfoDiv = document.createElement("div");
    imageInfoDiv.className = "image-info";
    imageInfoDiv.style.display = "none";
    document.querySelector(".container")?.appendChild(imageInfoDiv);
    let isSelecting = false;
    let activeTabId = null;
    let lastDownloadedImage = null;
    console.log("Popup script initialized");
    const showStatus = (message, isError = false) => {
        statusDiv.textContent = message;
        statusDiv.className = `status ${isError ? "error" : "success"}`;
        statusDiv.style.display = "block";
        setTimeout(() => {
            statusDiv.style.display = "none";
        }, 3000);
    };
    // Show info about the downloaded image
    const showImageInfo = (filename) => {
        lastDownloadedImage = filename;
        imageInfoDiv.innerHTML = `
      <p>Image saved as: <span class="filename">${filename}</span></p>
      <button id="openDownloads" class="secondary-button">View in Downloads</button>
    `;
        imageInfoDiv.style.display = "block";
        // Add event listener to the button
        const openDownloadsButton = document.getElementById("openDownloads");
        if (openDownloadsButton) {
            openDownloadsButton.addEventListener("click", () => {
                chrome.downloads.showDefaultFolder();
            });
        }
    };
    const showResult = (data) => {
        resultDiv.innerHTML = "";
        // Create header
        const header = document.createElement("h3");
        header.textContent = "Code Analysis";
        resultDiv.appendChild(header);
        // Create content
        const content = document.createElement("div");
        content.className = "analysis-content";
        if (data.success && data.analysis) {
            // Format and display Claude's analysis
            const formattedText = data.analysis
                .replace(/\n/g, "<br>")
                .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
            content.innerHTML = formattedText;
        }
        else {
            // Handle error or unexpected data format
            content.innerHTML = `
        <p class="error">Unable to display analysis result.</p>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `;
        }
        resultDiv.appendChild(content);
        resultDiv.style.display = "block";
    };
    const checkExtensionActive = async () => {
        try {
            console.log("Checking if extension is active...");
            // Try to reload the background page to restart the service worker if needed
            try {
                await chrome.runtime.sendMessage({ action: "ping" }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn("Connection error:", chrome.runtime.lastError);
                    }
                });
            }
            catch (e) {
                console.warn("Initial ping failed:", e);
            }
            // Wait a moment and try again
            await new Promise((resolve) => setTimeout(resolve, 500));
            // Try again with proper error handling
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: "ping" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Extension status check failed:", chrome.runtime.lastError);
                        resolve(false);
                        return;
                    }
                    console.log("Extension status response:", response);
                    // Background script now responds with { status: "received", timestamp: ... }
                    resolve(!!response);
                });
            });
        }
        catch (error) {
            console.error("Failed to check extension status:", error);
            return false;
        }
    };
    const getCurrentTab = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return tab || null;
        }
        catch (error) {
            console.error("Failed to get current tab:", error);
            return null;
        }
    };
    // Direct function injection instead of file-based injection
    const setupSelectionInPage = async (tabId) => {
        try {
            console.log("Setting up selection in page...");
            // First inject CSS
            await chrome.scripting.insertCSS({
                target: { tabId },
                css: `
          .vision-cms-selection-container {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 2147483646 !important;
            cursor: crosshair !important;
            background: transparent !important;
          }
          
          .vision-cms-selection {
            position: absolute !important;
            border: 2px solid #1a73e8 !important;
            background-color: rgba(26, 115, 232, 0.1) !important;
            z-index: 2147483647 !important;
            /* Initially hidden but will be shown via JS */
            visibility: hidden;
          }
          
          .vision-cms-selection.visible {
            visibility: visible !important;
          }
          
          .vision-cms-selection.completed {
            border: 2px solid #34a853 !important; /* Green border for completed selection */
          }

          .vision-cms-buttons {
            position: absolute !important;
            bottom: 10px !important;
            right: 10px !important;
            display: flex !important;
            gap: 5px !important;
            z-index: 2147483647 !important;
            pointer-events: auto !important;
            /* Prevent the container from affecting layout */
            margin: 0 !important;
            padding: 0 !important;
          }
          
          .vision-cms-button {
            padding: 4px 8px !important;
            background: #1a73e8 !important;
            color: white !important;
            border: none !important;
            border-radius: 4px !important;
            font-size: 12px !important;
            cursor: pointer !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
            /* Prevent the button from affecting layout */
            margin: 0 !important;
            line-height: 1.2 !important;
            min-width: auto !important;
            min-height: auto !important;
            max-width: none !important;
            max-height: none !important;
          }
          
          .vision-cms-button:hover {
            background: #1558b3 !important;
          }
        `,
            });
            // Then inject the selection functionality directly
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    console.log("Selection script injected directly");
                    // Check if already initialized to prevent double initialization
                    if (window.hasOwnProperty("visionCMSInjected")) {
                        console.log("Selection script already initialized");
                        return { status: "already_initialized" };
                    }
                    // Set flag to avoid re-initialization
                    window.visionCMSInjected = true;
                    // Variables for selection
                    let selectionContainer = null;
                    let selectionOverlay = null;
                    let startPoint = null;
                    let selectedRect = null;
                    let isSelecting = false;
                    let selectionCompleted = false;
                    // Create selection container and overlay
                    const createSelectionElements = () => {
                        // Remove any existing elements
                        removeSelectionElements();
                        // Create container that will capture all mouse events
                        selectionContainer = document.createElement("div");
                        selectionContainer.className = "vision-cms-selection-container";
                        document.body.appendChild(selectionContainer);
                        // Create the visual overlay for the selection
                        selectionOverlay = document.createElement("div");
                        selectionOverlay.className = "vision-cms-selection";
                        selectionContainer.appendChild(selectionOverlay);
                        console.log("Selection elements created");
                        return { selectionContainer, selectionOverlay };
                    };
                    // Add buttons to the selection overlay
                    const addButtonsToOverlay = () => {
                        if (!selectionOverlay)
                            return;
                        // Remove any existing buttons first
                        const existingButtons = selectionOverlay.querySelector(".vision-cms-buttons");
                        if (existingButtons) {
                            existingButtons.remove();
                        }
                        // Create button container
                        const buttonsContainer = document.createElement("div");
                        buttonsContainer.className = "vision-cms-buttons";
                        // Create capture button
                        const captureButton = document.createElement("button");
                        captureButton.className = "vision-cms-button";
                        captureButton.textContent = "Capture";
                        captureButton.title = "Take a screenshot of this selection";
                        // Prevent any mouse events from affecting the selection or window
                        // by capturing all mouse events and preventing them from propagating
                        const preventAllEvents = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            return false;
                        };
                        // Stop all mouse events directly on the button
                        captureButton.onmousedown = preventAllEvents;
                        captureButton.onmouseup = preventAllEvents;
                        captureButton.onmousemove = preventAllEvents;
                        captureButton.onclick = (e) => {
                            preventAllEvents(e);
                            console.log("Capture button clicked");
                            captureSelectionSafely();
                        };
                        // Add the same prevention to the container
                        buttonsContainer.onmousedown = preventAllEvents;
                        buttonsContainer.onmouseup = preventAllEvents;
                        buttonsContainer.onmousemove = preventAllEvents;
                        // Add buttons to container
                        buttonsContainer.appendChild(captureButton);
                        // Add buttons container to overlay
                        selectionOverlay.appendChild(buttonsContainer);
                        console.log("Added buttons to overlay");
                    };
                    // Safely capture the selection without disturbing the rectangle
                    const captureSelectionSafely = () => {
                        if (!selectedRect)
                            return;
                        // Store current rect values to ensure they don't change
                        const rectCopy = {
                            x: selectedRect.x,
                            y: selectedRect.y,
                            width: selectedRect.width,
                            height: selectedRect.height,
                            top: selectedRect.top,
                            right: selectedRect.right,
                            bottom: selectedRect.bottom,
                            left: selectedRect.left,
                        };
                        console.log("Capturing selection:", rectCopy);
                        // Clone the current overlay styles before flashing
                        let originalBgColor = "";
                        if (selectionOverlay) {
                            originalBgColor = selectionOverlay.style.backgroundColor;
                            // Flash effect using a cloned overlay
                            const flashOverlay = document.createElement("div");
                            flashOverlay.style.position = "absolute";
                            flashOverlay.style.left = selectionOverlay.style.left;
                            flashOverlay.style.top = selectionOverlay.style.top;
                            flashOverlay.style.width = selectionOverlay.style.width;
                            flashOverlay.style.height = selectionOverlay.style.height;
                            flashOverlay.style.backgroundColor = "rgba(26, 115, 232, 0.3)";
                            flashOverlay.style.zIndex = "2147483646";
                            flashOverlay.style.pointerEvents = "none";
                            document.body.appendChild(flashOverlay);
                            // Remove the flash after a short delay
                            setTimeout(() => {
                                flashOverlay.remove();
                            }, 300);
                        }
                        // Instead of sending rect coordinates, take a screenshot directly
                        // Tell popup to take a screenshot - use saveSnippet since that's what popup is listening for
                        chrome.runtime.sendMessage({
                            action: "saveSnippet",
                            rect: rectCopy,
                        });
                    };
                    // Mark selection as completed and add buttons
                    const completeSelection = (rect) => {
                        if (!selectionOverlay)
                            return;
                        // Set selection state
                        selectionCompleted = true;
                        selectedRect = rect;
                        selectionOverlay.classList.add("completed");
                        // Add interactive buttons
                        addButtonsToOverlay();
                        // Tell popup the selection is complete
                        chrome.runtime.sendMessage({ action: "selectionComplete" });
                    };
                    // Remove selection elements
                    const removeSelectionElements = () => {
                        const existingContainer = document.querySelector(".vision-cms-selection-container");
                        if (existingContainer) {
                            existingContainer.remove();
                        }
                        selectionContainer = null;
                        selectionOverlay = null;
                    };
                    // Update overlay position and size
                    const updateOverlay = (startX, startY, currentX, currentY) => {
                        if (!selectionOverlay)
                            return;
                        const left = Math.min(startX, currentX);
                        const top = Math.min(startY, currentY);
                        const width = Math.abs(currentX - startX);
                        const height = Math.abs(currentY - startY);
                        // Make overlay visible and remove completed class
                        selectionOverlay.classList.add("visible");
                        selectionOverlay.classList.remove("completed");
                        selectionOverlay.style.left = `${left}px`;
                        selectionOverlay.style.top = `${top}px`;
                        selectionOverlay.style.width = `${width}px`;
                        selectionOverlay.style.height = `${height}px`;
                        console.log(`Overlay updated: ${width}x${height} at ${left},${top}`);
                    };
                    // Start selection process
                    const startSelection = () => {
                        console.log("Starting selection process");
                        // Create selection elements if they don't exist
                        if (!selectionContainer) {
                            const { selectionContainer: container } = createSelectionElements();
                            if (!container)
                                return;
                        }
                        isSelecting = true;
                        selectionCompleted = false;
                        // Mouse event handlers
                        if (selectionContainer) {
                            selectionContainer.onmousedown = (e) => {
                                // Check if we clicked on a button or inside the overlay when completed
                                if (e.target instanceof HTMLElement) {
                                    // Check for clicks on buttons or button container
                                    const isButton = e.target.closest(".vision-cms-button");
                                    const isButtonContainer = e.target.closest(".vision-cms-buttons");
                                    if (isButton || isButtonContainer) {
                                        console.log("Clicked on button or button container");
                                        e.stopPropagation();
                                        e.preventDefault();
                                        return;
                                    }
                                    // If clicking inside a completed selection, don't start a new one
                                    const isCompletedOverlay = selectionCompleted && e.target.closest(".vision-cms-selection");
                                    if (isCompletedOverlay) {
                                        console.log("Clicked inside completed selection");
                                        e.stopPropagation();
                                        e.preventDefault();
                                        return;
                                    }
                                }
                                console.log("Mouse down at", e.clientX, e.clientY);
                                e.preventDefault();
                                // Reset any existing selection
                                startPoint = { x: e.clientX, y: e.clientY };
                                selectionCompleted = false;
                                // If we have an overlay, reset its appearance
                                if (selectionOverlay) {
                                    // Remove any buttons
                                    const buttonsContainer = selectionOverlay.querySelector(".vision-cms-buttons");
                                    if (buttonsContainer) {
                                        buttonsContainer.remove();
                                    }
                                    selectionOverlay.classList.remove("completed");
                                    updateOverlay(e.clientX, e.clientY, e.clientX, e.clientY);
                                }
                            };
                            selectionContainer.onmousemove = (e) => {
                                if (!startPoint || selectionCompleted)
                                    return;
                                e.preventDefault();
                                updateOverlay(startPoint.x, startPoint.y, e.clientX, e.clientY);
                            };
                            selectionContainer.onmouseup = (e) => {
                                if (!startPoint || !selectionOverlay)
                                    return;
                                e.preventDefault();
                                console.log("Mouse up at", e.clientX, e.clientY);
                                // Final update to the overlay
                                updateOverlay(startPoint.x, startPoint.y, e.clientX, e.clientY);
                                // Get the final selection rectangle
                                const rect = selectionOverlay.getBoundingClientRect();
                                // Only consider valid selections (with some minimum size)
                                if (rect.width > 10 && rect.height > 10) {
                                    // Mark as completed and add buttons
                                    completeSelection(rect);
                                }
                                else {
                                    // Reset for a new selection if too small
                                    startPoint = null;
                                }
                            };
                            // Handle key presses
                            selectionContainer.tabIndex = 0; // Make it focusable to receive key events
                            selectionContainer.focus();
                            selectionContainer.onkeydown = (e) => {
                                if (e.key === "Escape") {
                                    console.log("Escape pressed, canceling selection");
                                    cancelSelection();
                                }
                            };
                        }
                        console.log("Selection mode active with event handlers attached");
                    };
                    // Cancel selection
                    const cancelSelection = () => {
                        console.log("Canceling selection");
                        startPoint = null;
                        selectedRect = null;
                        selectionCompleted = false;
                        // Hide selection overlay if it exists
                        if (selectionOverlay) {
                            selectionOverlay.classList.remove("visible");
                            selectionOverlay.classList.remove("completed");
                        }
                        removeSelectionElements();
                        // Tell popup the selection was cancelled
                        chrome.runtime.sendMessage({ action: "selectionCancelled" });
                    };
                    // Listen for messages from popup
                    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                        console.log("Page received message:", message);
                        if (message.action === "ping") {
                            sendResponse({ status: "ok" });
                            return true;
                        }
                        switch (message.action) {
                            case "startSelection":
                                startSelection();
                                sendResponse({ status: "ok" });
                                break;
                            case "cancelSelection":
                                cancelSelection();
                                sendResponse({ status: "ok" });
                                break;
                            case "saveSnippet":
                                if (selectedRect) {
                                    // Directly capture the selection using the built-in function
                                    captureSelectionSafely();
                                    sendResponse({ status: "ok" });
                                }
                                else {
                                    sendResponse({ status: "error", message: "No area selected" });
                                }
                                break;
                            default:
                                sendResponse({ status: "error", message: "Unknown action" });
                        }
                        return true;
                    });
                    console.log("Selection script ready");
                    return { status: "ok" };
                },
            });
            // Verify script is working
            console.log("Verifying selection script...");
            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    return window.hasOwnProperty("visionCMSInjected");
                },
            });
            if (!result) {
                throw new Error("Failed to initialize selection script");
            }
            console.log("Selection script verified");
        }
        catch (error) {
            console.error("Failed to set up selection:", error);
            throw error;
        }
    };
    // Function to take screenshot of selected area
    const captureSelectedArea = async (tabId) => {
        try {
            // Get the selection rectangle from the page
            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    const selectionOverlay = document.querySelector(".vision-cms-selection");
                    return selectionOverlay ? selectionOverlay.getBoundingClientRect() : null;
                },
            });
            if (!result) {
                throw new Error("No selection found");
            }
            const rect = result;
            // Take screenshot of visible tab
            const imageData = await chrome.tabs.captureVisibleTab();
            // Crop the image in memory
            return await cropImage(imageData, rect);
        }
        catch (error) {
            console.error("Failed to capture screenshot:", error);
            throw error;
        }
    };
    // Helper function to crop image
    const cropImage = (dataUrl, rect) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = rect.width;
                canvas.height = rect.height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Failed to get canvas context"));
                    return;
                }
                ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height, 0, 0, rect.width, rect.height);
                resolve(canvas.toDataURL());
            };
            img.onerror = () => {
                reject(new Error("Failed to load image"));
            };
            img.src = dataUrl;
        });
    };
    startButton.addEventListener("click", async () => {
        try {
            console.log("Start button clicked");
            // Check if extension is active
            const isActive = await checkExtensionActive();
            console.log("Extension active:", isActive);
            if (!isActive) {
                showStatus("Extension not active. Please reload the extension.", true);
                return;
            }
            const tab = await getCurrentTab();
            console.log("Current tab:", tab);
            if (!tab?.id) {
                showStatus("No active tab found", true);
                return;
            }
            activeTabId = tab.id;
            // Check if we're on a valid page
            if (!tab.url ||
                tab.url.startsWith("chrome://") ||
                tab.url.startsWith("chrome-extension://")) {
                showStatus("Cannot run on this page. Try a regular website.", true);
                return;
            }
            // Toggle selection mode
            if (isSelecting) {
                // Cancel selection
                isSelecting = false;
                startButton.textContent = "Start Selection";
                saveButton.disabled = true;
                resultDiv.style.display = "none";
                try {
                    // Send cancel message to page
                    await chrome.tabs.sendMessage(tab.id, { action: "cancelSelection" });
                }
                catch (error) {
                    // Ignore errors when canceling
                    console.log("Error when canceling selection (can be ignored):", error);
                }
            }
            else {
                // Start selection
                showStatus("Preparing selection tool...");
                // Inject selection code
                await setupSelectionInPage(tab.id);
                isSelecting = true;
                startButton.textContent = "Cancel Selection";
                saveButton.disabled = true; // Will be enabled after selection
                resultDiv.style.display = "none";
                // Start selection in page
                try {
                    await chrome.tabs.sendMessage(tab.id, { action: "startSelection" });
                }
                catch (error) {
                    throw new Error(`Failed to start selection: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        catch (error) {
            console.error("Error:", error);
            showStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, true);
            isSelecting = false;
            startButton.textContent = "Start Selection";
            saveButton.disabled = true;
        }
    });
    saveButton.addEventListener("click", async () => {
        if (!activeTabId) {
            const tab = await getCurrentTab();
            activeTabId = tab?.id || null;
        }
        if (!activeTabId) {
            showStatus("No active tab found", true);
            return;
        }
        try {
            saveButton.disabled = true;
            showStatus("Capturing screenshot...");
            // Capture the selected area
            const screenshot = await captureSelectedArea(activeTabId);
            // Send to background script for processing
            chrome.runtime.sendMessage({
                action: "screenshotCaptured",
                data: screenshot,
            });
        }
        catch (error) {
            showStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, true);
            saveButton.disabled = false;
        }
    });
    // Listen for messages from content script or background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Popup received message:", message);
        switch (message.action) {
            case "enableSaveButton":
                saveButton.disabled = false;
                break;
            case "disableSaveButton":
                saveButton.disabled = true;
                break;
            case "downloadComplete":
                showStatus("Image saved locally");
                showImageInfo(message.filename);
                break;
            case "analysisComplete":
                showStatus("Analysis complete!");
                showResult(message.data);
                break;
            case "analysisError":
                showStatus(`Analysis failed: ${message.error}`, true);
                break;
            case "captureRequested":
                // Handle screenshot capture request from background
                if (message.rect && activeTabId) {
                    handleCaptureRequest(activeTabId, message.rect);
                }
                else {
                    showStatus("Cannot capture screenshot: missing tab ID or selection", true);
                }
                break;
            case "saveSnippet":
                // Handle screenshot request from content script
                if (message.rect && activeTabId) {
                    handleCaptureRequest(activeTabId, message.rect)
                        .then(() => sendResponse({ status: "ok" }))
                        .catch((error) => {
                        console.error("Failed to handle saveSnippet:", error);
                        sendResponse({ status: "error", message: error.message });
                    });
                    return true; // Will respond asynchronously
                }
                else if (sender.tab && sender.tab.id) {
                    // If the tab ID wasn't already set, use the sender tab ID
                    handleCaptureRequest(sender.tab.id, message.rect)
                        .then(() => sendResponse({ status: "ok" }))
                        .catch((error) => {
                        console.error("Failed to handle saveSnippet:", error);
                        sendResponse({ status: "error", message: error.message });
                    });
                    return true; // Will respond asynchronously
                }
                else {
                    showStatus("Cannot capture screenshot: missing tab ID or selection", true);
                    sendResponse({ status: "error", message: "Missing tab ID or selection" });
                }
                break;
        }
    });
    // Helper function to handle capture requests from background or content script
    const handleCaptureRequest = async (tabId, rect) => {
        try {
            showStatus("Capturing screenshot...");
            console.log("Capturing screenshot with rect:", rect);
            // Take screenshot of visible tab
            const imageData = await chrome.tabs.captureVisibleTab();
            // If the rect is in the format sent by content script, convert it to a DOMRect-like object
            const captureRect = {
                left: rect.left || rect.x,
                top: rect.top || rect.y,
                width: rect.width,
                height: rect.height,
                right: rect.right || rect.x + rect.width,
                bottom: rect.bottom || rect.y + rect.height,
                x: rect.x || rect.left,
                y: rect.y || rect.top,
            };
            console.log("Using capture rectangle:", captureRect);
            // Crop the image
            const croppedImage = await cropImage(imageData, captureRect);
            console.log("Image cropped successfully, sending to background");
            // Send it to the background script
            chrome.runtime.sendMessage({
                action: "screenshotCaptured",
                data: croppedImage,
            });
        }
        catch (error) {
            console.error("Failed to handle capture request:", error);
            showStatus(`Error capturing screenshot: ${error instanceof Error ? error.message : "Unknown error"}`, true);
            chrome.runtime.sendMessage({
                action: "screenshotError",
                error: error instanceof Error ? error.message : "Unknown error",
            });
            throw error; // Re-throw for promise chaining
        }
    };
    // Initialize: check extension status
    (async () => {
        // Add a manual retry button
        const statusContainer = document.createElement("div");
        statusContainer.className = "status-container";
        statusContainer.style.marginTop = "10px";
        statusContainer.style.padding = "10px";
        statusContainer.style.backgroundColor = "#f8f9fa";
        statusContainer.style.borderRadius = "4px";
        statusContainer.style.textAlign = "center";
        const retryButton = document.createElement("button");
        retryButton.textContent = "Retry Connection";
        retryButton.className = "secondary-button";
        retryButton.style.marginTop = "10px";
        retryButton.addEventListener("click", async () => {
            statusContainer.innerHTML = "<p>Checking connection...</p>";
            const isActive = await checkExtensionActive();
            if (isActive) {
                statusContainer.style.display = "none";
                showStatus("Connection established!", false);
            }
            else {
                statusContainer.innerHTML =
                    '<p class="error">Extension not active. Please reload the extension.</p>';
                statusContainer.appendChild(retryButton);
            }
        });
        document.querySelector(".container")?.appendChild(statusContainer);
        // First check
        const isActive = await checkExtensionActive();
        if (!isActive) {
            statusContainer.innerHTML =
                '<p class="error">Extension not active. Please reload the extension.</p>';
            statusContainer.appendChild(retryButton);
            // Try reloading the extension
            chrome.runtime.reload();
            // Wait and check again
            setTimeout(async () => {
                const isActiveAfterReload = await checkExtensionActive();
                if (isActiveAfterReload) {
                    statusContainer.style.display = "none";
                    showStatus("Connection established!", false);
                }
            }, 1000);
        }
        else {
            statusContainer.style.display = "none";
        }
        // Load last analysis if available
        chrome.storage.local.get("lastAnalysis", (data) => {
            if (data.lastAnalysis) {
                showResult(data.lastAnalysis.result);
            }
        });
    })();
});

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9wdXAuanMiLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esd0NBQXdDLDhCQUE4QjtBQUN0RTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGtEQUFrRCxTQUFTO0FBQzNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxhQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxlQUFlLDhCQUE4QjtBQUM3QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLG1EQUFtRCxnQkFBZ0I7QUFDbkU7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw2Q0FBNkMsZ0JBQWdCO0FBQzdEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDZEQUE2RDtBQUM3RDtBQUNBLGlCQUFpQjtBQUNqQixhQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLG9EQUFvRCxtQ0FBbUM7QUFDdkY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwwQkFBMEIsT0FBTztBQUNqQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0RBQWtEO0FBQ2xEOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWE7QUFDYjtBQUNBO0FBQ0EsMEJBQTBCLE9BQU87QUFDakM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGlDQUFpQztBQUNqQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUNBQWlDO0FBQ2pDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsNkJBQTZCO0FBQzdCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHlCQUF5QjtBQUN6QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxxREFBcUQsNkJBQTZCO0FBQ2xGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHlEQUF5RCxLQUFLO0FBQzlELHdEQUF3RCxJQUFJO0FBQzVELDBEQUEwRCxNQUFNO0FBQ2hFLDJEQUEyRCxPQUFPO0FBQ2xFLHdEQUF3RCxNQUFNLEdBQUcsUUFBUSxLQUFLLEtBQUssR0FBRyxJQUFJO0FBQzFGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLG9DQUFvQyxnQ0FBZ0M7QUFDcEU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwrQ0FBK0M7QUFDL0M7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDZEQUE2RDtBQUM3RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EscURBQXFELDhCQUE4QjtBQUNuRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsMkNBQTJDLGNBQWM7QUFDekQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLCtDQUErQyxjQUFjO0FBQzdEO0FBQ0E7QUFDQTtBQUNBLCtDQUErQyxjQUFjO0FBQzdEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxtREFBbUQsY0FBYztBQUNqRTtBQUNBO0FBQ0EsbURBQW1ELDhDQUE4QztBQUNqRztBQUNBO0FBQ0E7QUFDQSwrQ0FBK0MsNENBQTRDO0FBQzNGO0FBQ0E7QUFDQSxxQkFBcUI7QUFDckI7QUFDQSw2QkFBNkI7QUFDN0IsaUJBQWlCO0FBQ2pCLGFBQWE7QUFDYjtBQUNBO0FBQ0EscUJBQXFCLFFBQVE7QUFDN0IsMEJBQTBCLE9BQU87QUFDakM7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQixhQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHFCQUFxQixRQUFRO0FBQzdCLDBCQUEwQixPQUFPO0FBQ2pDO0FBQ0E7QUFDQTtBQUNBLGlCQUFpQjtBQUNqQixhQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw0REFBNEQsMkJBQTJCO0FBQ3ZGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsNENBQTRDO0FBQzVDO0FBQ0E7QUFDQTtBQUNBLDREQUE0RCwwQkFBMEI7QUFDdEY7QUFDQTtBQUNBLGtFQUFrRSx1REFBdUQ7QUFDekg7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGlDQUFpQyx5REFBeUQ7QUFDMUY7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQSxpQ0FBaUMseURBQXlEO0FBQzFGO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSwrQ0FBK0MsY0FBYztBQUM3RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsbURBQW1ELGNBQWM7QUFDakU7QUFDQTtBQUNBLHVDQUF1Qyx5Q0FBeUM7QUFDaEYscUJBQXFCO0FBQ3JCLGlDQUFpQztBQUNqQztBQUNBO0FBQ0E7QUFDQTtBQUNBLG1EQUFtRCxjQUFjO0FBQ2pFO0FBQ0E7QUFDQSx1Q0FBdUMseUNBQXlDO0FBQ2hGLHFCQUFxQjtBQUNyQixpQ0FBaUM7QUFDakM7QUFDQTtBQUNBO0FBQ0EsbUNBQW1DLHlEQUF5RDtBQUM1RjtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWE7QUFDYjtBQUNBO0FBQ0E7QUFDQSxzREFBc0QseURBQXlEO0FBQy9HO0FBQ0E7QUFDQTtBQUNBLGFBQWE7QUFDYix5QkFBeUI7QUFDekI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxhQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUztBQUNULEtBQUs7QUFDTCxDQUFDIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vdmlzaW9uLWNtcy1leHRlbnNpb24vLi9zcmMvcG9wdXAudHMiXSwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCI7XG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCAoKSA9PiB7XG4gICAgY29uc3Qgc3RhcnRCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXJ0U2VsZWN0aW9uXCIpO1xuICAgIGNvbnN0IHNhdmVCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNhdmVTbmlwcGV0XCIpO1xuICAgIGNvbnN0IHN0YXR1c0RpdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdHVzXCIpO1xuICAgIGNvbnN0IHJlc3VsdERpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcmVzdWx0RGl2LmNsYXNzTmFtZSA9IFwicmVzdWx0XCI7XG4gICAgcmVzdWx0RGl2LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiLmNvbnRhaW5lclwiKT8uYXBwZW5kQ2hpbGQocmVzdWx0RGl2KTtcbiAgICAvLyBDcmVhdGUgYW4gaW1hZ2UgaW5mbyBkaXYgdG8gc2hvdyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgZG93bmxvYWRlZCBpbWFnZVxuICAgIGNvbnN0IGltYWdlSW5mb0RpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgaW1hZ2VJbmZvRGl2LmNsYXNzTmFtZSA9IFwiaW1hZ2UtaW5mb1wiO1xuICAgIGltYWdlSW5mb0Rpdi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIi5jb250YWluZXJcIik/LmFwcGVuZENoaWxkKGltYWdlSW5mb0Rpdik7XG4gICAgbGV0IGlzU2VsZWN0aW5nID0gZmFsc2U7XG4gICAgbGV0IGFjdGl2ZVRhYklkID0gbnVsbDtcbiAgICBsZXQgbGFzdERvd25sb2FkZWRJbWFnZSA9IG51bGw7XG4gICAgY29uc29sZS5sb2coXCJQb3B1cCBzY3JpcHQgaW5pdGlhbGl6ZWRcIik7XG4gICAgY29uc3Qgc2hvd1N0YXR1cyA9IChtZXNzYWdlLCBpc0Vycm9yID0gZmFsc2UpID0+IHtcbiAgICAgICAgc3RhdHVzRGl2LnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgICAgICAgc3RhdHVzRGl2LmNsYXNzTmFtZSA9IGBzdGF0dXMgJHtpc0Vycm9yID8gXCJlcnJvclwiIDogXCJzdWNjZXNzXCJ9YDtcbiAgICAgICAgc3RhdHVzRGl2LnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgc3RhdHVzRGl2LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgfSwgMzAwMCk7XG4gICAgfTtcbiAgICAvLyBTaG93IGluZm8gYWJvdXQgdGhlIGRvd25sb2FkZWQgaW1hZ2VcbiAgICBjb25zdCBzaG93SW1hZ2VJbmZvID0gKGZpbGVuYW1lKSA9PiB7XG4gICAgICAgIGxhc3REb3dubG9hZGVkSW1hZ2UgPSBmaWxlbmFtZTtcbiAgICAgICAgaW1hZ2VJbmZvRGl2LmlubmVySFRNTCA9IGBcbiAgICAgIDxwPkltYWdlIHNhdmVkIGFzOiA8c3BhbiBjbGFzcz1cImZpbGVuYW1lXCI+JHtmaWxlbmFtZX08L3NwYW4+PC9wPlxuICAgICAgPGJ1dHRvbiBpZD1cIm9wZW5Eb3dubG9hZHNcIiBjbGFzcz1cInNlY29uZGFyeS1idXR0b25cIj5WaWV3IGluIERvd25sb2FkczwvYnV0dG9uPlxuICAgIGA7XG4gICAgICAgIGltYWdlSW5mb0Rpdi5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgdG8gdGhlIGJ1dHRvblxuICAgICAgICBjb25zdCBvcGVuRG93bmxvYWRzQnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJvcGVuRG93bmxvYWRzXCIpO1xuICAgICAgICBpZiAob3BlbkRvd25sb2Fkc0J1dHRvbikge1xuICAgICAgICAgICAgb3BlbkRvd25sb2Fkc0J1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNocm9tZS5kb3dubG9hZHMuc2hvd0RlZmF1bHRGb2xkZXIoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBjb25zdCBzaG93UmVzdWx0ID0gKGRhdGEpID0+IHtcbiAgICAgICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IFwiXCI7XG4gICAgICAgIC8vIENyZWF0ZSBoZWFkZXJcbiAgICAgICAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImgzXCIpO1xuICAgICAgICBoZWFkZXIudGV4dENvbnRlbnQgPSBcIkNvZGUgQW5hbHlzaXNcIjtcbiAgICAgICAgcmVzdWx0RGl2LmFwcGVuZENoaWxkKGhlYWRlcik7XG4gICAgICAgIC8vIENyZWF0ZSBjb250ZW50XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBjb250ZW50LmNsYXNzTmFtZSA9IFwiYW5hbHlzaXMtY29udGVudFwiO1xuICAgICAgICBpZiAoZGF0YS5zdWNjZXNzICYmIGRhdGEuYW5hbHlzaXMpIHtcbiAgICAgICAgICAgIC8vIEZvcm1hdCBhbmQgZGlzcGxheSBDbGF1ZGUncyBhbmFseXNpc1xuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGVkVGV4dCA9IGRhdGEuYW5hbHlzaXNcbiAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxuL2csIFwiPGJyPlwiKVxuICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXCpcXCooLio/KVxcKlxcKi9nLCBcIjxzdHJvbmc+JDE8L3N0cm9uZz5cIik7XG4gICAgICAgICAgICBjb250ZW50LmlubmVySFRNTCA9IGZvcm1hdHRlZFRleHQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBIYW5kbGUgZXJyb3Igb3IgdW5leHBlY3RlZCBkYXRhIGZvcm1hdFxuICAgICAgICAgICAgY29udGVudC5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxwIGNsYXNzPVwiZXJyb3JcIj5VbmFibGUgdG8gZGlzcGxheSBhbmFseXNpcyByZXN1bHQuPC9wPlxuICAgICAgICA8cHJlPiR7SlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMil9PC9wcmU+XG4gICAgICBgO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdERpdi5hcHBlbmRDaGlsZChjb250ZW50KTtcbiAgICAgICAgcmVzdWx0RGl2LnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgfTtcbiAgICBjb25zdCBjaGVja0V4dGVuc2lvbkFjdGl2ZSA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQ2hlY2tpbmcgaWYgZXh0ZW5zaW9uIGlzIGFjdGl2ZS4uLlwiKTtcbiAgICAgICAgICAgIC8vIFRyeSB0byByZWxvYWQgdGhlIGJhY2tncm91bmQgcGFnZSB0byByZXN0YXJ0IHRoZSBzZXJ2aWNlIHdvcmtlciBpZiBuZWVkZWRcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyBhY3Rpb246IFwicGluZ1wiIH0sICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwiQ29ubmVjdGlvbiBlcnJvcjpcIiwgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJJbml0aWFsIHBpbmcgZmFpbGVkOlwiLCBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFdhaXQgYSBtb21lbnQgYW5kIHRyeSBhZ2FpblxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNTAwKSk7XG4gICAgICAgICAgICAvLyBUcnkgYWdhaW4gd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmdcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiBcInBpbmdcIiB9LCAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4dGVuc2lvbiBzdGF0dXMgY2hlY2sgZmFpbGVkOlwiLCBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJFeHRlbnNpb24gc3RhdHVzIHJlc3BvbnNlOlwiLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIEJhY2tncm91bmQgc2NyaXB0IG5vdyByZXNwb25kcyB3aXRoIHsgc3RhdHVzOiBcInJlY2VpdmVkXCIsIHRpbWVzdGFtcDogLi4uIH1cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSghIXJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBjaGVjayBleHRlbnNpb24gc3RhdHVzOlwiLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGNvbnN0IGdldEN1cnJlbnRUYWIgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBbdGFiXSA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRhYiB8fCBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBnZXQgY3VycmVudCB0YWI6XCIsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvLyBEaXJlY3QgZnVuY3Rpb24gaW5qZWN0aW9uIGluc3RlYWQgb2YgZmlsZS1iYXNlZCBpbmplY3Rpb25cbiAgICBjb25zdCBzZXR1cFNlbGVjdGlvbkluUGFnZSA9IGFzeW5jICh0YWJJZCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJTZXR0aW5nIHVwIHNlbGVjdGlvbiBpbiBwYWdlLi4uXCIpO1xuICAgICAgICAgICAgLy8gRmlyc3QgaW5qZWN0IENTU1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnNjcmlwdGluZy5pbnNlcnRDU1Moe1xuICAgICAgICAgICAgICAgIHRhcmdldDogeyB0YWJJZCB9LFxuICAgICAgICAgICAgICAgIGNzczogYFxuICAgICAgICAgIC52aXNpb24tY21zLXNlbGVjdGlvbi1jb250YWluZXIge1xuICAgICAgICAgICAgcG9zaXRpb246IGZpeGVkICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICB0b3A6IDAgIWltcG9ydGFudDtcbiAgICAgICAgICAgIGxlZnQ6IDAgIWltcG9ydGFudDtcbiAgICAgICAgICAgIHdpZHRoOiAxMDAlICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBoZWlnaHQ6IDEwMCUgIWltcG9ydGFudDtcbiAgICAgICAgICAgIHotaW5kZXg6IDIxNDc0ODM2NDYgIWltcG9ydGFudDtcbiAgICAgICAgICAgIGN1cnNvcjogY3Jvc3NoYWlyICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudCAhaW1wb3J0YW50O1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAudmlzaW9uLWNtcy1zZWxlY3Rpb24ge1xuICAgICAgICAgICAgcG9zaXRpb246IGFic29sdXRlICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBib3JkZXI6IDJweCBzb2xpZCAjMWE3M2U4ICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDI2LCAxMTUsIDIzMiwgMC4xKSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgei1pbmRleDogMjE0NzQ4MzY0NyAhaW1wb3J0YW50O1xuICAgICAgICAgICAgLyogSW5pdGlhbGx5IGhpZGRlbiBidXQgd2lsbCBiZSBzaG93biB2aWEgSlMgKi9cbiAgICAgICAgICAgIHZpc2liaWxpdHk6IGhpZGRlbjtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLnZpc2lvbi1jbXMtc2VsZWN0aW9uLnZpc2libGUge1xuICAgICAgICAgICAgdmlzaWJpbGl0eTogdmlzaWJsZSAhaW1wb3J0YW50O1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAudmlzaW9uLWNtcy1zZWxlY3Rpb24uY29tcGxldGVkIHtcbiAgICAgICAgICAgIGJvcmRlcjogMnB4IHNvbGlkICMzNGE4NTMgIWltcG9ydGFudDsgLyogR3JlZW4gYm9yZGVyIGZvciBjb21wbGV0ZWQgc2VsZWN0aW9uICovXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLnZpc2lvbi1jbXMtYnV0dG9ucyB7XG4gICAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGUgIWltcG9ydGFudDtcbiAgICAgICAgICAgIGJvdHRvbTogMTBweCAhaW1wb3J0YW50O1xuICAgICAgICAgICAgcmlnaHQ6IDEwcHggIWltcG9ydGFudDtcbiAgICAgICAgICAgIGRpc3BsYXk6IGZsZXggIWltcG9ydGFudDtcbiAgICAgICAgICAgIGdhcDogNXB4ICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICB6LWluZGV4OiAyMTQ3NDgzNjQ3ICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBwb2ludGVyLWV2ZW50czogYXV0byAhaW1wb3J0YW50O1xuICAgICAgICAgICAgLyogUHJldmVudCB0aGUgY29udGFpbmVyIGZyb20gYWZmZWN0aW5nIGxheW91dCAqL1xuICAgICAgICAgICAgbWFyZ2luOiAwICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBwYWRkaW5nOiAwICFpbXBvcnRhbnQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC52aXNpb24tY21zLWJ1dHRvbiB7XG4gICAgICAgICAgICBwYWRkaW5nOiA0cHggOHB4ICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiAjMWE3M2U4ICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBjb2xvcjogd2hpdGUgIWltcG9ydGFudDtcbiAgICAgICAgICAgIGJvcmRlcjogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogNHB4ICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBmb250LXNpemU6IDEycHggIWltcG9ydGFudDtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlciAhaW1wb3J0YW50O1xuICAgICAgICAgICAgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgXCJTZWdvZSBVSVwiLCBSb2JvdG8sIEhlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWYgIWltcG9ydGFudDtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMXB4IDNweCByZ2JhKDAsMCwwLDAuMykgIWltcG9ydGFudDtcbiAgICAgICAgICAgIC8qIFByZXZlbnQgdGhlIGJ1dHRvbiBmcm9tIGFmZmVjdGluZyBsYXlvdXQgKi9cbiAgICAgICAgICAgIG1hcmdpbjogMCAhaW1wb3J0YW50O1xuICAgICAgICAgICAgbGluZS1oZWlnaHQ6IDEuMiAhaW1wb3J0YW50O1xuICAgICAgICAgICAgbWluLXdpZHRoOiBhdXRvICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBtaW4taGVpZ2h0OiBhdXRvICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBtYXgtd2lkdGg6IG5vbmUgIWltcG9ydGFudDtcbiAgICAgICAgICAgIG1heC1oZWlnaHQ6IG5vbmUgIWltcG9ydGFudDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLnZpc2lvbi1jbXMtYnV0dG9uOmhvdmVyIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6ICMxNTU4YjMgIWltcG9ydGFudDtcbiAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIFRoZW4gaW5qZWN0IHRoZSBzZWxlY3Rpb24gZnVuY3Rpb25hbGl0eSBkaXJlY3RseVxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0KHtcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IHsgdGFiSWQgfSxcbiAgICAgICAgICAgICAgICBmdW5jOiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiU2VsZWN0aW9uIHNjcmlwdCBpbmplY3RlZCBkaXJlY3RseVwiKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgYWxyZWFkeSBpbml0aWFsaXplZCB0byBwcmV2ZW50IGRvdWJsZSBpbml0aWFsaXphdGlvblxuICAgICAgICAgICAgICAgICAgICBpZiAod2luZG93Lmhhc093blByb3BlcnR5KFwidmlzaW9uQ01TSW5qZWN0ZWRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiU2VsZWN0aW9uIHNjcmlwdCBhbHJlYWR5IGluaXRpYWxpemVkXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBcImFscmVhZHlfaW5pdGlhbGl6ZWRcIiB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIFNldCBmbGFnIHRvIGF2b2lkIHJlLWluaXRpYWxpemF0aW9uXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy52aXNpb25DTVNJbmplY3RlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIC8vIFZhcmlhYmxlcyBmb3Igc2VsZWN0aW9uXG4gICAgICAgICAgICAgICAgICAgIGxldCBzZWxlY3Rpb25Db250YWluZXIgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICBsZXQgc2VsZWN0aW9uT3ZlcmxheSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGxldCBzdGFydFBvaW50ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNlbGVjdGVkUmVjdCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGxldCBpc1NlbGVjdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBsZXQgc2VsZWN0aW9uQ29tcGxldGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBzZWxlY3Rpb24gY29udGFpbmVyIGFuZCBvdmVybGF5XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNyZWF0ZVNlbGVjdGlvbkVsZW1lbnRzID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGFueSBleGlzdGluZyBlbGVtZW50c1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlU2VsZWN0aW9uRWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBjb250YWluZXIgdGhhdCB3aWxsIGNhcHR1cmUgYWxsIG1vdXNlIGV2ZW50c1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9uQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbkNvbnRhaW5lci5jbGFzc05hbWUgPSBcInZpc2lvbi1jbXMtc2VsZWN0aW9uLWNvbnRhaW5lclwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzZWxlY3Rpb25Db250YWluZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ3JlYXRlIHRoZSB2aXN1YWwgb3ZlcmxheSBmb3IgdGhlIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9uT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25PdmVybGF5LmNsYXNzTmFtZSA9IFwidmlzaW9uLWNtcy1zZWxlY3Rpb25cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbkNvbnRhaW5lci5hcHBlbmRDaGlsZChzZWxlY3Rpb25PdmVybGF5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiU2VsZWN0aW9uIGVsZW1lbnRzIGNyZWF0ZWRcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzZWxlY3Rpb25Db250YWluZXIsIHNlbGVjdGlvbk92ZXJsYXkgfTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRkIGJ1dHRvbnMgdG8gdGhlIHNlbGVjdGlvbiBvdmVybGF5XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFkZEJ1dHRvbnNUb092ZXJsYXkgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlbGVjdGlvbk92ZXJsYXkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGFueSBleGlzdGluZyBidXR0b25zIGZpcnN0XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ0J1dHRvbnMgPSBzZWxlY3Rpb25PdmVybGF5LnF1ZXJ5U2VsZWN0b3IoXCIudmlzaW9uLWNtcy1idXR0b25zXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nQnV0dG9ucykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nQnV0dG9ucy5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBidXR0b24gY29udGFpbmVyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBidXR0b25zQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbnNDb250YWluZXIuY2xhc3NOYW1lID0gXCJ2aXNpb24tY21zLWJ1dHRvbnNcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBjYXB0dXJlIGJ1dHRvblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FwdHVyZUJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlQnV0dG9uLmNsYXNzTmFtZSA9IFwidmlzaW9uLWNtcy1idXR0b25cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVCdXR0b24udGV4dENvbnRlbnQgPSBcIkNhcHR1cmVcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVCdXR0b24udGl0bGUgPSBcIlRha2UgYSBzY3JlZW5zaG90IG9mIHRoaXMgc2VsZWN0aW9uXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBQcmV2ZW50IGFueSBtb3VzZSBldmVudHMgZnJvbSBhZmZlY3RpbmcgdGhlIHNlbGVjdGlvbiBvciB3aW5kb3dcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGJ5IGNhcHR1cmluZyBhbGwgbW91c2UgZXZlbnRzIGFuZCBwcmV2ZW50aW5nIHRoZW0gZnJvbSBwcm9wYWdhdGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJldmVudEFsbEV2ZW50cyA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3RvcCBhbGwgbW91c2UgZXZlbnRzIGRpcmVjdGx5IG9uIHRoZSBidXR0b25cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVCdXR0b24ub25tb3VzZWRvd24gPSBwcmV2ZW50QWxsRXZlbnRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZUJ1dHRvbi5vbm1vdXNldXAgPSBwcmV2ZW50QWxsRXZlbnRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZUJ1dHRvbi5vbm1vdXNlbW92ZSA9IHByZXZlbnRBbGxFdmVudHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlQnV0dG9uLm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXZlbnRBbGxFdmVudHMoZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJDYXB0dXJlIGJ1dHRvbiBjbGlja2VkXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVTZWxlY3Rpb25TYWZlbHkoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBZGQgdGhlIHNhbWUgcHJldmVudGlvbiB0byB0aGUgY29udGFpbmVyXG4gICAgICAgICAgICAgICAgICAgICAgICBidXR0b25zQ29udGFpbmVyLm9ubW91c2Vkb3duID0gcHJldmVudEFsbEV2ZW50cztcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbnNDb250YWluZXIub25tb3VzZXVwID0gcHJldmVudEFsbEV2ZW50cztcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbnNDb250YWluZXIub25tb3VzZW1vdmUgPSBwcmV2ZW50QWxsRXZlbnRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQWRkIGJ1dHRvbnMgdG8gY29udGFpbmVyXG4gICAgICAgICAgICAgICAgICAgICAgICBidXR0b25zQ29udGFpbmVyLmFwcGVuZENoaWxkKGNhcHR1cmVCdXR0b24pO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQWRkIGJ1dHRvbnMgY29udGFpbmVyIHRvIG92ZXJsYXlcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbk92ZXJsYXkuYXBwZW5kQ2hpbGQoYnV0dG9uc0NvbnRhaW5lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkFkZGVkIGJ1dHRvbnMgdG8gb3ZlcmxheVwiKTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gU2FmZWx5IGNhcHR1cmUgdGhlIHNlbGVjdGlvbiB3aXRob3V0IGRpc3R1cmJpbmcgdGhlIHJlY3RhbmdsZVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYXB0dXJlU2VsZWN0aW9uU2FmZWx5ID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWxlY3RlZFJlY3QpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3RvcmUgY3VycmVudCByZWN0IHZhbHVlcyB0byBlbnN1cmUgdGhleSBkb24ndCBjaGFuZ2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlY3RDb3B5ID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHg6IHNlbGVjdGVkUmVjdC54LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHk6IHNlbGVjdGVkUmVjdC55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBzZWxlY3RlZFJlY3Qud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBzZWxlY3RlZFJlY3QuaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvcDogc2VsZWN0ZWRSZWN0LnRvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByaWdodDogc2VsZWN0ZWRSZWN0LnJpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJvdHRvbTogc2VsZWN0ZWRSZWN0LmJvdHRvbSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZWZ0OiBzZWxlY3RlZFJlY3QubGVmdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkNhcHR1cmluZyBzZWxlY3Rpb246XCIsIHJlY3RDb3B5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENsb25lIHRoZSBjdXJyZW50IG92ZXJsYXkgc3R5bGVzIGJlZm9yZSBmbGFzaGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG9yaWdpbmFsQmdDb2xvciA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZWN0aW9uT3ZlcmxheSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsQmdDb2xvciA9IHNlbGVjdGlvbk92ZXJsYXkuc3R5bGUuYmFja2dyb3VuZENvbG9yO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZsYXNoIGVmZmVjdCB1c2luZyBhIGNsb25lZCBvdmVybGF5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmxhc2hPdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbGFzaE92ZXJsYXkuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmxhc2hPdmVybGF5LnN0eWxlLmxlZnQgPSBzZWxlY3Rpb25PdmVybGF5LnN0eWxlLmxlZnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmxhc2hPdmVybGF5LnN0eWxlLnRvcCA9IHNlbGVjdGlvbk92ZXJsYXkuc3R5bGUudG9wO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZsYXNoT3ZlcmxheS5zdHlsZS53aWR0aCA9IHNlbGVjdGlvbk92ZXJsYXkuc3R5bGUud2lkdGg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmxhc2hPdmVybGF5LnN0eWxlLmhlaWdodCA9IHNlbGVjdGlvbk92ZXJsYXkuc3R5bGUuaGVpZ2h0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZsYXNoT3ZlcmxheS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcInJnYmEoMjYsIDExNSwgMjMyLCAwLjMpXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmxhc2hPdmVybGF5LnN0eWxlLnpJbmRleCA9IFwiMjE0NzQ4MzY0NlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZsYXNoT3ZlcmxheS5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJub25lXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChmbGFzaE92ZXJsYXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgZmxhc2ggYWZ0ZXIgYSBzaG9ydCBkZWxheVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbGFzaE92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgMzAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEluc3RlYWQgb2Ygc2VuZGluZyByZWN0IGNvb3JkaW5hdGVzLCB0YWtlIGEgc2NyZWVuc2hvdCBkaXJlY3RseVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGVsbCBwb3B1cCB0byB0YWtlIGEgc2NyZWVuc2hvdCAtIHVzZSBzYXZlU25pcHBldCBzaW5jZSB0aGF0J3Mgd2hhdCBwb3B1cCBpcyBsaXN0ZW5pbmcgZm9yXG4gICAgICAgICAgICAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcInNhdmVTbmlwcGV0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjdDogcmVjdENvcHksXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gTWFyayBzZWxlY3Rpb24gYXMgY29tcGxldGVkIGFuZCBhZGQgYnV0dG9uc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wbGV0ZVNlbGVjdGlvbiA9IChyZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlbGVjdGlvbk92ZXJsYXkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU2V0IHNlbGVjdGlvbiBzdGF0ZVxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9uQ29tcGxldGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUmVjdCA9IHJlY3Q7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25PdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJjb21wbGV0ZWRcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBZGQgaW50ZXJhY3RpdmUgYnV0dG9uc1xuICAgICAgICAgICAgICAgICAgICAgICAgYWRkQnV0dG9uc1RvT3ZlcmxheSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGVsbCBwb3B1cCB0aGUgc2VsZWN0aW9uIGlzIGNvbXBsZXRlXG4gICAgICAgICAgICAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogXCJzZWxlY3Rpb25Db21wbGV0ZVwiIH0pO1xuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAvLyBSZW1vdmUgc2VsZWN0aW9uIGVsZW1lbnRzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbW92ZVNlbGVjdGlvbkVsZW1lbnRzID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdDb250YWluZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiLnZpc2lvbi1jbXMtc2VsZWN0aW9uLWNvbnRhaW5lclwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ0NvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nQ29udGFpbmVyLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9uQ29udGFpbmVyID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbk92ZXJsYXkgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAvLyBVcGRhdGUgb3ZlcmxheSBwb3NpdGlvbiBhbmQgc2l6ZVxuICAgICAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVPdmVybGF5ID0gKHN0YXJ0WCwgc3RhcnRZLCBjdXJyZW50WCwgY3VycmVudFkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2VsZWN0aW9uT3ZlcmxheSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsZWZ0ID0gTWF0aC5taW4oc3RhcnRYLCBjdXJyZW50WCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0b3AgPSBNYXRoLm1pbihzdGFydFksIGN1cnJlbnRZKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHdpZHRoID0gTWF0aC5hYnMoY3VycmVudFggLSBzdGFydFgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGVpZ2h0ID0gTWF0aC5hYnMoY3VycmVudFkgLSBzdGFydFkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTWFrZSBvdmVybGF5IHZpc2libGUgYW5kIHJlbW92ZSBjb21wbGV0ZWQgY2xhc3NcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbk92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25PdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJjb21wbGV0ZWRcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25PdmVybGF5LnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbk92ZXJsYXkuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbk92ZXJsYXkuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25PdmVybGF5LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgT3ZlcmxheSB1cGRhdGVkOiAke3dpZHRofXgke2hlaWdodH0gYXQgJHtsZWZ0fSwke3RvcH1gKTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gU3RhcnQgc2VsZWN0aW9uIHByb2Nlc3NcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhcnRTZWxlY3Rpb24gPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIlN0YXJ0aW5nIHNlbGVjdGlvbiBwcm9jZXNzXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ3JlYXRlIHNlbGVjdGlvbiBlbGVtZW50cyBpZiB0aGV5IGRvbid0IGV4aXN0XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlbGVjdGlvbkNvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgc2VsZWN0aW9uQ29udGFpbmVyOiBjb250YWluZXIgfSA9IGNyZWF0ZVNlbGVjdGlvbkVsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFjb250YWluZXIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlzU2VsZWN0aW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbkNvbXBsZXRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTW91c2UgZXZlbnQgaGFuZGxlcnNcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzZWxlY3Rpb25Db250YWluZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25Db250YWluZXIub25tb3VzZWRvd24gPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB3ZSBjbGlja2VkIG9uIGEgYnV0dG9uIG9yIGluc2lkZSB0aGUgb3ZlcmxheSB3aGVuIGNvbXBsZXRlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZS50YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGNsaWNrcyBvbiBidXR0b25zIG9yIGJ1dHRvbiBjb250YWluZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQnV0dG9uID0gZS50YXJnZXQuY2xvc2VzdChcIi52aXNpb24tY21zLWJ1dHRvblwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQnV0dG9uQ29udGFpbmVyID0gZS50YXJnZXQuY2xvc2VzdChcIi52aXNpb24tY21zLWJ1dHRvbnNcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNCdXR0b24gfHwgaXNCdXR0b25Db250YWluZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkNsaWNrZWQgb24gYnV0dG9uIG9yIGJ1dHRvbiBjb250YWluZXJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgY2xpY2tpbmcgaW5zaWRlIGEgY29tcGxldGVkIHNlbGVjdGlvbiwgZG9uJ3Qgc3RhcnQgYSBuZXcgb25lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0NvbXBsZXRlZE92ZXJsYXkgPSBzZWxlY3Rpb25Db21wbGV0ZWQgJiYgZS50YXJnZXQuY2xvc2VzdChcIi52aXNpb24tY21zLXNlbGVjdGlvblwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0NvbXBsZXRlZE92ZXJsYXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkNsaWNrZWQgaW5zaWRlIGNvbXBsZXRlZCBzZWxlY3Rpb25cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiTW91c2UgZG93biBhdFwiLCBlLmNsaWVudFgsIGUuY2xpZW50WSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmVzZXQgYW55IGV4aXN0aW5nIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFydFBvaW50ID0geyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25Db21wbGV0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UgaGF2ZSBhbiBvdmVybGF5LCByZXNldCBpdHMgYXBwZWFyYW5jZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZWN0aW9uT3ZlcmxheSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGFueSBidXR0b25zXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBidXR0b25zQ29udGFpbmVyID0gc2VsZWN0aW9uT3ZlcmxheS5xdWVyeVNlbGVjdG9yKFwiLnZpc2lvbi1jbXMtYnV0dG9uc1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChidXR0b25zQ29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uc0NvbnRhaW5lci5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbk92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcImNvbXBsZXRlZFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZU92ZXJsYXkoZS5jbGllbnRYLCBlLmNsaWVudFksIGUuY2xpZW50WCwgZS5jbGllbnRZKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9uQ29udGFpbmVyLm9ubW91c2Vtb3ZlID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGFydFBvaW50IHx8IHNlbGVjdGlvbkNvbXBsZXRlZClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVPdmVybGF5KHN0YXJ0UG9pbnQueCwgc3RhcnRQb2ludC55LCBlLmNsaWVudFgsIGUuY2xpZW50WSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25Db250YWluZXIub25tb3VzZXVwID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGFydFBvaW50IHx8ICFzZWxlY3Rpb25PdmVybGF5KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiTW91c2UgdXAgYXRcIiwgZS5jbGllbnRYLCBlLmNsaWVudFkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBGaW5hbCB1cGRhdGUgdG8gdGhlIG92ZXJsYXlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlT3ZlcmxheShzdGFydFBvaW50LngsIHN0YXJ0UG9pbnQueSwgZS5jbGllbnRYLCBlLmNsaWVudFkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIGZpbmFsIHNlbGVjdGlvbiByZWN0YW5nbGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVjdCA9IHNlbGVjdGlvbk92ZXJsYXkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgY29uc2lkZXIgdmFsaWQgc2VsZWN0aW9ucyAod2l0aCBzb21lIG1pbmltdW0gc2l6ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY3Qud2lkdGggPiAxMCAmJiByZWN0LmhlaWdodCA+IDEwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBNYXJrIGFzIGNvbXBsZXRlZCBhbmQgYWRkIGJ1dHRvbnNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBsZXRlU2VsZWN0aW9uKHJlY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmVzZXQgZm9yIGEgbmV3IHNlbGVjdGlvbiBpZiB0b28gc21hbGxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0UG9pbnQgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBIYW5kbGUga2V5IHByZXNzZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25Db250YWluZXIudGFiSW5kZXggPSAwOyAvLyBNYWtlIGl0IGZvY3VzYWJsZSB0byByZWNlaXZlIGtleSBldmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25Db250YWluZXIuZm9jdXMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25Db250YWluZXIub25rZXlkb3duID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGUua2V5ID09PSBcIkVzY2FwZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkVzY2FwZSBwcmVzc2VkLCBjYW5jZWxpbmcgc2VsZWN0aW9uXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FuY2VsU2VsZWN0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJTZWxlY3Rpb24gbW9kZSBhY3RpdmUgd2l0aCBldmVudCBoYW5kbGVycyBhdHRhY2hlZFwiKTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2FuY2VsIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYW5jZWxTZWxlY3Rpb24gPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkNhbmNlbGluZyBzZWxlY3Rpb25cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydFBvaW50ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUmVjdCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25Db21wbGV0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEhpZGUgc2VsZWN0aW9uIG92ZXJsYXkgaWYgaXQgZXhpc3RzXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZWN0aW9uT3ZlcmxheSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbk92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9uT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwiY29tcGxldGVkXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlU2VsZWN0aW9uRWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRlbGwgcG9wdXAgdGhlIHNlbGVjdGlvbiB3YXMgY2FuY2VsbGVkXG4gICAgICAgICAgICAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogXCJzZWxlY3Rpb25DYW5jZWxsZWRcIiB9KTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gTGlzdGVuIGZvciBtZXNzYWdlcyBmcm9tIHBvcHVwXG4gICAgICAgICAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobWVzc2FnZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiUGFnZSByZWNlaXZlZCBtZXNzYWdlOlwiLCBtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gXCJwaW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6IFwib2tcIiB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHN3aXRjaCAobWVzc2FnZS5hY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwic3RhcnRTZWxlY3Rpb25cIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJjYW5jZWxTZWxlY3Rpb25cIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FuY2VsU2VsZWN0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJva1wiIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwic2F2ZVNuaXBwZXRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGVjdGVkUmVjdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRGlyZWN0bHkgY2FwdHVyZSB0aGUgc2VsZWN0aW9uIHVzaW5nIHRoZSBidWlsdC1pbiBmdW5jdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZVNlbGVjdGlvblNhZmVseSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcIm9rXCIgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6IFwiZXJyb3JcIiwgbWVzc2FnZTogXCJObyBhcmVhIHNlbGVjdGVkXCIgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiBcImVycm9yXCIsIG1lc3NhZ2U6IFwiVW5rbm93biBhY3Rpb25cIiB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJTZWxlY3Rpb24gc2NyaXB0IHJlYWR5XCIpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IFwib2tcIiB9O1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIFZlcmlmeSBzY3JpcHQgaXMgd29ya2luZ1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJWZXJpZnlpbmcgc2VsZWN0aW9uIHNjcmlwdC4uLlwiKTtcbiAgICAgICAgICAgIGNvbnN0IFt7IHJlc3VsdCB9XSA9IGF3YWl0IGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdCh7XG4gICAgICAgICAgICAgICAgdGFyZ2V0OiB7IHRhYklkIH0sXG4gICAgICAgICAgICAgICAgZnVuYzogKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gd2luZG93Lmhhc093blByb3BlcnR5KFwidmlzaW9uQ01TSW5qZWN0ZWRcIik7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gaW5pdGlhbGl6ZSBzZWxlY3Rpb24gc2NyaXB0XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJTZWxlY3Rpb24gc2NyaXB0IHZlcmlmaWVkXCIpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzZXQgdXAgc2VsZWN0aW9uOlwiLCBlcnJvcik7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgIH07XG4gICAgLy8gRnVuY3Rpb24gdG8gdGFrZSBzY3JlZW5zaG90IG9mIHNlbGVjdGVkIGFyZWFcbiAgICBjb25zdCBjYXB0dXJlU2VsZWN0ZWRBcmVhID0gYXN5bmMgKHRhYklkKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBHZXQgdGhlIHNlbGVjdGlvbiByZWN0YW5nbGUgZnJvbSB0aGUgcGFnZVxuICAgICAgICAgICAgY29uc3QgW3sgcmVzdWx0IH1dID0gYXdhaXQgY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0KHtcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IHsgdGFiSWQgfSxcbiAgICAgICAgICAgICAgICBmdW5jOiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNlbGVjdGlvbk92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiLnZpc2lvbi1jbXMtc2VsZWN0aW9uXCIpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2VsZWN0aW9uT3ZlcmxheSA/IHNlbGVjdGlvbk92ZXJsYXkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkgOiBudWxsO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gc2VsZWN0aW9uIGZvdW5kXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVjdCA9IHJlc3VsdDtcbiAgICAgICAgICAgIC8vIFRha2Ugc2NyZWVuc2hvdCBvZiB2aXNpYmxlIHRhYlxuICAgICAgICAgICAgY29uc3QgaW1hZ2VEYXRhID0gYXdhaXQgY2hyb21lLnRhYnMuY2FwdHVyZVZpc2libGVUYWIoKTtcbiAgICAgICAgICAgIC8vIENyb3AgdGhlIGltYWdlIGluIG1lbW9yeVxuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IGNyb3BJbWFnZShpbWFnZURhdGEsIHJlY3QpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBjYXB0dXJlIHNjcmVlbnNob3Q6XCIsIGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gY3JvcCBpbWFnZVxuICAgIGNvbnN0IGNyb3BJbWFnZSA9IChkYXRhVXJsLCByZWN0KSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcbiAgICAgICAgICAgICAgICBjYW52YXMud2lkdGggPSByZWN0LndpZHRoO1xuICAgICAgICAgICAgICAgIGNhbnZhcy5oZWlnaHQgPSByZWN0LmhlaWdodDtcbiAgICAgICAgICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgICAgICAgICAgICAgIGlmICghY3R4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoXCJGYWlsZWQgdG8gZ2V0IGNhbnZhcyBjb250ZXh0XCIpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgcmVjdC5sZWZ0LCByZWN0LnRvcCwgcmVjdC53aWR0aCwgcmVjdC5oZWlnaHQsIDAsIDAsIHJlY3Qud2lkdGgsIHJlY3QuaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGNhbnZhcy50b0RhdGFVUkwoKSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihcIkZhaWxlZCB0byBsb2FkIGltYWdlXCIpKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpbWcuc3JjID0gZGF0YVVybDtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBzdGFydEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJTdGFydCBidXR0b24gY2xpY2tlZFwiKTtcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIGV4dGVuc2lvbiBpcyBhY3RpdmVcbiAgICAgICAgICAgIGNvbnN0IGlzQWN0aXZlID0gYXdhaXQgY2hlY2tFeHRlbnNpb25BY3RpdmUoKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRXh0ZW5zaW9uIGFjdGl2ZTpcIiwgaXNBY3RpdmUpO1xuICAgICAgICAgICAgaWYgKCFpc0FjdGl2ZSkge1xuICAgICAgICAgICAgICAgIHNob3dTdGF0dXMoXCJFeHRlbnNpb24gbm90IGFjdGl2ZS4gUGxlYXNlIHJlbG9hZCB0aGUgZXh0ZW5zaW9uLlwiLCB0cnVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB0YWIgPSBhd2FpdCBnZXRDdXJyZW50VGFiKCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkN1cnJlbnQgdGFiOlwiLCB0YWIpO1xuICAgICAgICAgICAgaWYgKCF0YWI/LmlkKSB7XG4gICAgICAgICAgICAgICAgc2hvd1N0YXR1cyhcIk5vIGFjdGl2ZSB0YWIgZm91bmRcIiwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWN0aXZlVGFiSWQgPSB0YWIuaWQ7XG4gICAgICAgICAgICAvLyBDaGVjayBpZiB3ZSdyZSBvbiBhIHZhbGlkIHBhZ2VcbiAgICAgICAgICAgIGlmICghdGFiLnVybCB8fFxuICAgICAgICAgICAgICAgIHRhYi51cmwuc3RhcnRzV2l0aChcImNocm9tZTovL1wiKSB8fFxuICAgICAgICAgICAgICAgIHRhYi51cmwuc3RhcnRzV2l0aChcImNocm9tZS1leHRlbnNpb246Ly9cIikpIHtcbiAgICAgICAgICAgICAgICBzaG93U3RhdHVzKFwiQ2Fubm90IHJ1biBvbiB0aGlzIHBhZ2UuIFRyeSBhIHJlZ3VsYXIgd2Vic2l0ZS5cIiwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVG9nZ2xlIHNlbGVjdGlvbiBtb2RlXG4gICAgICAgICAgICBpZiAoaXNTZWxlY3RpbmcpIHtcbiAgICAgICAgICAgICAgICAvLyBDYW5jZWwgc2VsZWN0aW9uXG4gICAgICAgICAgICAgICAgaXNTZWxlY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzdGFydEJ1dHRvbi50ZXh0Q29udGVudCA9IFwiU3RhcnQgU2VsZWN0aW9uXCI7XG4gICAgICAgICAgICAgICAgc2F2ZUJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmVzdWx0RGl2LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBTZW5kIGNhbmNlbCBtZXNzYWdlIHRvIHBhZ2VcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMuc2VuZE1lc3NhZ2UodGFiLmlkLCB7IGFjdGlvbjogXCJjYW5jZWxTZWxlY3Rpb25cIiB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElnbm9yZSBlcnJvcnMgd2hlbiBjYW5jZWxpbmdcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJFcnJvciB3aGVuIGNhbmNlbGluZyBzZWxlY3Rpb24gKGNhbiBiZSBpZ25vcmVkKTpcIiwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFN0YXJ0IHNlbGVjdGlvblxuICAgICAgICAgICAgICAgIHNob3dTdGF0dXMoXCJQcmVwYXJpbmcgc2VsZWN0aW9uIHRvb2wuLi5cIik7XG4gICAgICAgICAgICAgICAgLy8gSW5qZWN0IHNlbGVjdGlvbiBjb2RlXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0dXBTZWxlY3Rpb25JblBhZ2UodGFiLmlkKTtcbiAgICAgICAgICAgICAgICBpc1NlbGVjdGluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgc3RhcnRCdXR0b24udGV4dENvbnRlbnQgPSBcIkNhbmNlbCBTZWxlY3Rpb25cIjtcbiAgICAgICAgICAgICAgICBzYXZlQnV0dG9uLmRpc2FibGVkID0gdHJ1ZTsgLy8gV2lsbCBiZSBlbmFibGVkIGFmdGVyIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgIHJlc3VsdERpdi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgICAgICAgICAgLy8gU3RhcnQgc2VsZWN0aW9uIGluIHBhZ2VcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5zZW5kTWVzc2FnZSh0YWIuaWQsIHsgYWN0aW9uOiBcInN0YXJ0U2VsZWN0aW9uXCIgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBzdGFydCBzZWxlY3Rpb246ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgZXJyb3IpO1xuICAgICAgICAgICAgc2hvd1N0YXR1cyhgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlVua25vd24gZXJyb3JcIn1gLCB0cnVlKTtcbiAgICAgICAgICAgIGlzU2VsZWN0aW5nID0gZmFsc2U7XG4gICAgICAgICAgICBzdGFydEJ1dHRvbi50ZXh0Q29udGVudCA9IFwiU3RhcnQgU2VsZWN0aW9uXCI7XG4gICAgICAgICAgICBzYXZlQnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHNhdmVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKCFhY3RpdmVUYWJJZCkge1xuICAgICAgICAgICAgY29uc3QgdGFiID0gYXdhaXQgZ2V0Q3VycmVudFRhYigpO1xuICAgICAgICAgICAgYWN0aXZlVGFiSWQgPSB0YWI/LmlkIHx8IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFhY3RpdmVUYWJJZCkge1xuICAgICAgICAgICAgc2hvd1N0YXR1cyhcIk5vIGFjdGl2ZSB0YWIgZm91bmRcIiwgdHJ1ZSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHNhdmVCdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgc2hvd1N0YXR1cyhcIkNhcHR1cmluZyBzY3JlZW5zaG90Li4uXCIpO1xuICAgICAgICAgICAgLy8gQ2FwdHVyZSB0aGUgc2VsZWN0ZWQgYXJlYVxuICAgICAgICAgICAgY29uc3Qgc2NyZWVuc2hvdCA9IGF3YWl0IGNhcHR1cmVTZWxlY3RlZEFyZWEoYWN0aXZlVGFiSWQpO1xuICAgICAgICAgICAgLy8gU2VuZCB0byBiYWNrZ3JvdW5kIHNjcmlwdCBmb3IgcHJvY2Vzc2luZ1xuICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIGFjdGlvbjogXCJzY3JlZW5zaG90Q2FwdHVyZWRcIixcbiAgICAgICAgICAgICAgICBkYXRhOiBzY3JlZW5zaG90LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBzaG93U3RhdHVzKGBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiVW5rbm93biBlcnJvclwifWAsIHRydWUpO1xuICAgICAgICAgICAgc2F2ZUJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgLy8gTGlzdGVuIGZvciBtZXNzYWdlcyBmcm9tIGNvbnRlbnQgc2NyaXB0IG9yIGJhY2tncm91bmRcbiAgICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiUG9wdXAgcmVjZWl2ZWQgbWVzc2FnZTpcIiwgbWVzc2FnZSk7XG4gICAgICAgIHN3aXRjaCAobWVzc2FnZS5hY3Rpb24pIHtcbiAgICAgICAgICAgIGNhc2UgXCJlbmFibGVTYXZlQnV0dG9uXCI6XG4gICAgICAgICAgICAgICAgc2F2ZUJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImRpc2FibGVTYXZlQnV0dG9uXCI6XG4gICAgICAgICAgICAgICAgc2F2ZUJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiZG93bmxvYWRDb21wbGV0ZVwiOlxuICAgICAgICAgICAgICAgIHNob3dTdGF0dXMoXCJJbWFnZSBzYXZlZCBsb2NhbGx5XCIpO1xuICAgICAgICAgICAgICAgIHNob3dJbWFnZUluZm8obWVzc2FnZS5maWxlbmFtZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYW5hbHlzaXNDb21wbGV0ZVwiOlxuICAgICAgICAgICAgICAgIHNob3dTdGF0dXMoXCJBbmFseXNpcyBjb21wbGV0ZSFcIik7XG4gICAgICAgICAgICAgICAgc2hvd1Jlc3VsdChtZXNzYWdlLmRhdGEpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImFuYWx5c2lzRXJyb3JcIjpcbiAgICAgICAgICAgICAgICBzaG93U3RhdHVzKGBBbmFseXNpcyBmYWlsZWQ6ICR7bWVzc2FnZS5lcnJvcn1gLCB0cnVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJjYXB0dXJlUmVxdWVzdGVkXCI6XG4gICAgICAgICAgICAgICAgLy8gSGFuZGxlIHNjcmVlbnNob3QgY2FwdHVyZSByZXF1ZXN0IGZyb20gYmFja2dyb3VuZFxuICAgICAgICAgICAgICAgIGlmIChtZXNzYWdlLnJlY3QgJiYgYWN0aXZlVGFiSWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlQ2FwdHVyZVJlcXVlc3QoYWN0aXZlVGFiSWQsIG1lc3NhZ2UucmVjdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzaG93U3RhdHVzKFwiQ2Fubm90IGNhcHR1cmUgc2NyZWVuc2hvdDogbWlzc2luZyB0YWIgSUQgb3Igc2VsZWN0aW9uXCIsIHRydWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJzYXZlU25pcHBldFwiOlxuICAgICAgICAgICAgICAgIC8vIEhhbmRsZSBzY3JlZW5zaG90IHJlcXVlc3QgZnJvbSBjb250ZW50IHNjcmlwdFxuICAgICAgICAgICAgICAgIGlmIChtZXNzYWdlLnJlY3QgJiYgYWN0aXZlVGFiSWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlQ2FwdHVyZVJlcXVlc3QoYWN0aXZlVGFiSWQsIG1lc3NhZ2UucmVjdClcbiAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJva1wiIH0pKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBoYW5kbGUgc2F2ZVNuaXBwZXQ6XCIsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJlcnJvclwiLCBtZXNzYWdlOiBlcnJvci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7IC8vIFdpbGwgcmVzcG9uZCBhc3luY2hyb25vdXNseVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzZW5kZXIudGFiICYmIHNlbmRlci50YWIuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlIHRhYiBJRCB3YXNuJ3QgYWxyZWFkeSBzZXQsIHVzZSB0aGUgc2VuZGVyIHRhYiBJRFxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVDYXB0dXJlUmVxdWVzdChzZW5kZXIudGFiLmlkLCBtZXNzYWdlLnJlY3QpXG4gICAgICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6IFwib2tcIiB9KSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaGFuZGxlIHNhdmVTbmlwcGV0OlwiLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6IFwiZXJyb3JcIiwgbWVzc2FnZTogZXJyb3IubWVzc2FnZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBXaWxsIHJlc3BvbmQgYXN5bmNocm9ub3VzbHlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNob3dTdGF0dXMoXCJDYW5ub3QgY2FwdHVyZSBzY3JlZW5zaG90OiBtaXNzaW5nIHRhYiBJRCBvciBzZWxlY3Rpb25cIiwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogXCJlcnJvclwiLCBtZXNzYWdlOiBcIk1pc3NpbmcgdGFiIElEIG9yIHNlbGVjdGlvblwiIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIC8vIEhlbHBlciBmdW5jdGlvbiB0byBoYW5kbGUgY2FwdHVyZSByZXF1ZXN0cyBmcm9tIGJhY2tncm91bmQgb3IgY29udGVudCBzY3JpcHRcbiAgICBjb25zdCBoYW5kbGVDYXB0dXJlUmVxdWVzdCA9IGFzeW5jICh0YWJJZCwgcmVjdCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgc2hvd1N0YXR1cyhcIkNhcHR1cmluZyBzY3JlZW5zaG90Li4uXCIpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJDYXB0dXJpbmcgc2NyZWVuc2hvdCB3aXRoIHJlY3Q6XCIsIHJlY3QpO1xuICAgICAgICAgICAgLy8gVGFrZSBzY3JlZW5zaG90IG9mIHZpc2libGUgdGFiXG4gICAgICAgICAgICBjb25zdCBpbWFnZURhdGEgPSBhd2FpdCBjaHJvbWUudGFicy5jYXB0dXJlVmlzaWJsZVRhYigpO1xuICAgICAgICAgICAgLy8gSWYgdGhlIHJlY3QgaXMgaW4gdGhlIGZvcm1hdCBzZW50IGJ5IGNvbnRlbnQgc2NyaXB0LCBjb252ZXJ0IGl0IHRvIGEgRE9NUmVjdC1saWtlIG9iamVjdFxuICAgICAgICAgICAgY29uc3QgY2FwdHVyZVJlY3QgPSB7XG4gICAgICAgICAgICAgICAgbGVmdDogcmVjdC5sZWZ0IHx8IHJlY3QueCxcbiAgICAgICAgICAgICAgICB0b3A6IHJlY3QudG9wIHx8IHJlY3QueSxcbiAgICAgICAgICAgICAgICB3aWR0aDogcmVjdC53aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHJlY3QuaGVpZ2h0LFxuICAgICAgICAgICAgICAgIHJpZ2h0OiByZWN0LnJpZ2h0IHx8IHJlY3QueCArIHJlY3Qud2lkdGgsXG4gICAgICAgICAgICAgICAgYm90dG9tOiByZWN0LmJvdHRvbSB8fCByZWN0LnkgKyByZWN0LmhlaWdodCxcbiAgICAgICAgICAgICAgICB4OiByZWN0LnggfHwgcmVjdC5sZWZ0LFxuICAgICAgICAgICAgICAgIHk6IHJlY3QueSB8fCByZWN0LnRvcCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIlVzaW5nIGNhcHR1cmUgcmVjdGFuZ2xlOlwiLCBjYXB0dXJlUmVjdCk7XG4gICAgICAgICAgICAvLyBDcm9wIHRoZSBpbWFnZVxuICAgICAgICAgICAgY29uc3QgY3JvcHBlZEltYWdlID0gYXdhaXQgY3JvcEltYWdlKGltYWdlRGF0YSwgY2FwdHVyZVJlY3QpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJJbWFnZSBjcm9wcGVkIHN1Y2Nlc3NmdWxseSwgc2VuZGluZyB0byBiYWNrZ3JvdW5kXCIpO1xuICAgICAgICAgICAgLy8gU2VuZCBpdCB0byB0aGUgYmFja2dyb3VuZCBzY3JpcHRcbiAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICBhY3Rpb246IFwic2NyZWVuc2hvdENhcHR1cmVkXCIsXG4gICAgICAgICAgICAgICAgZGF0YTogY3JvcHBlZEltYWdlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGhhbmRsZSBjYXB0dXJlIHJlcXVlc3Q6XCIsIGVycm9yKTtcbiAgICAgICAgICAgIHNob3dTdGF0dXMoYEVycm9yIGNhcHR1cmluZyBzY3JlZW5zaG90OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJVbmtub3duIGVycm9yXCJ9YCwgdHJ1ZSk7XG4gICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgYWN0aW9uOiBcInNjcmVlbnNob3RFcnJvclwiLFxuICAgICAgICAgICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiVW5rbm93biBlcnJvclwiLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjsgLy8gUmUtdGhyb3cgZm9yIHByb21pc2UgY2hhaW5pbmdcbiAgICAgICAgfVxuICAgIH07XG4gICAgLy8gSW5pdGlhbGl6ZTogY2hlY2sgZXh0ZW5zaW9uIHN0YXR1c1xuICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIC8vIEFkZCBhIG1hbnVhbCByZXRyeSBidXR0b25cbiAgICAgICAgY29uc3Qgc3RhdHVzQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgc3RhdHVzQ29udGFpbmVyLmNsYXNzTmFtZSA9IFwic3RhdHVzLWNvbnRhaW5lclwiO1xuICAgICAgICBzdGF0dXNDb250YWluZXIuc3R5bGUubWFyZ2luVG9wID0gXCIxMHB4XCI7XG4gICAgICAgIHN0YXR1c0NvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gXCIxMHB4XCI7XG4gICAgICAgIHN0YXR1c0NvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcIiNmOGY5ZmFcIjtcbiAgICAgICAgc3RhdHVzQ29udGFpbmVyLnN0eWxlLmJvcmRlclJhZGl1cyA9IFwiNHB4XCI7XG4gICAgICAgIHN0YXR1c0NvbnRhaW5lci5zdHlsZS50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xuICAgICAgICBjb25zdCByZXRyeUJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgIHJldHJ5QnV0dG9uLnRleHRDb250ZW50ID0gXCJSZXRyeSBDb25uZWN0aW9uXCI7XG4gICAgICAgIHJldHJ5QnV0dG9uLmNsYXNzTmFtZSA9IFwic2Vjb25kYXJ5LWJ1dHRvblwiO1xuICAgICAgICByZXRyeUJ1dHRvbi5zdHlsZS5tYXJnaW5Ub3AgPSBcIjEwcHhcIjtcbiAgICAgICAgcmV0cnlCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHN0YXR1c0NvbnRhaW5lci5pbm5lckhUTUwgPSBcIjxwPkNoZWNraW5nIGNvbm5lY3Rpb24uLi48L3A+XCI7XG4gICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGF3YWl0IGNoZWNrRXh0ZW5zaW9uQWN0aXZlKCk7XG4gICAgICAgICAgICBpZiAoaXNBY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBzdGF0dXNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgICAgIHNob3dTdGF0dXMoXCJDb25uZWN0aW9uIGVzdGFibGlzaGVkIVwiLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdGF0dXNDb250YWluZXIuaW5uZXJIVE1MID1cbiAgICAgICAgICAgICAgICAgICAgJzxwIGNsYXNzPVwiZXJyb3JcIj5FeHRlbnNpb24gbm90IGFjdGl2ZS4gUGxlYXNlIHJlbG9hZCB0aGUgZXh0ZW5zaW9uLjwvcD4nO1xuICAgICAgICAgICAgICAgIHN0YXR1c0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZXRyeUJ1dHRvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiLmNvbnRhaW5lclwiKT8uYXBwZW5kQ2hpbGQoc3RhdHVzQ29udGFpbmVyKTtcbiAgICAgICAgLy8gRmlyc3QgY2hlY2tcbiAgICAgICAgY29uc3QgaXNBY3RpdmUgPSBhd2FpdCBjaGVja0V4dGVuc2lvbkFjdGl2ZSgpO1xuICAgICAgICBpZiAoIWlzQWN0aXZlKSB7XG4gICAgICAgICAgICBzdGF0dXNDb250YWluZXIuaW5uZXJIVE1MID1cbiAgICAgICAgICAgICAgICAnPHAgY2xhc3M9XCJlcnJvclwiPkV4dGVuc2lvbiBub3QgYWN0aXZlLiBQbGVhc2UgcmVsb2FkIHRoZSBleHRlbnNpb24uPC9wPic7XG4gICAgICAgICAgICBzdGF0dXNDb250YWluZXIuYXBwZW5kQ2hpbGQocmV0cnlCdXR0b24pO1xuICAgICAgICAgICAgLy8gVHJ5IHJlbG9hZGluZyB0aGUgZXh0ZW5zaW9uXG4gICAgICAgICAgICBjaHJvbWUucnVudGltZS5yZWxvYWQoKTtcbiAgICAgICAgICAgIC8vIFdhaXQgYW5kIGNoZWNrIGFnYWluXG4gICAgICAgICAgICBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBpc0FjdGl2ZUFmdGVyUmVsb2FkID0gYXdhaXQgY2hlY2tFeHRlbnNpb25BY3RpdmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoaXNBY3RpdmVBZnRlclJlbG9hZCkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgICAgICAgICBzaG93U3RhdHVzKFwiQ29ubmVjdGlvbiBlc3RhYmxpc2hlZCFcIiwgZmFsc2UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIDEwMDApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc3RhdHVzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgfVxuICAgICAgICAvLyBMb2FkIGxhc3QgYW5hbHlzaXMgaWYgYXZhaWxhYmxlXG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcImxhc3RBbmFseXNpc1wiLCAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKGRhdGEubGFzdEFuYWx5c2lzKSB7XG4gICAgICAgICAgICAgICAgc2hvd1Jlc3VsdChkYXRhLmxhc3RBbmFseXNpcy5yZXN1bHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KSgpO1xufSk7XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=
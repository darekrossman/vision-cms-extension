import { createSidePanelLogger } from "./utils";

/**
 * Vision CMS Side Panel Script
 * Handles UI interactions and communication with the background service worker
 */

// Configuration and state
let isSelectionModeActive = false;
let currentTab: chrome.tabs.Tab | null = null;

// Set up logging
const { log, error: logError } = createSidePanelLogger();

// Track if capture is in progress
let captureInProgress = false;

// Store the latest image URL
let latestImageUrl: string | null = null;

// DOM elements
let startButton: HTMLButtonElement | null = null;
let processButton: HTMLButtonElement | null = null;
let imageContainer: HTMLDivElement | null = null;
let loadingIndicator: HTMLDivElement | null = null;
let statusMessage: HTMLDivElement | null = null;

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
      } else {
        logError("No active tab found");
      }
    })
    .catch((err) => {
      logError("Failed to get active tab", err);
    });

  // Get reference to toggle button
  const selectionToggle = document.getElementById(
    "selection-toggle"
  ) as HTMLButtonElement | null;
  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;

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
          showStatus(
            "Error: " + (response.message || "Failed to start selection"),
            "error"
          );
        } else {
          showStatus("Select an area on the page", "info");
        }
      } else {
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
          showStatus(
            "Error: " + (response.message || "Failed to cancel selection"),
            "error"
          );
          // Don't revert the UI state since we've already cancelled locally
        } else {
          showStatus("Selection mode cancelled", "info");
        }
      }
    } catch (error) {
      logError(
        `Failed to ${isSelectionModeActive ? "start" : "cancel"} selection mode`,
        error
      );

      // Revert the toggle state on error
      isSelectionModeActive = wasActive;
      updateSelectionToggleState(wasActive, selectionToggle);

      // Show error status
      showStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
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
function resetUI(): void {
  log("Resetting UI to initial state");

  const selectionToggle = document.getElementById(
    "selection-toggle"
  ) as HTMLButtonElement | null;
  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;

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
function setupMessageListener(): void {
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
function notifyBackgroundReady(): void {
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
function handleSelectionCancelled(): void {
  log("Handling selection cancelled");

  const selectionToggle = document.getElementById(
    "selection-toggle"
  ) as HTMLButtonElement | null;

  if (selectionToggle) {
    selectionToggle.classList.remove("active");
    isSelectionModeActive = false;
    log("Selection mode deactivated");
  }
}

// Handle screenshot captured message
function handleScreenshotCaptured(dataUrl: string): void {
  log("Handling screenshot captured, data length:", dataUrl.length);

  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;

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
function initializeUI(): void {
  log("Initializing UI");

  // Get UI elements
  startButton = document.getElementById("startSelectionButton") as HTMLButtonElement;
  processButton = document.getElementById("processImageButton") as HTMLButtonElement;
  imageContainer = document.getElementById("imageContainer") as HTMLDivElement;
  loadingIndicator = document.getElementById("loadingIndicator") as HTMLDivElement;
  statusMessage = document.getElementById("statusMessage") as HTMLDivElement;

  if (
    !startButton ||
    !processButton ||
    !imageContainer ||
    !loadingIndicator ||
    !statusMessage
  ) {
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
function notifyBackgroundScript(): void {
  log("Notifying background script");
  chrome.runtime.sendMessage({ action: "sidePanelOpened" }, (response) => {
    if (chrome.runtime.lastError) {
      logError("Error notifying background script:", chrome.runtime.lastError);
      showStatus(
        "Background script not available. Please reload the extension.",
        "error"
      );
    } else {
      log("Background script notified:", response);
      showStatus("Ready to capture", "info");
    }
  });
}

// Start the selection process in the active tab
function startSelection(): void {
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
    } else if (response && response.status === "error") {
      logError("Error response from background:", response.message);
      showStatus(response.message || "Error starting selection", "error");
      captureInProgress = false;
      updateButtonState();
    } else {
      log("Selection started successfully");
    }
  });
}

// Process the current image (not used with server-side processing approach)
function processImage(): void {
  log("Process image button clicked");
  // This function is retained for backward compatibility but not used in server-side processing
}

// Update button states based on current status
function updateButtonState(): void {
  if (!startButton || !processButton) return;

  startButton.disabled = captureInProgress;
  processButton.style.display = latestImageUrl ? "block" : "none";
}

// Show status message with appropriate styling
function showStatus(message: string, type: "info" | "error" | "success"): void {
  if (!statusMessage) return;

  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  statusMessage.style.display = "block";
}

// Update UI layout based on window size
function updateUILayout(): void {
  // Adjust any size-dependent UI elements
  if (imageContainer) {
    const maxHeight = window.innerHeight - 200; // Allow space for buttons and status
    imageContainer.style.maxHeight = `${maxHeight}px`;
  }
}

// Display image in the side panel
function displayImage(imageUrl: string): void {
  if (!imageContainer) return;

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
function updateSelectionToggleState(
  active: boolean,
  toggleButton: HTMLButtonElement
): void {
  if (active) {
    toggleButton.classList.add("active");
    toggleButton.textContent = "Cancel Selection";
  } else {
    toggleButton.classList.remove("active");
    toggleButton.textContent = "Start Selection";
  }
}

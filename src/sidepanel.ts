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
let analysisInProgress = false;

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

  // Get reference to toggle button and analyze button
  const selectionToggle = document.getElementById(
    "selection-toggle"
  ) as HTMLButtonElement | null;
  const analyzeButton = document.getElementById(
    "analyze-button"
  ) as HTMLButtonElement | null;
  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;

  // Validate UI elements
  if (!selectionToggle || !analyzeButton || !imagePreview) {
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
        }
      } else {
        // Cancel selection mode
        const response = await chrome.runtime.sendMessage({
          action: "cancelSelection",
          source: "sidePanel",
        });

        log("Background service worker response:", response);

        if (response && response.status === "error") {
          logError("Error cancelling selection:", response.message);
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
    }
  });

  // Set up analyze button event listener
  analyzeButton.addEventListener("click", async () => {
    if (!latestImageUrl || analysisInProgress) {
      return;
    }

    try {
      analysisInProgress = true;
      analyzeButton.disabled = true;
      analyzeButton.textContent = "Analyzing...";

      // Send the image for analysis
      const response = await chrome.runtime.sendMessage({
        action: "analyzeImage",
        imageUrl: latestImageUrl,
      });

      log("Background service worker response for analysis:", response);

      if (response && response.status === "error") {
        logError("Error analyzing image:", response.message);
        analyzeButton.textContent = "Analysis Failed";
        setTimeout(() => {
          analyzeButton.disabled = false;
          analyzeButton.textContent = "Analyze Content";
        }, 3000);
      }
    } catch (error) {
      logError("Failed to analyze image", error);
      analyzeButton.disabled = false;
      analyzeButton.textContent = "Analyze Content";
    } finally {
      analysisInProgress = false;
    }
  });

  // Reset UI to initial state
  resetUI();

  // Listen for messages from the background service worker
  setupMessageListener();

  // Let the background script know we're ready
  notifyBackgroundReady();

  // Listen for window resize to adjust UI
  window.addEventListener("resize", updateUILayout);
});

// Reset UI to initial state
function resetUI(): void {
  log("Resetting UI to initial state");

  const selectionToggle = document.getElementById(
    "selection-toggle"
  ) as HTMLButtonElement | null;
  const analyzeButton = document.getElementById(
    "analyze-button"
  ) as HTMLButtonElement | null;
  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;
  const loadingSpinner = document.getElementById(
    "loading-spinner"
  ) as HTMLDivElement | null;

  if (selectionToggle && imagePreview) {
    // Reset toggle button
    selectionToggle.classList.remove("active");
    isSelectionModeActive = false;

    // Reset image preview
    imagePreview.style.display = "none";

    // Clear any existing images
    const existingImages = imagePreview.querySelectorAll("img");
    existingImages.forEach((img) => img.remove());

    // Reset loading spinner
    if (loadingSpinner) {
      loadingSpinner.style.display = "none";
    }
  }

  captureInProgress = false;
  latestImageUrl = null;

  if (analyzeButton) {
    analyzeButton.style.display = "none";
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze Content";
  }

  const analysisResults = document.getElementById(
    "analysis-results"
  ) as HTMLDivElement | null;

  if (analysisResults) {
    analysisResults.style.display = "none";
    analysisResults.textContent = "";
  }
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

      case "processingStarted":
        handleProcessingStarted();
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
        showAnalyzeButton();
        sendResponse({ status: "ok" });
        break;

      case "analysisComplete":
        log("Analysis received:", message.analysis);
        displayAnalysis(message.analysis);
        sendResponse({ status: "ok" });
        break;

      case "processingError":
        logError("Processing error:", message.error);
        captureInProgress = false;

        // Hide loading spinner on error
        const loadingSpinner = document.getElementById(
          "loading-spinner"
        ) as HTMLDivElement | null;
        if (loadingSpinner) {
          loadingSpinner.style.display = "none";
        }
        sendResponse({ status: "ok" });
        break;

      case "analysisError":
        logError("Analysis error:", message.error);
        handleAnalysisError(message.error);
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
    updateSelectionToggleState(false, selectionToggle);
    isSelectionModeActive = false;
    log("Selection mode deactivated");
  }
}

// Handle screenshot captured message
function handleScreenshotCaptured(dataUrl: string): void {
  log("Handling screenshot captured, data length:", dataUrl.length);

  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;
  const loadingSpinner = document.getElementById(
    "loading-spinner"
  ) as HTMLDivElement | null;

  if (!imagePreview || !loadingSpinner) {
    logError("Image preview or loading spinner element not found");
    return;
  }

  // Show the image preview container and loading spinner
  imagePreview.style.display = "flex";
  loadingSpinner.style.display = "block";

  log("Loading spinner displayed while processing image");
}

// Update UI layout based on window size
function updateUILayout(): void {
  // Nothing to adjust with fixed height
}

// Display image in the side panel
function displayImage(imageUrl: string): void {
  // Get the image preview element
  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;
  const loadingSpinner = document.getElementById(
    "loading-spinner"
  ) as HTMLDivElement | null;

  if (!imagePreview || !loadingSpinner) {
    logError("Image preview or loading spinner element not found");
    return;
  }

  // Hide the loading spinner
  loadingSpinner.style.display = "none";

  // Create image element
  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = "Captured screenshot";
  img.onload = () => {
    log("Image loaded successfully");
    captureInProgress = false;
  };

  img.onerror = () => {
    logError("Error loading image");
    captureInProgress = false;
  };

  // Remove any existing images to avoid duplicates
  const existingImages = imagePreview.querySelectorAll("img");
  existingImages.forEach((img) => img.remove());

  // Add the new image
  imagePreview.appendChild(img);

  // Store latest image URL
  latestImageUrl = imageUrl;

  // Show analyze button when image is displayed
  showAnalyzeButton();
}

// Helper function to update the selection toggle UI state
function updateSelectionToggleState(
  active: boolean,
  toggleButton: HTMLButtonElement
): void {
  if (active) {
    toggleButton.classList.add("active");
    const buttonText = toggleButton.querySelector(".button-text");
    if (buttonText) {
      buttonText.textContent = "Cancel Selection";
    }
  } else {
    toggleButton.classList.remove("active");
    const buttonText = toggleButton.querySelector(".button-text");
    if (buttonText) {
      buttonText.textContent = "Select Area";
    }
  }
}

// Add the handleProcessingStarted function
function handleProcessingStarted(): void {
  log("Handling processing started");

  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;
  const loadingSpinner = document.getElementById(
    "loading-spinner"
  ) as HTMLDivElement | null;

  if (!imagePreview || !loadingSpinner) {
    logError("Image preview or loading spinner element not found");
    return;
  }

  // Show the image preview container and loading spinner
  imagePreview.style.display = "flex";
  loadingSpinner.style.display = "block";

  log("Loading spinner displayed while processing image");
}

// Show analyze button
function showAnalyzeButton(): void {
  const analyzeButton = document.getElementById(
    "analyze-button"
  ) as HTMLButtonElement | null;

  if (analyzeButton && latestImageUrl) {
    analyzeButton.style.display = "block";
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze Content";
  }
}

// Display analysis in the side panel
function displayAnalysis(analysis: string): void {
  const analysisResults = document.getElementById(
    "analysis-results"
  ) as HTMLDivElement | null;
  const analyzeButton = document.getElementById(
    "analyze-button"
  ) as HTMLButtonElement | null;

  if (!analysisResults || !analyzeButton) {
    logError("Analysis results or analyze button element not found");
    return;
  }

  // Reset the button
  analyzeButton.disabled = false;
  analyzeButton.textContent = "Analyze Content";

  // Display the analysis
  analysisResults.textContent = analysis;
  analysisResults.style.display = "block";

  analysisInProgress = false;
}

// Handle analysis error
function handleAnalysisError(errorMessage: string): void {
  const analyzeButton = document.getElementById(
    "analyze-button"
  ) as HTMLButtonElement | null;

  if (analyzeButton) {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze Content";
  }

  analysisInProgress = false;
}

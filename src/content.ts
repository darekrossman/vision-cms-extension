// Extend Window interface to add our event handler properties
declare global {
  interface Window {
    visionCmsMouseDown?: (e: MouseEvent) => void;
    visionCmsMouseMove?: (e: MouseEvent) => void;
    visionCmsMouseUp?: (e: MouseEvent) => void;
    visionCmsKeyDown?: (e: KeyboardEvent) => void;
  }
}

import { createContentLogger } from "./utils";

// Variables for selection
let isSelecting = false;
let startPoint: { x: number; y: number } | null = null;
let selectedRect: DOMRect | null = null;
let selectionOverlay: HTMLDivElement | null = null;

// Set up logging
const { log, error: logError } = createContentLogger();

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

// Add visibility change detection to automatically cancel selection when switching tabs
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && isSelecting) {
    log("Page visibility changed to hidden, cancelling selection mode");
    cancelSelection();

    // Notify the sidepanel that selection was cancelled due to tab switch
    chrome.runtime
      .sendMessage({
        action: "selectionCancelled",
        reason: "tabSwitch",
      })
      .catch((err) => {
        logError("Failed to notify about tab switch cancellation:", err);
      });
  }
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
      } catch (error) {
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
      } catch (error) {
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
function createOverlay(): HTMLDivElement {
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
function updateOverlay(e: MouseEvent): void {
  if (!startPoint || !selectionOverlay) return;

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
  const topPanel = selectionOverlay.querySelector(
    ".vision-cms-overlay-top"
  ) as HTMLElement;
  if (topPanel) {
    topPanel.style.top = "0";
    topPanel.style.left = "0";
    topPanel.style.width = "100%";
    topPanel.style.height = `${y}px`;
  }

  // RIGHT panel (from right of selection to right of screen, from top of selection to bottom of selection)
  const rightPanel = selectionOverlay.querySelector(
    ".vision-cms-overlay-right"
  ) as HTMLElement;
  if (rightPanel) {
    rightPanel.style.top = `${y}px`;
    rightPanel.style.left = `${x + adjustedWidth}px`;
    rightPanel.style.width = `calc(100% - ${x + adjustedWidth}px)`;
    rightPanel.style.height = `${adjustedHeight}px`;
  }

  // BOTTOM panel (full width, from bottom of selection to bottom of screen)
  const bottomPanel = selectionOverlay.querySelector(
    ".vision-cms-overlay-bottom"
  ) as HTMLElement;
  if (bottomPanel) {
    bottomPanel.style.top = `${y + adjustedHeight}px`;
    bottomPanel.style.left = "0";
    bottomPanel.style.width = "100%";
    bottomPanel.style.height = `calc(100% - ${y + adjustedHeight}px)`;
  }

  // LEFT panel (from left of screen to left of selection, from top of selection to bottom of selection)
  const leftPanel = selectionOverlay.querySelector(
    ".vision-cms-overlay-left"
  ) as HTMLElement;
  if (leftPanel) {
    leftPanel.style.top = `${y}px`;
    leftPanel.style.left = "0";
    leftPanel.style.width = `${x}px`;
    leftPanel.style.height = `${adjustedHeight}px`;
  }

  // Update the selection border
  const selectionBorder = selectionOverlay.querySelector(
    ".vision-cms-selection-border"
  ) as HTMLElement;
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
function startSelection(): void {
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
function setupSelectionEventListeners(): void {
  // Remove any existing listeners first
  cleanupSelectionEventListeners();

  // Handle mouse down - start the selection rectangle
  const handleMouseDown = (e: MouseEvent) => {
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
  const handleMouseMove = (e: MouseEvent) => {
    e.preventDefault();
  };

  // Handle mouse up - finish the selection and capture
  const handleMouseUp = (e: MouseEvent) => {
    if (!startPoint || !selectionOverlay) return;

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
    } as DOMRect;

    console.log("Selection completed, rect:", selectedRect);

    // Notify that selection is complete
    chrome.runtime.sendMessage({ action: "selectionComplete" });

    // Check if selection has a minimum size
    if (width > 10 && height > 10) {
      processSelection(selectedRect);
    } else {
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
  const handleKeyDown = (e: KeyboardEvent) => {
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
function cleanupSelectionEventListeners(): void {
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
function cancelSelection(): void {
  log("Cancelling selection");

  if (!isSelecting) {
    log("Selection not active, ignoring cancel request");
    return;
  }

  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }

  startPoint = null;
  isSelecting = false;

  // Remove selection styles
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

// Process the selected area by sending to background script
async function processSelection(rect: DOMRect): Promise<void> {
  console.log("Processing selection:", rect);

  try {
    // Notify that processing has started - this will show the loading skeleton in the side panel
    chrome.runtime
      .sendMessage({
        action: "processingStarted",
      })
      .catch((err) => console.error("Failed to send processing started message:", err));

    // Hide the selection border to ensure it's not in the captured image
    if (selectionOverlay) {
      // Make sure all overlay elements are invisible for the capture
      const selectionBorder = selectionOverlay.querySelector(
        ".vision-cms-selection-border"
      ) as HTMLElement;
      if (selectionBorder) {
        selectionBorder.style.display = "none";
      }

      // Set all panels to transparent
      const panels = selectionOverlay.querySelectorAll(".vision-cms-overlay-panel");
      panels.forEach((panel) => {
        (panel as HTMLElement).style.backgroundColor = "transparent";
      });

      // Ensure overlay is transparent for capture
      selectionOverlay.style.background = "transparent";
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

    // Remove the selection overlay completely
    if (selectionOverlay) {
      selectionOverlay.remove();
      selectionOverlay = null;
    }
    startPoint = null;
  } catch (error) {
    console.error("Processing failed:", error);

    // Remove selection overlay even on error
    if (selectionOverlay) {
      selectionOverlay.remove();
      selectionOverlay = null;
    }
    startPoint = null;

    throw error;
  }
}

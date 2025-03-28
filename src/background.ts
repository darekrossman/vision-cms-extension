import { createBackgroundLogger, generateFilename } from "./utils";

// Configuration
const API_ENDPOINT = "http://localhost:3000/process-image";
const ANALYSIS_ENDPOINT = "http://localhost:3000/analyze-image";

// Default prompt for image analysis
const DEFAULT_PROMPT = "Describe what's in this image and extract any text content.";

// State tracking
let isActive = true;

// Set up logging
const { log, error: logError } = createBackgroundLogger();

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
    } catch (error) {
      logError("Error opening side panel:", error);
    }
  } catch (error) {
    logError("Action click handling error:", error);
  }
});

// Handle start selection action
function handleStartSelection(tabId: number | undefined, sendResponse: Function): void {
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
async function ensureContentScriptsInjected(tabId: number): Promise<void> {
  log("Ensuring content scripts are injected for tab:", tabId);

  // First check if we can communicate with the content script
  try {
    // Try to ping the content script to see if it's loaded
    const response = await chrome.tabs.sendMessage(tabId, { action: "ping" });
    log("Content script already loaded in tab:", tabId, response);
    return; // Content script is responsive, no need to inject
  } catch (error) {
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
    } catch (error) {
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
    } catch (verifyError) {
      logError(
        "Content script injection succeeded but script is not responsive:",
        verifyError
      );
      throw new Error("Content script injection succeeded but script is not responsive");
    }
  } catch (error) {
    logError("Error injecting content scripts:", error);
    throw error;
  }
}

// Handle messages from content script or side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const isFromContentScript = sender.tab && sender.tab.id;
  const isFromSidePanel = message.source === "sidePanel";

  log(
    "Message received:",
    message.action,
    isFromContentScript
      ? `from content script (tab ${sender.tab!.id})`
      : isFromSidePanel
      ? "from side panel"
      : "from unknown source"
  );

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
          } else {
            logError("No active tab found for selection from side panel");
            sendResponse({ status: "error", message: "No active tab found" });
          }
        });
        return true; // Keep response channel open
      } else {
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
                return chrome.tabs.sendMessage(tabs[0].id!, {
                  action: "cancelSelection",
                });
              })
              .then(() => {
                log("Sent cancelSelection to content script");
                sendResponse({ status: "ok" });
              })
              .catch((err) => {
                // Don't treat this as an error, as the content script might not be in selection mode
                log(
                  "Note: Could not send cancelSelection to tab, but proceeding anyway:",
                  err
                );
                // Still return success to the side panel to let it update the UI
                sendResponse({ status: "ok" });
              });
          } else {
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

    case "analyzeImage":
      handleAnalyzeImage(message.imageUrl, sendResponse);
      return true;

    default:
      log("Unknown message action:", message.action);
      sendResponse({ status: "error", message: "Unknown action" });
  }

  return true; // Keep the channel open for future responses
});

// Handle process selection action (replaces captureSelection)
async function handleProcessSelection(
  tabId: number | undefined,
  rect: { x: number; y: number; width: number; height: number },
  sendResponse: Function
): Promise<void> {
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
  } catch (err) {
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

// Handle image analysis request
async function handleAnalyzeImage(
  imageUrl: string,
  sendResponse: Function
): Promise<void> {
  log("Handling analyzeImage request for image URL:", imageUrl);

  if (!imageUrl) {
    logError("No image URL provided for analysis");
    sendResponse({ status: "error", message: "No image URL provided" });
    return;
  }

  try {
    log("Sending image to Anthropic for analysis");

    // Create form data for the request
    const formData = new FormData();
    formData.append("imageUrl", imageUrl);
    formData.append("prompt", DEFAULT_PROMPT);

    // Send to the server for analysis
    const response = await fetch(ANALYSIS_ENDPOINT, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Handle both new and legacy response formats
    const analysisContent =
      data.analysis || data.content || data.result || data.text || "";

    if (!analysisContent) {
      log("Server response:", JSON.stringify(data));
      throw new Error("No analysis content found in server response");
    }

    log("Analysis completed successfully");

    // Notify the side panel of the successful analysis
    chrome.runtime.sendMessage({
      action: "analysisComplete",
      analysis: analysisContent,
      timestamp: new Date().toISOString(),
    });

    sendResponse({ status: "ok", analysis: analysisContent });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logError("Error analyzing image:", errorMessage);

    // Notify the side panel of the error
    chrome.runtime.sendMessage({
      action: "analysisError",
      error: errorMessage,
    });

    sendResponse({ status: "error", message: errorMessage });
  }
}

// Safe way to notify popup without causing errors if it's not open
function notifyPopup(message: Record<string, any>): void {
  try {
    chrome.runtime.sendMessage(message).catch(() => {
      // Ignore errors - popup is likely just not open
    });
  } catch (error) {
    // Ignore errors - popup is likely just not open
  }
}

// Process the screenshot without downloading - only display in side panel
async function saveScreenshot(dataUrl: string): Promise<void> {
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
  } catch (error) {
    logError("Error processing screenshot:", error);
  }
}

// Keep the service worker alive
keepAlive();

// Function to keep the service worker alive
function keepAlive(): void {
  setInterval(() => {
    const timestamp = new Date().toISOString();
    log(`Service worker alive check: ${timestamp}`);
  }, 25000); // Every 25 seconds
}

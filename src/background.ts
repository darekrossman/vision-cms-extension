import { createBackgroundLogger, generateFilename } from "./utils";

// Configuration
const API_ENDPOINT = "http://localhost:3000/process-image";
const ANALYSIS_ENDPOINT = "http://localhost:3000/analyze-image";
const CHAT_ENDPOINT = "http://localhost:3000/chat";

// Default prompt for image analysis
const DEFAULT_PROMPT = "Describe what's in this image and extract any text content.";

// Predefined prompts for image analysis
const PREDEFINED_PROMPTS = [
  { id: "describe", text: "Describe what's in this image and extract any text content." },
  { id: "extract-text", text: "Extract all text content from this image." },
  {
    id: "analyze-ui",
    text: "Analyze this UI design and describe its components, layout, and functionality.",
  },
  {
    id: "identify-content",
    text: "Identify key content sections, headers, and navigation elements in this webpage.",
  },
  {
    id: "seo-analysis",
    text: "Analyze this webpage for SEO factors and suggest improvements.",
  },
  {
    id: "content-type-json",
    text: "Create content type json based on this content structure.",
  },
];

// State tracking
let isActive = true;

// Set up logging
const { log, error: logError } = createBackgroundLogger();

// Log when the service worker starts
log("Service worker started - v1.0");

// Add diagnostic logging for commands
try {
  if (chrome.commands && chrome.commands.getAll) {
    chrome.commands.getAll((commands) => {
      log(
        "[Diagnostic] Initial commands registered by Chrome:",
        JSON.stringify(commands, null, 2)
      );
      let foundReload = false;
      let foundExecuteAction = false;
      commands.forEach((command) => {
        if (command.name === "reload") foundReload = true;
        if (command.name === "_execute_action") foundExecuteAction = true;
        if (command.name !== "_execute_action" && !command.shortcut) {
          logError(
            `[Diagnostic] Command "${command.name}" is missing its shortcut! Check chrome://extensions/shortcuts for conflicts.`
          );
        }
      });
      if (!foundReload)
        logError("[Diagnostic] 'reload' command not found in getAll results.");
      if (!foundExecuteAction)
        logError("[Diagnostic] '_execute_action' command not found in getAll results.");
    });
  } else {
    logError("[Diagnostic] chrome.commands.getAll API not available at startup.");
  }
} catch (e) {
  logError("[Diagnostic] Error during initial command check:", e);
}

// Test service worker wake-up and initialization (Combined into the main listener below)
// chrome.runtime.onInstalled.addListener(() => {
//   console.log("Extension installed/reloaded! Service worker is alive.");
// });

// Initialize extension on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  log(`Extension ${details.reason}.`);
  chrome.storage.local.set({ isActive: true });

  // Set up the side panel to open on action click
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    log("Side panel behavior set to open on action click.");
  } catch (error) {
    logError("Error setting sidePanel behavior:", error);
  }

  isActive = true;

  // --- Remove automatic side panel opening attempt ---
  // This cannot be done from onInstalled due to user gesture requirements
  /* 
  if (details.reason === "update") {
    log("Detected extension update/reload, attempting to open side panel...");
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0 && tabs[0].id) {
        const activeTab = tabs[0];
        if (!isRestrictedUrl(activeTab.url)) { 
          await chrome.sidePanel.open({
            tabId: activeTab.id,
            windowId: activeTab.windowId,
          });
          log(
            `Side panel opened automatically for tab ${activeTab.id} after update/reload.`
          );
        } else {
          log(
            `Skipped opening side panel automatically on restricted URL: ${activeTab.url}`
          );
        }
      } else {
        log("No active tab found to open side panel automatically.");
      }
    } catch (error) {
      logError(
        "Error trying to open side panel automatically after update/reload:",
        error
      );
    }
  }
  */
  // --- End removed section ---
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

// Helper function to check for restricted URLs
function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return false; // If no URL, assume it's okay (e.g., blank tab)
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("devtools://") ||
    url.startsWith("https://chrome.google.com/webstore")
  ); // Also restrict webstore
}

const RESTRICTED_URL_ERROR = {
  status: "error",
  message:
    "This feature cannot be used on Chrome's internal pages or the Chrome Web Store. Please navigate to a regular web page.",
};

// Handle extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) {
    logError("No valid tab for action click");
    return;
  }

  // Add URL check here
  if (isRestrictedUrl(tab.url)) {
    logError("Action clicked on restricted URL:", tab.url);
    // Optionally notify the user, maybe via a badge or brief popup (if one exists)
    chrome.action.setBadgeText({ text: "X", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 3000);
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

  // Check if the tab is a chrome:// URL or other restricted URL
  chrome.tabs.get(tabId, (tab) => {
    if (isRestrictedUrl(tab.url)) {
      logError("Cannot start selection on restricted URL:", tab.url);
      sendResponse(RESTRICTED_URL_ERROR);
      return;
    }

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
          message: err.message.includes("chrome://")
            ? "This feature cannot be used on Chrome's internal pages. Please navigate to a regular web page."
            : err instanceof Error
            ? err.message
            : String(err),
        });
      });
  });
}

// Helper function to ensure content scripts are injected
async function ensureContentScriptsInjected(tabId: number): Promise<void> {
  log("Ensuring content scripts are injected for tab:", tabId);

  // First check if the tab is a restricted URL
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isRestrictedUrl(tab.url)) {
      // Throw the specific error message for consistency
      throw new Error(RESTRICTED_URL_ERROR.message);
    }

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
  } catch (error: any) {
    // Specify type for error
    logError("Error injecting content scripts:", error);
    // Re-throw the original error message if it's the restricted URL error
    if (error.message === RESTRICTED_URL_ERROR.message) {
      throw error;
    }
    // Otherwise, throw a generic injection error
    throw new Error(`Failed to prepare content script: ${error.message}`);
  }
}

// Handle messages from content script or side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const isFromContentScript = sender.tab?.id;
  const isFromSidePanel = message.source === "sidePanel";
  const messageSource = isFromContentScript
    ? `content script (tab ${sender.tab!.id})`
    : isFromSidePanel
    ? "side panel"
    : message.source || "unknown source";

  log(
    "Message received:",
    message.action,
    "from",
    messageSource,
    "details:",
    JSON.stringify(message).substring(0, 200) // Log truncated message for debugging
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

    case "processingStarted":
      // Acknowledge the processing started notification
      log("Processing started on tab", sender.tab?.id);
      sendResponse({ status: "ok" });
      break;

    case "startSelection":
      if (isFromSidePanel) {
        // When from side panel, get the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0 && tabs[0].id) {
            const tab = tabs[0];
            // Check if the tab is a restricted URL
            if (isRestrictedUrl(tab.url)) {
              logError(
                "Cannot start selection on restricted URL from side panel:",
                tab.url
              );
              sendResponse(RESTRICTED_URL_ERROR);
              return;
            }

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
      log("Processing selection request received:", JSON.stringify(message));
      if (!message.rect || typeof message.rect !== "object") {
        log("Invalid selection rectangle", message.rect);
        sendResponse({ status: "error", error: "Invalid selection rectangle" });
      } else {
        handleProcessSelection(sender.tab?.id, message.rect, sendResponse);
        return true; // Keep the message channel open for the async response
      }
      break;

    case "sidePanelOpened":
      log("Side panel opened");
      // Ensure the side panel is up to date with any existing screenshots
      sendResponse({ status: "ok" });
      break;

    case "analyzeImage":
      handleAnalyzeImage(message.imageUrl, sendResponse, message.customPrompt);
      return true;

    case "toggleSelectionMode":
      if (isFromSidePanel && typeof message.active === "boolean") {
        // Request from sidepanel to toggle selection
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0 && tabs[0].id) {
            const tabId = tabs[0].id;
            const tab = tabs[0];
            // Check if the tab is a restricted URL *before* trying to inject/message
            if (isRestrictedUrl(tab.url)) {
              logError("Cannot toggle selection mode on restricted URL:", tab.url);
              sendResponse(RESTRICTED_URL_ERROR);
              return;
            }

            log(
              `${
                message.active ? "Starting" : "Implicitly cancelling (new toggle off)"
              } selection on tab: ${tabId}`
            );

            // Ensure content script is injected before sending message
            ensureContentScriptsInjected(tabId)
              .then(() => {
                // Send start or implicit cancel (by not sending start) to content script
                if (message.active) {
                  return chrome.tabs.sendMessage(tabId, { action: "startSelection" });
                } else {
                  // If toggling off, we might implicitly cancel, or rely on explicit cancelSelection
                  // For robustness, we can send cancel, but the content script should handle no-op if not active
                  return chrome.tabs.sendMessage(tabId, { action: "cancelSelection" });
                }
              })
              .then(() => {
                log("Sent selection mode message to content script");
                sendResponse({ status: "ok", mode: message.active });
              })
              .catch((err) => {
                logError("Error sending selection message to content script:", err);
                // Check if the error is due to the restricted URL
                if (err.message === RESTRICTED_URL_ERROR.message) {
                  sendResponse(RESTRICTED_URL_ERROR);
                } else {
                  sendResponse({
                    status: "error",
                    message: err.message, // Use the caught error message
                  });
                }
              });
          } else {
            logError("No active tab found for selection toggle");
            sendResponse({ status: "error", message: "No active tab found" });
          }
        });
        return true; // Keep response channel open for async operations
      } else {
        logError("Invalid toggleSelectionMode message received", message);
        sendResponse({ status: "error", message: "Invalid message format" });
      }
      break;

    case "sendChatMessage":
      handleChatMessage(message.message, sendResponse);
      return true;

    default:
      // Enhanced logging for unknown actions
      log("Unknown message action:", message.action, "from", messageSource);
      log("Full message details:", JSON.stringify(message));
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

    log("Screenshot captured successfully");

    // First send the raw screenshot to the sidepanel immediately
    chrome.runtime.sendMessage({
      action: "screenshotCaptured",
      data: screenshot,
      timestamp: new Date().toISOString(),
    });

    // Send success response immediately since we have the screenshot
    sendResponse({ status: "ok", imageUrl: screenshot });

    // Try to process on server, but don't block the user flow
    /* REMOVED BLOCK:
    try {
      log("Attempting to process screenshot on server");

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

      // Send the processed image URL (optional enhancement, not critical)
      chrome.runtime.sendMessage({
        action: "screenshotCaptured",
        data: data.imageUrl,
        timestamp: new Date().toISOString(),
      });
    } catch (serverErr) {
      // Log server processing error but don't show to user since we already have the screenshot
      logError("Server processing error (non-critical):", serverErr);
      // Don't show error to user since we already have a working screenshot
    }
    */
  } catch (err) {
    // This is a critical error - screenshot capture failed
    const errorMessage = err instanceof Error ? err.message : String(err);
    logError("Critical error - Failed to capture screenshot:", errorMessage);

    sendResponse({ status: "error", message: errorMessage });
  }
}

// Handle image analysis request
async function handleAnalyzeImage(
  imageUrl: string,
  sendResponse: Function,
  customPrompt?: string
): Promise<void> {
  log("Handling analyzeImage request for image URL:", imageUrl);

  if (!imageUrl) {
    logError("No image URL provided for analysis");
    sendResponse({ status: "error", message: "No image URL provided" });
    return;
  }

  try {
    log("Sending image to Anthropic for analysis");

    // Use custom prompt if provided, otherwise use default
    const promptToUse = customPrompt || DEFAULT_PROMPT;
    log("Using prompt:", promptToUse);

    // Create form data for the request
    const formData = new FormData();
    formData.append("imageUrl", imageUrl);
    formData.append("prompt", promptToUse);

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
    log("Sending analysis result to sidepanel");
    chrome.runtime.sendMessage({
      action: "analysisComplete",
      resultHtml: analysisContent,
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

// --- Command Listener ---
try {
  if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener((command) => {
      log(`Command received: ${command}`);
      if (command === "reload") {
        log("Reloading extension via command.");
        chrome.runtime.reload();
      }
      // Handle other commands if added later
    });
    log("[Diagnostic] chrome.commands.onCommand listener attached successfully.");
  } else {
    logError(
      "[Diagnostic] chrome.commands or onCommand API not available at listener attachment time."
    );
  }
} catch (error) {
  logError("[Diagnostic] Error initializing commands listener:", error);
}

// --- Basic Test Listeners ---
// These are to test if the service worker can wake up for various events

// Listen for browser startup (service worker will start if browser starts)
chrome.runtime.onStartup.addListener(() => {
  console.log("WAKE UP TEST: Browser started.");
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log("WAKE UP TEST: Tab updated", tabId);
});

// Create a simple alarm that fires one time in 5 seconds after load
try {
  if (chrome.alarms) {
    chrome.alarms.create("wakeupTest", {
      delayInMinutes: 0.1, // 6 seconds
    });

    // Listen for the alarm
    chrome.alarms.onAlarm.addListener((alarm) => {
      console.log("WAKE UP TEST: Alarm triggered:", alarm.name);
    });
    log("Alarms API initialized successfully");
  } else {
    log("chrome.alarms API not available");
  }
} catch (error) {
  logError("Error initializing alarms:", error);
}

// Handle chat message request
async function handleChatMessage(message: string, sendResponse: Function): Promise<void> {
  log("Handling chat message:", message);

  if (!message) {
    logError("No message provided for chat");
    sendResponse({ status: "error", message: "No message provided" });
    return;
  }

  try {
    log("Sending message to chat endpoint");

    // Create form data for the request
    const formData = new FormData();
    formData.append("message", message);

    // Send to the server for processing
    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Unknown error occurred");
    }

    const chatContent = data.content || "";

    log("Chat response received successfully");

    // Notify the side panel of the successful chat response
    chrome.runtime.sendMessage({
      action: "chatResponse",
      content: chatContent,
    });

    sendResponse({ status: "ok" });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logError("Error processing chat message:", errorMessage);

    // Notify the side panel of the error
    chrome.runtime.sendMessage({
      action: "chatError",
      error: errorMessage,
    });

    sendResponse({ status: "error", message: errorMessage });
  }
}

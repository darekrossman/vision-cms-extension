// Import logger utility first to ensure it\'s available immediately
import { createSidePanelLogger } from "./utils";

/**
 * Vision CMS Side Panel Script
 * Handles UI interactions and communication with the background service worker
 */

// Set up logging immediately
const { log, error: logError } = createSidePanelLogger();

// We\'ll import marked lazily when needed
let markedModule: any = null;

// --- State Variables ---
let isSelectionModeActive = false;
let currentTab: chrome.tabs.Tab | null = null;
let selectedPromptId: string | null = null;
let captureInProgress = false;
let analysisInProgress = false;
let latestImageUrl: string | null = null;
let latestProcessedImageUrl: string | null = null; // Store the processed image URL
let loadedHistory: Capture[] = []; // In-memory store for loaded history
let currentCaptureForAnalysis: Capture | null = null; // Track capture being analyzed/loaded from history
let chatAttachedImage: string | null = null; // Store the image URL for chat attachment

// DOM Elements
let chatInput: HTMLTextAreaElement | null = null;
let chatMessages: HTMLDivElement | null = null;
let chatSubmitButton: HTMLButtonElement | null = null;
let chatImagePreview: HTMLDivElement | null = null;
let chatImageThumbnail: HTMLImageElement | null = null;
let chatImageRemoveButton: HTMLButtonElement | null = null;
let isChatLoading = false;

// --- Type Definitions ---

// Represents a single analysis performed on a capture
interface AnalysisResult {
  id: string; // Unique ID for this analysis instance (e.g., timestamp)
  timestamp: number;
  promptId: string; // e.g., 'describe', 'analyze-ui'
  promptText: string; // The actual prompt text used
  resultHtml: string; // The resulting HTML content from analysis
}

// Represents a single captured image and its associated analyses
interface Capture {
  id: string;
  timestamp: number;
  imageUrl: string;
  // Changed from analysisResultHtml: string | null
  analysisResults: AnalysisResult[]; // Array to store multiple analysis results
}

// --- Constants ---
const MAX_HISTORY_ITEMS = 50;

// Mirror PREDEFINED_PROMPTS from background script for UI labeling
const PREDEFINED_PROMPTS = [
  {
    id: "describe",
    text: "Describe what's in this image and extract any text content.",
  },
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

// --- Core Functions ---

// Initialize when the document is loaded
document.addEventListener("DOMContentLoaded", async () => {
  log("DOMContentLoaded fired - Initializing side panel UI");

  try {
    // Import marked library
    try {
      const module = await import("marked");
      markedModule = module;
      markedModule.marked.setOptions({
        gfm: true,
        breaks: true,
      });
      log("Markdown parser imported and configured successfully");
    } catch (error: any) {
      logError("Failed to import or configure markdown parser:", error);
      // Continue without markdown support
    }

    // Set up tab functionality
    setupTabs();

    // Load and display capture history
    try {
      loadedHistory = await loadCaptures();
      displayHistory(loadedHistory);
    } catch (error) {
      logError("Failed to load or display initial capture history:", error);
    }

    // Get active tab info
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs.length > 0) {
        currentTab = tabs[0];
        log("Connected to active tab:", currentTab.id, currentTab.url);
      } else {
        logError("No active tab found");
      }
    } catch (err) {
      logError("Failed to get active tab", err);
    }

    // Get UI elements
    const selectionToggle = document.getElementById(
      "selection-toggle"
    ) as HTMLButtonElement | null;
    const imagePreview = document.getElementById(
      "image-preview"
    ) as HTMLDivElement | null;
    const promptSection = document.getElementById(
      "prompt-section"
    ) as HTMLDivElement | null;
    const customPromptTextarea = document.getElementById(
      "custom-prompt-textarea"
    ) as HTMLTextAreaElement | null;
    const analyzeCustomPromptButton = document.getElementById(
      "analyze-custom-prompt-button"
    ) as HTMLButtonElement | null;

    if (
      !selectionToggle ||
      !imagePreview ||
      !promptSection ||
      !customPromptTextarea ||
      !analyzeCustomPromptButton
    ) {
      logError("Required UI elements not found in DOM");
      return; // Stop initialization if essential elements are missing
    }

    // Set up selection toggle listener
    selectionToggle.addEventListener("click", async () => {
      log("Selection toggle button clicked");
      const wasActive = isSelectionModeActive;
      isSelectionModeActive = !wasActive;
      log(`Selection mode ${isSelectionModeActive ? "activated" : "deactivated"}`);

      updateSelectionToggleState(isSelectionModeActive, selectionToggle);

      try {
        log(
          `Sending toggleSelectionMode message to background script (active: ${isSelectionModeActive})`
        );
        const response = await chrome.runtime.sendMessage({
          action: "toggleSelectionMode",
          active: isSelectionModeActive,
          source: "sidePanel",
        });
        log(`Background response for toggleSelectionMode:`, response);
        if (response && response.status === "error") {
          logError(`Error toggling selection mode:`, response.message);
          // Revert state on error
          isSelectionModeActive = wasActive;
          updateSelectionToggleState(wasActive, selectionToggle);
        }
      } catch (error) {
        logError(`Failed to send toggleSelectionMode message:`, error);
        // Revert state on error
        isSelectionModeActive = wasActive;
        updateSelectionToggleState(wasActive, selectionToggle);
      }
    });

    // --- Helper function to trigger analysis ---
    const triggerAnalysis = async (promptText: string, promptId = "custom") => {
      if (!latestImageUrl || analysisInProgress || !currentCaptureForAnalysis) {
        log("Analysis trigger prevented: Conditions not met.", {
          latestImageUrl: !!latestImageUrl,
          analysisInProgress,
          currentCaptureForAnalysis: !!currentCaptureForAnalysis,
        });
        return;
      }

      // Check if we are viewing a historical capture that *already* has a result for this specific prompt
      const existingResult = currentCaptureForAnalysis.analysisResults.find(
        (r) => r.promptId === promptId
      );
      if (existingResult) {
        log(
          `Analysis trigger prevented: Result already exists for prompt ID '${promptId}' on this historical capture.`
        );
        // Optionally, re-display the existing result instead of doing nothing
        displayAnalysisResults(existingResult.resultHtml);
        return;
      }

      // --- NEW: Clear custom prompt textarea if using a predefined button ---
      if (promptId !== "custom" && customPromptTextarea) {
        customPromptTextarea.value = ""; // Clear custom prompt if using predefined
      }
      // --- End NEW ---

      log(`Triggering analysis with prompt ID: ${promptId}`);
      selectedPromptId = promptId; // Keep track of the type of prompt used

      setAnalysisLoadingState(true);
      analysisInProgress = true;

      try {
        const response = await chrome.runtime.sendMessage({
          action: "analyzeImage",
          imageUrl: latestImageUrl,
          customPrompt: promptText, // Use the provided prompt text directly
        });

        log("Background service worker response for analysis request:", response);

        if (response && response.status === "error") {
          logError(
            "Background script reported error initiating analysis:",
            response.message
          );
          setAnalysisLoadingState(false, "Error starting analysis. Try again.");
          analysisInProgress = false;
        }
      } catch (error) {
        logError("Failed to send analyzeImage message", error);
        setAnalysisLoadingState(false, "Error occurred sending request.");
        analysisInProgress = false;
      }
    };
    // --- End helper function ---

    // Set up prompt button event listeners (PREDEFINED prompts)
    const promptButtons = document.querySelectorAll(
      ".prompt-button:not(.custom-prompt-button)" // Exclude the custom button
    );
    promptButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const promptId = (button as HTMLElement).dataset.promptId || "describe";
        const promptText = getPromptTextById(promptId); // Get text from predefined list
        await triggerAnalysis(promptText, promptId); // Use the helper function
      });
    });

    // --- Add listener for the CUSTOM prompt button ---
    analyzeCustomPromptButton.addEventListener("click", async () => {
      const customPromptText = customPromptTextarea.value.trim();
      if (!customPromptText) {
        logError("Custom prompt button clicked, but textarea is empty.");
        // Optionally provide feedback: e.g., shake the textarea
        customPromptTextarea.focus();
        return;
      }
      await triggerAnalysis(customPromptText, "custom"); // Pass custom text and ID 'custom'
    });
    // --- End listener for custom prompt button ---

    // Set up chat functionality
    setupChat();
  } catch (error) {
    logError("Critical error during side panel initialization:", error);
    // Maybe display an error message to the user in the UI here
  }
});

// --- Message Listener ---
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  log("Received message from extension:", message.action);

  switch (message.action) {
    case "screenshotCaptured":
      log("Screenshot captured message received");
      // Convert the data URL to an object URL for better performance with large images
      handleScreenshotCaptured(message.data);
      break;

    case "processedImageReady":
      log("Processed image ready message received");
      // Store the processed image URL for use in chat
      if (typeof message.data === "string") {
        latestProcessedImageUrl = message.data;

        // If we have an attached image in chat that's the full screenshot,
        // update it to use the processed version instead
        if (
          chatAttachedImage === latestImageUrl &&
          latestProcessedImageUrl &&
          chatImageThumbnail
        ) {
          log("Updating chat thumbnail to use processed image");
          chatAttachedImage = latestProcessedImageUrl;
          chatImageThumbnail.src = latestProcessedImageUrl;
        }
      }
      break;

    case "analysisComplete":
      log("Analysis complete message received");
      handleAnalysisCompleted(message.resultHtml);
      break;

    case "analysisError":
      log("Analysis error message received");
      handleAnalysisError(message.error);
      break;

    case "chatResponse":
      log("Chat response message received");
      hideThinkingIndicator();
      addMessageToChat("assistant", message.content);
      break;

    case "chatError":
      log("Chat error message received");
      hideThinkingIndicator();
      addMessageToChat(
        "assistant",
        `Error: ${message.error || "Unknown error occurred"}`
      );
      break;

    case "chatToolUsage":
      log("Chat tool usage message received");
      displayToolUsage(message.toolInfo);
      break;

    default:
      log("Unhandled message received:", message);
  }

  // Default return false if no async operation requires keeping the channel open
  // However, the async cases above return true, so this might not be strictly necessary
  // but good practice for clarity if adding more sync cases later.
  return true; // Keep channel open for potential async operations in handlers
});

// --- UI Update Functions ---

function setupTabs(): void {
  try {
    log("Setting up tab functionality");
    const tabButtons = document.querySelectorAll<HTMLElement>(".tab-button");
    const tabContents = document.querySelectorAll<HTMLElement>(".tab-content");

    if (tabButtons.length === 0 || tabContents.length === 0) {
      logError("Could not find tab buttons or content elements.");
      return;
    }

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.getAttribute("data-tab");
        if (!tabId) return logError("No tab ID found on clicked button");
        log(`Tab button clicked: ${tabId}`);

        // Check if this is the chat tab and we have a recent image
        const isChatTab = tabId === "content-tab-4";

        tabButtons.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");

        tabContents.forEach((content) => content.classList.remove("active"));
        const selectedTabContent = document.getElementById(tabId);
        if (selectedTabContent) {
          selectedTabContent.classList.add("active");
          log(`Activated tab content: ${tabId}`);

          // Handle the special case: switching to chat tab with a recent image
          if (isChatTab && latestImageUrl && !chatAttachedImage) {
            // Ask if the user wants to attach the image to chat
            const shouldAttach = confirm(
              "Would you like to attach the most recent screenshot to your chat?"
            );
            if (shouldAttach) {
              attachImageToChat(latestImageUrl);
            }
          }
        } else {
          logError(`Tab content not found: ${tabId}`);
        }
      });
    });
    log("Tab functionality setup complete");
  } catch (error) {
    logError("Error setting up tab functionality:", error);
  }
}

function updateSelectionToggleState(
  active: boolean,
  toggleButton: HTMLButtonElement | null // Allow for null check
): void {
  if (!toggleButton) return; // Guard clause
  if (active) {
    toggleButton.classList.add("active");
    toggleButton.title = "Cancel Selection";
  } else {
    toggleButton.classList.remove("active");
    toggleButton.title = "Capture Area";
  }
}

function displayImage(imageUrl: string): void {
  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;
  if (!imagePreview) return logError("Image preview element not found");

  log("Displaying image in preview area");
  imagePreview.innerHTML = ""; // Clear previous content
  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = "Captured content";
  img.style.display = "block"; // Ensure image is visible
  img.onerror = () => {
    logError("Failed to load image preview:", imageUrl);
    imagePreview.innerHTML =
      '<p style="color: var(--error-color); padding: 10px;">Failed to load image.</p>';
  };
  imagePreview.appendChild(img);
  imagePreview.style.display = "flex"; // Make container visible
  latestImageUrl = imageUrl; // Update state
}

function showPromptSection(): void {
  const promptSection = document.getElementById(
    "prompt-section"
  ) as HTMLDivElement | null;
  const analysisResults = document.getElementById(
    "analysis-results"
  ) as HTMLDivElement | null;
  if (!promptSection || !analysisResults)
    return logError("Prompt section or analysis results element not found");

  log("Showing prompt section");
  promptSection.style.display = "block";
  analysisResults.style.display = "none"; // Hide results when showing prompts
  analysisResults.innerHTML = ""; // Clear old results
  setAnalysisLoadingState(false); // Ensure loading indicator is reset
}

function displayAnalysisResults(htmlContent: string): void {
  const analysisResults = document.getElementById(
    "analysis-results"
  ) as HTMLDivElement | null;
  const promptSection = document.getElementById(
    "prompt-section"
  ) as HTMLDivElement | null;
  if (!analysisResults || !promptSection)
    return logError("Analysis results or prompt section element not found");

  log("Displaying analysis results");
  try {
    // Use 'unsafe-html' potentially if marked requires it, or sanitize if needed
    analysisResults.innerHTML = markedModule
      ? markedModule.marked.parse(htmlContent)
      : htmlContent;
  } catch (parseError) {
    logError("Error parsing markdown for analysis results:", parseError);
    // Display raw content safely escaped within <pre> on error
    const pre = document.createElement("pre");
    pre.textContent = htmlContent;
    analysisResults.innerHTML = `<p style="color: var(--error-color);">Error displaying analysis results.</p>`;
    analysisResults.appendChild(pre);
  }
  analysisResults.style.display = "block"; // Show results area
  promptSection.style.display = "none"; // Hide prompts
  setAnalysisLoadingState(false); // Ensure loading indicator is hidden
}

function setAnalysisLoadingState(
  isLoading: boolean,
  message = "Analyzing content..."
): void {
  const promptButtons = document.querySelector(
    ".prompt-buttons"
  ) as HTMLDivElement | null;
  const chatLoader = document.getElementById("chat-loader") as HTMLDivElement | null;
  if (!promptButtons || !chatLoader)
    return logError("Prompt buttons or chat loader elements not found");

  const loaderText = chatLoader.querySelector(".chat-loader-text");

  if (isLoading) {
    promptButtons.style.display = "none";
    chatLoader.style.display = "block";
    if (loaderText) loaderText.textContent = message;
  } else {
    // Only show prompt buttons if analysis isn't currently displayed
    const analysisResults = document.getElementById(
      "analysis-results"
    ) as HTMLDivElement | null;
    if (!analysisResults || analysisResults.style.display === "none") {
      promptButtons.style.display = "flex";
    } else {
      promptButtons.style.display = "none"; // Keep hidden if results are shown
    }
    chatLoader.style.display = "none";
    // Reset loader text to default unless a specific final message was provided
    if (loaderText && message !== "Analyzing content...") {
      // Display final status/error briefly? Or maybe just log it.
      // For now, just reset. Consider adding a temporary message display if needed.
      loaderText.textContent = "Analyzing content...";
    } else if (loaderText) {
      loaderText.textContent = "Analyzing content..."; // Reset to default
    }
  }
}

// --- Screenshot Handling ---

async function handleScreenshotCaptured(dataUrl: string): Promise<void> {
  log("Handling screenshot captured");
  captureInProgress = false; // Reset capture flag
  currentCaptureForAnalysis = null; // Reset context, this is a NEW capture

  // Store the latest image URL for potential chat attachment
  latestImageUrl = dataUrl;

  // Check if we're on the chat tab (tab-4)
  const chatTab = document.getElementById("tab-4");
  const isChatTabActive = chatTab?.classList.contains("active");

  if (isChatTabActive) {
    // If we're on the chat tab, attach the image to the chat
    attachImageToChat(dataUrl);
  } else {
    // Regular flow for analysis tab
    displayImage(dataUrl);
    showPromptSection(); // Always show prompts for a new capture
  }

  try {
    // Save the capture *without* analysis results initially
    const newCapture = await saveCapture(dataUrl);
    currentCaptureForAnalysis = newCapture; // Set context for this new capture
    addCaptureToHistoryUI(newCapture); // Add to UI list
  } catch (error) {
    logError("Failed to save or update history UI for new capture:", error);
  }
}

// Function to attach image to chat
function attachImageToChat(imageUrl: string): void {
  log("Attaching image to chat");

  // Use the processed image if available, otherwise use the original
  if (imageUrl === latestImageUrl && latestProcessedImageUrl) {
    log("Using processed image for chat attachment");
    chatAttachedImage = latestProcessedImageUrl;
  } else {
    chatAttachedImage = imageUrl;
  }

  if (chatImagePreview && chatImageThumbnail && chatAttachedImage) {
    chatImageThumbnail.src = chatAttachedImage;
    chatImagePreview.style.display = "flex";
  }
}

// --- Capture History Functions ---

async function saveCapture(imageUrl: string): Promise<Capture> {
  const newCapture: Capture = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    imageUrl: imageUrl,
    analysisResults: [], // Initialize analysis results as empty array
  };
  log("Saving new capture:", newCapture.id);

  try {
    // Update storage
    const result = await chrome.storage.local.get("captureHistory");
    let history: Capture[] = result.captureHistory || [];
    history.unshift(newCapture); // Add to the beginning
    if (history.length > MAX_HISTORY_ITEMS) {
      history = history.slice(0, MAX_HISTORY_ITEMS); // Limit size
    }
    await chrome.storage.local.set({ captureHistory: history });
    log(`Capture history updated in storage. Total items: ${history.length}`);

    // Update in-memory history consistently
    loadedHistory.unshift(newCapture);
    if (loadedHistory.length > MAX_HISTORY_ITEMS) {
      loadedHistory = loadedHistory.slice(0, MAX_HISTORY_ITEMS);
    }
    log(`In-memory history updated. Total items: ${loadedHistory.length}`);

    return newCapture; // Return the newly created capture object
  } catch (error) {
    logError("Error saving capture to storage:", error);
    throw error; // Re-throw to allow caller to handle
  }
}

async function loadCaptures(): Promise<Capture[]> {
  log("Loading capture history from storage");
  try {
    const result = await chrome.storage.local.get("captureHistory");
    let history: Capture[] = result.captureHistory || [];
    log(`Loaded ${history.length} captures from history`);
    // Ensure all loaded captures have the analysisResults field (backward compatibility)
    // Initialize as empty array if missing. Also sort by timestamp descending.
    history = history
      .map((c) => ({
        ...c,
        // Ensure analysisResults is an array, provide default empty array if not
        analysisResults: Array.isArray(c.analysisResults) ? c.analysisResults : [],
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
    return history;
  } catch (error) {
    logError("Error loading capture history:", error);
    return []; // Return empty array on error
  }
}

async function updateCaptureResult(
  captureId: string,
  newAnalysis: AnalysisResult // Pass the full analysis object
): Promise<void> {
  log(`Updating analysis result for capture: ${captureId}`);
  let historyUpdated = false;
  try {
    // --- Update in storage ---
    const result = await chrome.storage.local.get("captureHistory");
    const storageHistory: Capture[] = result.captureHistory || [];
    const storageIndex = storageHistory.findIndex((capture) => capture.id === captureId);

    if (storageIndex !== -1) {
      // Ensure the analysisResults array exists before pushing
      if (!Array.isArray(storageHistory[storageIndex].analysisResults)) {
        storageHistory[storageIndex].analysisResults = [];
      }
      storageHistory[storageIndex].analysisResults.push(newAnalysis); // Push the new result object
      await chrome.storage.local.set({ captureHistory: storageHistory });
      log(`Successfully updated analysis result in storage for capture: ${captureId}`);
      historyUpdated = true;
    } else {
      logError(
        `Capture not found in storage for ID: ${captureId}. Cannot update result.`
      );
      // Don't throw here, maybe the in-memory version is correct? Log is sufficient.
    }
  } catch (error) {
    logError(
      `Error updating analysis result in storage for capture ${captureId}:`,
      error
    );
    // Don't necessarily throw, try updating memory anyway if possible
  }

  // --- Update in-memory history ---
  try {
    const inMemoryIndex = loadedHistory.findIndex((capture) => capture.id === captureId);
    if (inMemoryIndex !== -1) {
      // Ensure the analysisResults array exists before pushing
      if (!Array.isArray(loadedHistory[inMemoryIndex].analysisResults)) {
        loadedHistory[inMemoryIndex].analysisResults = [];
      }
      loadedHistory[inMemoryIndex].analysisResults.push(newAnalysis); // Push the new result object
      log(`Successfully updated analysis result in memory for capture: ${captureId}`);
      historyUpdated = true;
    } else {
      // This might happen if history was loaded before the item was fully saved, less critical
      log(`Capture ${captureId} not found in loadedHistory during update.`);
    }
  } catch (memError) {
    logError(`Error updating in-memory history for capture ${captureId}:`, memError);
  }

  if (!historyUpdated) {
    // If neither storage nor memory could be updated, throw an error
    // so the caller knows the save might have failed.
    throw new Error(
      `Failed to update analysis result for capture ${captureId} in both storage and memory.`
    );
  }
}

function renderHistoryItem(capture: Capture): HTMLLIElement {
  const listItem = document.createElement("li");
  listItem.className = "history-item";
  listItem.dataset.captureId = capture.id;

  // --- Header Part (Always Visible) ---
  const header = document.createElement("div");
  header.className = "history-item-header";

  const img = document.createElement("img");
  img.className = "history-thumbnail";
  img.src = capture.imageUrl;
  img.alt = `Capture from ${new Date(capture.timestamp).toLocaleString()}`;
  img.onerror = () => {
    img.style.visibility = "hidden";
  };

  const textContainer = document.createElement("div");
  textContainer.className = "history-item-text";

  const timestampSpan = document.createElement("span");
  timestampSpan.className = "history-timestamp";
  timestampSpan.textContent = new Date(capture.timestamp).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  });

  const statusSpan = document.createElement("span");
  statusSpan.className = "history-status";
  const analysisCount = capture.analysisResults?.length || 0;
  statusSpan.textContent =
    analysisCount === 1 ? "1 Analysis" : `${analysisCount} Analyses`;
  statusSpan.style.color =
    analysisCount > 0 ? "var(--success-color)" : "var(--text-secondary)";

  // Add an indicator for expansion (e.g., chevron icon)
  const expandIndicator = document.createElement("span");
  expandIndicator.className = "expand-indicator";
  expandIndicator.innerHTML = "&#9656;"; // Right-pointing triangle

  textContainer.appendChild(timestampSpan);
  textContainer.appendChild(statusSpan);
  header.appendChild(img);
  header.appendChild(textContainer);
  header.appendChild(expandIndicator); // Add indicator to the header

  // --- Collapsible Content Part (Initially Hidden) ---
  const content = document.createElement("div");
  content.className = "history-item-content";
  // Initially hidden via CSS

  listItem.appendChild(header);
  listItem.appendChild(content);

  // --- Click Listener for Expansion ---
  header.addEventListener("click", () => {
    const isExpanded = listItem.classList.toggle("expanded");
    expandIndicator.innerHTML = isExpanded ? "&#9662;" : "&#9656;"; // Toggle indicator

    // Populate content only on first expansion
    if (isExpanded && !content.dataset.populated) {
      log(`Populating analysis history for capture: ${capture.id}`);
      content.dataset.populated = "true"; // Mark as populated

      // Always create the containers
      const analysisList = document.createElement("ul");
      analysisList.className = "analysis-list";

      const resultDisplay = document.createElement("div");
      resultDisplay.className = "analysis-result-display";
      resultDisplay.style.display = "none"; // Hide initially

      content.appendChild(analysisList); // Add list container
      content.appendChild(resultDisplay); // Add result display container

      const currentAnalysisCount = capture.analysisResults?.length || 0; // Get current count

      if (currentAnalysisCount > 0) {
        // Sort analyses by timestamp, newest first
        const sortedAnalyses = [...capture.analysisResults].sort(
          (a, b) => b.timestamp - a.timestamp
        );

        sortedAnalyses.forEach((analysis) => {
          const analysisItem = document.createElement("li");
          analysisItem.className = "analysis-list-item";
          analysisItem.dataset.analysisId = analysis.id;

          // Set button text directly (prompt label)
          const promptInfo = PREDEFINED_PROMPTS.find(
            (p: { id: string; text: string }) => p.id === analysis.promptId
          );
          analysisItem.textContent = promptInfo
            ? promptInfo.text.split(" ")[0]
            : analysis.promptId; // Use textContent for button
          analysisItem.title = analysis.promptText; // Keep full prompt on hover

          analysisItem.addEventListener("click", (e) => {
            e.stopPropagation();
            analysisList
              .querySelectorAll(".analysis-list-item")
              .forEach((item) => item.classList.remove("selected"));
            analysisItem.classList.add("selected");
            log(`Displaying analysis result: ${analysis.id}`);
            try {
              resultDisplay.innerHTML = markedModule
                ? markedModule.marked.parse(analysis.resultHtml)
                : analysis.resultHtml;
              resultDisplay.style.display = "block";
            } catch (parseError) {
              logError("Error parsing markdown for analysis results:", parseError);
              resultDisplay.innerHTML = `<p style="color: var(--error-color);">Error displaying analysis.</p><pre>${analysis.resultHtml}</pre>`;
              resultDisplay.style.display = "block";
            }
          });
          analysisList.appendChild(analysisItem);
        });
      } else {
        // If no analyses, show the message inside the list container
        analysisList.innerHTML = `<p class="no-analysis-message">No analysis results available for this capture.</p>`;
      }
    }
  });

  return listItem;
}

function displayHistory(captures: Capture[]): void {
  log("Displaying capture history UI");
  const historyList = document.getElementById("history-list") as HTMLUListElement | null;
  if (!historyList) return logError("History list element not found");

  historyList.innerHTML = ""; // Clear current list content

  if (!captures || captures.length === 0) {
    // Show placeholder if history is empty or undefined
    const placeholder = document.createElement("li");
    placeholder.style.padding = "20px";
    placeholder.style.textAlign = "center";
    placeholder.style.color = "var(--text-secondary)";
    placeholder.textContent = "No captures yet.";
    historyList.appendChild(placeholder);
    log("History is empty or invalid, showing placeholder");
  } else {
    // Render each history item
    captures.forEach((capture) => {
      // Basic validation of capture object might be good here
      if (capture && capture.id && capture.timestamp && capture.imageUrl) {
        const listItem = renderHistoryItem(capture);
        historyList.appendChild(listItem);
      } else {
        logError("Invalid capture object found in history:", capture);
      }
    });
    log(`Rendered ${captures.length} history items`);
  }
}

function addCaptureToHistoryUI(capture: Capture): void {
  log("Adding new capture to history UI");
  const historyList = document.getElementById("history-list") as HTMLUListElement | null;
  if (!historyList) return logError("History list element not found");

  // Remove placeholder if it exists
  const placeholder = historyList.querySelector('li[style*="padding: 20px"]');
  if (placeholder) placeholder.remove();

  // Render the new item
  const listItem = renderHistoryItem(capture);

  // Add to the top of the list
  historyList.insertBefore(listItem, historyList.firstChild);
  log(`Added capture ${capture.id} to the top of the history list UI`);

  // Optional: Limit the number of items *displayed* in the DOM for performance,
  // even if more are stored in memory/storage.
  while (historyList.children.length > MAX_HISTORY_ITEMS) {
    if (historyList.lastChild) {
      // Check if lastChild exists
      historyList.removeChild(historyList.lastChild);
    } else {
      break; // Should not happen, but prevents infinite loop
    }
  }
}

// --- Utility Functions ---

function getPromptTextById(promptId: string): string {
  const prompts: { [key: string]: string } = {
    describe: "Describe the visual content of this image and extract any text present.",
    "extract-text": "Extract all text from this image.",
    "analyze-ui":
      "Analyze the UI/UX design of this screenshot. Identify key components, assess layout, usability, and suggest improvements.",
    "identify-content":
      "Identify the main content sections or blocks visible in this image (e.g., header, footer, sidebar, article, product grid).",
    "seo-analysis":
      "Analyze this image from an SEO perspective. Suggest alt text, describe relevant content for surrounding text, and identify optimization opportunities if it were on a webpage.",
    "content-type-json":
      "Based on the content in this image, create a simple JSON structure representing a potential content type definition suitable for a headless CMS. Include relevant fields and estimate their types (e.g., text, image, number).",
  };
  return prompts[promptId] || prompts.describe; // Default to describe if ID is unknown
}

function setupChat(): void {
  try {
    log("Setting up chat functionality");

    // Get DOM elements
    chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
    chatMessages = document.getElementById("chat-messages") as HTMLDivElement | null;
    chatSubmitButton = document.getElementById("chat-submit") as HTMLButtonElement | null;
    chatImagePreview = document.getElementById(
      "chat-image-preview"
    ) as HTMLDivElement | null;
    chatImageThumbnail = document.getElementById(
      "chat-image-thumbnail"
    ) as HTMLImageElement | null;
    chatImageRemoveButton = document.getElementById(
      "chat-image-remove"
    ) as HTMLButtonElement | null;

    if (
      !chatInput ||
      !chatMessages ||
      !chatSubmitButton ||
      !chatImagePreview ||
      !chatImageThumbnail ||
      !chatImageRemoveButton
    ) {
      logError("Chat UI elements not found");
      return;
    }

    // Add event listener for the submit button
    chatSubmitButton.addEventListener("click", submitChatMessage);

    // Add event listener for Enter key (but allow Shift+Enter for new lines)
    chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitChatMessage();
      }
    });

    // Add event listener for the remove button
    chatImageRemoveButton.addEventListener("click", () => {
      chatAttachedImage = null;
      if (chatImagePreview && chatImageThumbnail) {
        chatImagePreview.style.display = "none";
        chatImageThumbnail.src = "";
      }
    });

    log("Chat functionality setup complete");
  } catch (error) {
    logError("Error setting up chat functionality:", error);
  }
}

function submitChatMessage(): void {
  if (!chatInput || !chatMessages || !chatSubmitButton || isChatLoading) return;

  const message = chatInput.value.trim();
  const hasImage = chatAttachedImage !== null;

  if (!message && !hasImage) return; // Don't send empty messages without an image

  log("Submitting chat message:", message, "with image:", hasImage);

  // Add user message to chat with the currently attached image
  addMessageToChat("user", message, chatAttachedImage);

  // Clear input
  chatInput.value = "";

  // Hide and clear the image preview
  if (chatImagePreview && chatImageThumbnail && hasImage) {
    chatImagePreview.style.display = "none";
    // Don't clear the src yet, we need it for the message
  }

  // Show thinking indicator
  showThinkingIndicator();

  // Get the image to send - prefer the processed image if it's the latest one
  const imageToSend = chatAttachedImage;

  // Send message to server with image (if any)
  sendChatMessage(message, imageToSend);

  // Clear the attached image after sending
  chatAttachedImage = null;
}

function addMessageToChat(
  role: "user" | "assistant",
  content: string,
  imageUrl: string | null = null
): void {
  if (!chatMessages) return;

  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${role}`;

  const contentElement = document.createElement("div");
  contentElement.className = "message-content";

  // If there's an image and this is a user message, add it before the text
  if (imageUrl && role === "user") {
    const imgElement = document.createElement("img");
    imgElement.src = imageUrl;
    imgElement.className = "chat-message-image";
    imgElement.alt = "Attached image";
    contentElement.appendChild(imgElement);

    // Add a line break if there's also text content
    if (content) {
      const breakElement = document.createElement("br");
      contentElement.appendChild(breakElement);
    }
  }

  // Add the text content
  if (content) {
    // If we have markdown support and this is an assistant message, render as markdown
    if (markedModule && role === "assistant") {
      contentElement.innerHTML += markedModule.marked(content);
    } else {
      // Otherwise just set text content with line breaks preserved
      const textNode = document.createTextNode(content);
      contentElement.appendChild(textNode);
    }
  }

  messageElement.appendChild(contentElement);
  chatMessages.appendChild(messageElement);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showThinkingIndicator(): void {
  if (!chatMessages) return;

  // Remove any existing thinking indicator first
  hideThinkingIndicator();

  isChatLoading = true;

  const thinkingElement = document.createElement("div");
  thinkingElement.className = "chat-thinking";
  thinkingElement.id = "chat-thinking";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "chat-thinking-dot";
    thinkingElement.appendChild(dot);
  }

  chatMessages.appendChild(thinkingElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (chatSubmitButton) {
    chatSubmitButton.disabled = true;
  }
}

function hideThinkingIndicator(): void {
  const thinkingElement = document.getElementById("chat-thinking");
  if (thinkingElement) {
    thinkingElement.remove();
  }

  isChatLoading = false;

  if (chatSubmitButton) {
    chatSubmitButton.disabled = false;
  }
}

async function sendChatMessage(
  message: string,
  imageUrl: string | null = null
): Promise<void> {
  try {
    log("Sending chat message to background script" + (imageUrl ? " with image" : ""));

    const response = await chrome.runtime.sendMessage({
      action: "sendChatMessage",
      message,
      imageUrl,
      source: "sidePanel",
    });

    log("Received response from background script:", response);

    if (response.status === "error") {
      hideThinkingIndicator();
      addMessageToChat("assistant", `Error: ${response.message}`);
      return;
    }

    // Response is handled by the message listener
  } catch (error) {
    logError("Error sending chat message:", error);
    hideThinkingIndicator();
    addMessageToChat(
      "assistant",
      "Sorry, there was an error sending your message. Please try again."
    );
  }
}

// Display tool usage information in the chat
function displayToolUsage(toolInfo: {
  name: string;
  status: string;
  description: string;
}): void {
  if (!chatMessages) return;

  // Remove existing tool message with the same name if it exists
  const existingToolMessages = document.querySelectorAll(
    `.chat-tool-message[data-tool="${toolInfo.name}"]`
  );
  existingToolMessages.forEach((element) => element.remove());

  const toolElement = document.createElement("div");
  toolElement.className = `chat-tool-message ${toolInfo.status}`;
  toolElement.setAttribute("data-tool", toolInfo.name);

  // Create left side with icon and tool name
  const leftContainer = document.createElement("div");
  leftContainer.className = "tool-left";

  const iconSpan = document.createElement("span");
  iconSpan.className = "tool-icon";

  // Different icons for different statuses
  if (toolInfo.status === "started") {
    iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  } else if (toolInfo.status === "completed") {
    iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  } else if (toolInfo.status === "failed") {
    iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  }

  const textSpan = document.createElement("span");
  textSpan.className = "tool-text";

  // Extract tool name from description for cleaner display
  const toolName = toolInfo.name.replace(/_/g, " ");
  textSpan.textContent = toolName;

  leftContainer.appendChild(iconSpan);
  leftContainer.appendChild(textSpan);

  // Create right side with status
  const rightContainer = document.createElement("div");
  rightContainer.className = "tool-right";

  let statusText = "";
  if (toolInfo.status === "started") {
    statusText = "Running";
  } else if (toolInfo.status === "completed") {
    statusText = "Completed";
  } else if (toolInfo.status === "failed") {
    statusText = "Failed";
  }

  rightContainer.textContent = statusText;

  // Add containers to the tool element
  toolElement.appendChild(leftContainer);
  toolElement.appendChild(rightContainer);

  // Add the tool element to chat - don't remove thinking indicator
  // Insert the tool message before the thinking indicator if it exists
  const thinkingIndicator = document.getElementById("chat-thinking");

  if (thinkingIndicator && chatMessages.contains(thinkingIndicator)) {
    chatMessages.insertBefore(toolElement, thinkingIndicator);
  } else {
    chatMessages.appendChild(toolElement);

    // If tool is starting and there's no thinking indicator, show it
    if (toolInfo.status === "started" && !document.getElementById("chat-thinking")) {
      showThinkingIndicator();
    }
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add these helper functions to handle analysis and errors
function handleAnalysisCompleted(resultHtml: string): void {
  log("Handling completed analysis");
  if (currentCaptureForAnalysis) {
    const promptIdToUse = selectedPromptId || "unknown"; // Use the tracked selectedPromptId
    const promptTextToUse =
      promptIdToUse === "custom"
        ? (
            document.getElementById("custom-prompt-textarea") as HTMLTextAreaElement
          )?.value?.trim() || "Custom prompt (text unavailable)"
        : getPromptTextById(promptIdToUse) || "Predefined prompt (text unavailable)";

    const newAnalysis: AnalysisResult = {
      id: `analysis-${Date.now()}`, // Unique ID for this result
      timestamp: Date.now(),
      promptId: promptIdToUse,
      promptText: promptTextToUse, // Store the actual prompt used
      resultHtml: resultHtml,
    };

    // Display and save the new result
    displayAnalysisResults(newAnalysis.resultHtml);
    updateCaptureResult(currentCaptureForAnalysis.id, newAnalysis);

    setAnalysisLoadingState(false);
    analysisInProgress = false;
    // Reset selected prompt after completion
    selectedPromptId = null;
  } else {
    logError("Analysis complete but missing context");
    setAnalysisLoadingState(false, "Error displaying result.");
    analysisInProgress = false;
  }
}

function handleAnalysisError(error: string): void {
  logError("Analysis error:", error);
  setAnalysisLoadingState(false, `Analysis failed: ${error}`);
  analysisInProgress = false;
  selectedPromptId = null; // Reset selected prompt on error
}

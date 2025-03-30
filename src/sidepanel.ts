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

// Extend the HTMLSelectElement interface to add the hasEventListener property
declare global {
  interface HTMLSelectElement {
    hasEventListener?: boolean;
  }
}

// --- DOM Elements ---
const selectionToggle = document.getElementById(
  "selection-toggle"
) as HTMLButtonElement | null;
const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;
const loadingSpinner = document.getElementById(
  "loading-spinner"
) as HTMLDivElement | null;
const promptSection = document.getElementById("prompt-section") as HTMLDivElement | null;
const promptButtons = document.querySelectorAll(".prompt-button[data-prompt-id]");
const customPromptTextarea = document.getElementById(
  "custom-prompt-textarea"
) as HTMLTextAreaElement | null;
const analyzeCustomPromptButton = document.getElementById(
  "analyze-custom-prompt-button"
) as HTMLButtonElement | null;
const analysisResults = document.getElementById(
  "analysis-results"
) as HTMLDivElement | null;
const chatLoader = document.getElementById("chat-loader") as HTMLDivElement | null;
const historyList = document.getElementById("history-list") as HTMLUListElement | null;
const deleteAllHistoryButton = document.getElementById(
  "delete-all-history-button"
) as HTMLButtonElement | null;
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");
const chatMessages = document.getElementById("chat-messages") as HTMLDivElement | null;
const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
const chatSubmit = document.getElementById("chat-submit") as HTMLButtonElement | null;
const chatImagePreview = document.querySelector(
  ".chat-image-preview"
) as HTMLDivElement | null;
const chatImageThumbnail = document.querySelector(
  ".chat-image-thumbnail"
) as HTMLImageElement | null;
const chatImageRemove = document.querySelector(
  ".chat-image-remove"
) as HTMLButtonElement | null;
const chatModelSelector = document.getElementById(
  "chat-model-selector"
) as HTMLSelectElement | null;

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
let chatAttachedImages: { id: string; url: string }[] = []; // Store multiple image URLs for chat attachment
let isChatLoading = false; // Declare globally

// Global variable to store captures
let captures: Capture[] = [];
let availableModels: {
  id: string;
  name: string;
  provider: string;
  supportsVision: boolean;
}[] = [];
let selectedModel = ""; // Changed from string | null to string only
// Add a variable to store chat conversation history
const chatHistory: {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string | null;
}[] = [];

// Track the current chat conversation
let currentChatId: string | null = null;
// Store all chat conversations
let chatConversations: ChatConversation[] = [];
const MAX_CHAT_HISTORY_ITEMS = 20;

// --- Type Definitions ---

// Represents a single analysis performed on a capture
interface AnalysisResult {
  id: string; // Unique ID for this analysis instance (e.g., timestamp)
  timestamp: number;
  promptId: string; // e.g., 'describe', 'analyze-ui'
  promptText: string; // The actual prompt text used
  resultHtml: string; // The resulting HTML content from analysis
}

// Represents a single chat conversation
interface ChatConversation {
  id: string;
  timestamp: number;
  title: string;
  messages: {
    role: "user" | "assistant";
    content: string;
    imageUrl?: string | null;
  }[];
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

    // Set up chat functionality
    setupChat();

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

    // Fetch available models
    fetchAvailableModels();

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

        // Check if we're on the chat tab and need to attach the processed image
        const chatTab = document.getElementById("tab-4");
        const isChatTabActive = chatTab?.classList.contains("active");

        if (isChatTabActive && chatImagePreview) {
          // Remove the processing indicator if it exists
          removeProcessingImageIndicator();

          // Attach the processed image to chat
          if (latestProcessedImageUrl) {
            log("Attaching processed image to chat");
            attachImageToChat(latestProcessedImageUrl);
          }
        }

        // Also update any existing chat attachments to use the processed version
        if (chatAttachedImages.length > 0 && latestImageUrl) {
          log("Updating chat thumbnails to use processed images");
          chatAttachedImages.forEach((attachment, index) => {
            if (attachment.url === latestImageUrl && latestProcessedImageUrl) {
              // Update the attachment URL
              chatAttachedImages[index].url = latestProcessedImageUrl;

              // Update the image src in the DOM if it exists
              const thumbnailImg = document.querySelector(
                `.chat-attachment-item[data-id="${attachment.id}"] .chat-image-thumbnail`
              ) as HTMLImageElement | null;

              if (thumbnailImg) {
                thumbnailImg.src = latestProcessedImageUrl;
              }
            }
          });
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

    case "updateHistory":
      log("Received history update:", message.captures);
      captures = message.captures || [];
      displayHistory(captures);
      // If the currently viewed capture in the analysis tab was deleted, clear the view
      const currentCaptureId =
        document.getElementById("image-preview")?.dataset.captureId;
      if (currentCaptureId && !captures.some((c) => c.id === currentCaptureId)) {
        resetAnalysisUI();
      }
      break;

    case "clearHistoryComplete":
      log("History clear confirmed by background");
      captures = []; // Update local state
      displayHistory(captures); // Refresh UI to show empty state
      // Optionally show a confirmation message to the user
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
          if (isChatTab && latestImageUrl && chatAttachedImages.length === 0) {
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
  // Reset processed URL since this is a new capture
  latestProcessedImageUrl = null;

  // Check if we're on the chat tab (tab-4)
  const chatTab = document.getElementById("tab-4");
  const isChatTabActive = chatTab?.classList.contains("active");

  if (isChatTabActive) {
    // If we're on the chat tab, send image for processing first
    // The background script will handle processing and return the processed image URL
    log("Sending image for server processing before attaching to chat");
    await chrome.runtime.sendMessage({
      action: "processImage",
      imageData: dataUrl,
      source: "sidePanel",
    });

    // Note: We won't immediately attach anything.
    // Instead, we'll wait for the "processedImageReady" message
    // and then attach the processed image

    // Show a temporary loading indicator in the chat
    showProcessingImageIndicator();
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

// Add a function to display a temporary indicator while image is being processed
function showProcessingImageIndicator(): void {
  log("Showing image processing indicator");

  if (!chatImagePreview) return;

  // Create a loading indicator
  const processingContainer = document.createElement("div");
  processingContainer.id = "image-processing-indicator";
  processingContainer.className = "chat-processing-indicator";
  processingContainer.innerHTML = `
    <div class="processing-spinner"></div>
    <div class="processing-text">Processing image...</div>
  `;

  // Add some basic inline styles
  processingContainer.style.display = "flex";
  processingContainer.style.flexDirection = "column";
  processingContainer.style.alignItems = "center";
  processingContainer.style.padding = "16px";
  processingContainer.style.color = "var(--text-secondary)";

  // Make the preview visible if it's not already
  chatImagePreview.style.display = "flex";

  // Clear any existing content and add the processing indicator
  const attachmentsContainer = chatImagePreview.querySelector(
    ".chat-attachments-container"
  );
  if (attachmentsContainer) {
    attachmentsContainer.innerHTML = "";
    attachmentsContainer.appendChild(processingContainer);
  } else {
    const newContainer = document.createElement("div");
    newContainer.className = "chat-attachments-container";
    newContainer.appendChild(processingContainer);
    chatImagePreview.appendChild(newContainer);
  }
}

// Add a function to remove the processing indicator
function removeProcessingImageIndicator(): void {
  const indicator = document.getElementById("image-processing-indicator");
  if (indicator) {
    indicator.remove();
  }
}

// Function to attach image to chat
function attachImageToChat(imageUrl: string): void {
  log("Attaching image to chat");

  // Create a unique ID for this attachment
  const attachmentId = Date.now().toString();

  // Add to the array of attachments
  chatAttachedImages.push({ id: attachmentId, url: imageUrl });

  if (chatImagePreview) {
    // Get or create the attachments container
    let attachmentsContainer = chatImagePreview.querySelector(
      ".chat-attachments-container"
    );
    if (!attachmentsContainer) {
      attachmentsContainer = document.createElement("div");
      attachmentsContainer.className = "chat-attachments-container";
      chatImagePreview.appendChild(attachmentsContainer);
    }

    // Create and add the new attachment item
    const attachmentItem = createAttachmentItem(attachmentId, imageUrl);
    attachmentsContainer.appendChild(attachmentItem);

    // Make the preview visible if it's not already
    chatImagePreview.style.display = "flex";

    // Log the appropriate message based on URL type
    if (imageUrl.startsWith("data:")) {
      log(`Added data URL attachment (id: ${attachmentId.substring(0, 8)}...)`);
    } else {
      log(
        `Added attachment: ${imageUrl.substring(0, 30)}... (id: ${attachmentId.substring(
          0,
          8
        )}...)`
      );
    }
  }
}

// Helper function to create an attachment item
function createAttachmentItem(id: string, url: string): HTMLElement {
  const attachmentItem = document.createElement("div");
  attachmentItem.className = "chat-attachment-item";
  attachmentItem.dataset.id = id;

  const img = document.createElement("img");
  img.className = "chat-image-thumbnail";
  img.src = url;
  img.alt = "Image attachment";

  const removeButton = document.createElement("button");
  removeButton.className = "chat-attachment-remove";
  removeButton.title = "Remove attachment";
  removeButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;

  // Add event listener to remove button
  removeButton.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent event bubbling
    removeAttachment(id);
  });

  attachmentItem.appendChild(img);
  attachmentItem.appendChild(removeButton);

  return attachmentItem;
}

// Function to remove an attachment by ID
function removeAttachment(attachmentId: string): void {
  log(`Removing attachment: ${attachmentId}`);

  // Remove from the array
  chatAttachedImages = chatAttachedImages.filter((item) => item.id !== attachmentId);

  // Remove from the DOM
  if (chatImagePreview) {
    const attachmentToRemove = chatImagePreview.querySelector(
      `.chat-attachment-item[data-id="${attachmentId}"]`
    );
    if (attachmentToRemove) {
      attachmentToRemove.remove();

      // If no attachments left, hide the preview
      const remainingAttachments = chatImagePreview.querySelectorAll(
        ".chat-attachment-item"
      );
      if (remainingAttachments.length === 0) {
        chatImagePreview.style.display = "none";
      }
    }
  }
}

// Function to clear all attachments
function clearAllAttachments(): void {
  log("Clearing all chat attachments");

  // Clear the array
  chatAttachedImages = [];

  // Clear the DOM
  if (chatImagePreview) {
    const container = chatImagePreview.querySelector(".chat-attachments-container");
    if (container) {
      container.innerHTML = "";
    }
    chatImagePreview.style.display = "none";
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

/**
 * Returns the full text for a predefined prompt ID.
 */
function getPromptTextById(promptId: string): string {
  // Use the PREDEFINED_PROMPTS array defined earlier
  const prompt = PREDEFINED_PROMPTS.find((p) => p.id === promptId);
  return prompt ? prompt.text : getPromptTextById("describe"); // Fallback to describe text
}

function setupChat(): void {
  log("Setting up chat functionality");

  // Get UI elements
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const chatSubmit = document.getElementById("chat-submit") as HTMLButtonElement | null;
  const chatImagePreview = document.querySelector(
    ".chat-image-preview"
  ) as HTMLDivElement | null;

  // Chat actions elements
  const chatActionsToggle = document.getElementById(
    "chat-actions-toggle"
  ) as HTMLButtonElement | null;
  const chatActionsMenu = document.getElementById(
    "chat-actions-menu"
  ) as HTMLDivElement | null;
  const chatActionButtons = document.querySelectorAll(".chat-action-button");

  // Chat history elements
  const newChatButton = document.getElementById(
    "new-chat-button"
  ) as HTMLButtonElement | null;
  const chatHistoryToggle = document.getElementById(
    "chat-history-toggle"
  ) as HTMLButtonElement | null;
  const chatHistoryPanel = document.getElementById(
    "chat-history-panel"
  ) as HTMLDivElement | null;
  const closeChatHistoryButton = document.getElementById(
    "close-chat-history"
  ) as HTMLButtonElement | null;

  if (
    !chatMessages ||
    !chatInput ||
    !chatSubmit ||
    !chatActionsToggle ||
    !chatActionsMenu ||
    !newChatButton ||
    !chatHistoryToggle ||
    !chatHistoryPanel ||
    !closeChatHistoryButton
  ) {
    logError("Required chat UI elements not found");
    return;
  }

  // Load chat history
  loadChatConversations().then((conversations) => {
    chatConversations = conversations;
    displayChatHistory(chatConversations);

    // Create a new chat if there's no current chat
    if (!currentChatId) {
      createNewChat();
    }
  });

  // Setup New Chat button
  newChatButton.addEventListener("click", () => {
    log("New chat button clicked");
    createNewChat();
  });

  // Setup Chat History toggle
  chatHistoryToggle.addEventListener("click", () => {
    log("Chat history toggle clicked");
    chatHistoryPanel.classList.toggle("visible");
  });

  // Setup Close Chat History button
  closeChatHistoryButton.addEventListener("click", () => {
    log("Close chat history button clicked");
    chatHistoryPanel.classList.remove("visible");
  });

  // Setup chat actions toggle functionality
  chatActionsToggle.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent event from bubbling up
    chatActionsMenu.classList.toggle("visible");
  });

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (chatActionsMenu.classList.contains("visible")) {
      chatActionsMenu.classList.remove("visible");
    }
  });

  // Prevent menu from closing when clicking inside it
  chatActionsMenu.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Setup action button handlers
  chatActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-action");
      handleChatAction(action);
      chatActionsMenu.classList.remove("visible");
    });
  });

  // Submit on Enter key (without Shift)
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChatMessage();
    }
  });

  // Submit on button click
  chatSubmit.addEventListener("click", submitChatMessage);

  // Setup chat model selector (if not already set up by fetchAvailableModels)
  if (chatModelSelector && !chatModelSelector.hasEventListener) {
    chatModelSelector.addEventListener("change", () => {
      selectedModel = chatModelSelector.value;
      log("Selected model changed to:", selectedModel);
    });
    chatModelSelector.hasEventListener = true;
  }

  log("Chat setup completed");
}

/**
 * Creates a new chat conversation and resets the UI
 */
function createNewChat(): void {
  log("Creating new chat");

  // Save current chat if it has messages
  if (currentChatId && chatHistory.length > 0) {
    saveChatConversation();
  }

  // Generate new chat ID
  currentChatId = Date.now().toString();

  // Clear current chat history
  chatHistory.length = 0;

  // Clear chat UI
  if (chatMessages) {
    chatMessages.innerHTML = "";

    // Add initial greeting
    const welcomeMessage = document.createElement("div");
    welcomeMessage.className = "chat-message assistant";
    const welcomeContent = document.createElement("div");
    welcomeContent.className = "message-content";
    welcomeContent.textContent =
      "Hello! I'm your Vision CMS assistant. How can I help you today?";
    welcomeMessage.appendChild(welcomeContent);
    chatMessages.appendChild(welcomeMessage);

    // Add initial message to history
    chatHistory.push({
      role: "assistant",
      content: "Hello! I'm your Vision CMS assistant. How can I help you today?",
    });
  }

  // Clear any input and attachments
  if (chatInput) {
    chatInput.value = "";
  }
  clearAllAttachments();
}

/**
 * Saves the current chat conversation to storage
 */
async function saveChatConversation(): Promise<void> {
  if (!currentChatId || chatHistory.length <= 1) {
    // Don't save if there's no chat ID or only the welcome message
    return;
  }

  log("Saving chat conversation:", currentChatId);

  // Find a title from the first user message
  const firstUserMessage = chatHistory.find((msg) => msg.role === "user");
  const title = firstUserMessage
    ? firstUserMessage.content.substring(0, 50) +
      (firstUserMessage.content.length > 50 ? "..." : "")
    : "New conversation";

  const conversation: ChatConversation = {
    id: currentChatId,
    timestamp: Date.now(),
    title,
    messages: [...chatHistory], // Create a copy of the messages
  };

  // Add to in-memory storage
  const existingIndex = chatConversations.findIndex((chat) => chat.id === currentChatId);
  if (existingIndex !== -1) {
    // Update existing conversation
    chatConversations[existingIndex] = conversation;
  } else {
    // Add new conversation at the beginning
    chatConversations.unshift(conversation);

    // Limit number of conversations
    if (chatConversations.length > MAX_CHAT_HISTORY_ITEMS) {
      chatConversations = chatConversations.slice(0, MAX_CHAT_HISTORY_ITEMS);
    }
  }

  // Save to chrome storage
  try {
    await chrome.storage.local.set({ chatConversations });
    log("Chat conversations saved to storage");

    // Update the chat history UI
    displayChatHistory(chatConversations);
  } catch (error) {
    logError("Error saving chat conversations to storage:", error);
  }
}

/**
 * Loads chat conversations from storage
 */
async function loadChatConversations(): Promise<ChatConversation[]> {
  log("Loading chat conversations from storage");
  try {
    const result = await chrome.storage.local.get("chatConversations");
    if (result.chatConversations) {
      log(`Loaded ${result.chatConversations.length} chat conversations`);
      return result.chatConversations;
    }
  } catch (error) {
    logError("Error loading chat conversations from storage:", error);
  }
  return [];
}

/**
 * Displays the chat history in the UI
 */
function displayChatHistory(conversations: ChatConversation[]): void {
  const chatHistoryList = document.getElementById("chat-history-list");
  if (!chatHistoryList) return;

  // Clear existing items
  chatHistoryList.innerHTML = "";

  if (conversations.length === 0) {
    // Show empty state
    const emptyState = document.createElement("li");
    emptyState.className = "chat-history-item empty-state";
    emptyState.textContent = "No chat history yet";
    chatHistoryList.appendChild(emptyState);
    return;
  }

  // Add each conversation to the list
  conversations.forEach((conversation) => {
    const listItem = document.createElement("li");
    listItem.className = "chat-history-item";
    listItem.dataset.chatId = conversation.id;

    const title = document.createElement("div");
    title.className = "chat-history-item-title";
    title.textContent = conversation.title;

    const time = document.createElement("div");
    time.className = "chat-history-item-time";
    time.textContent = formatChatTime(conversation.timestamp);

    listItem.appendChild(title);
    listItem.appendChild(time);

    // Add click event to load this conversation
    listItem.addEventListener("click", () => {
      log("Loading chat conversation:", conversation.id);
      loadChatConversation(conversation);
    });

    chatHistoryList.appendChild(listItem);
  });
}

/**
 * Loads a chat conversation from history
 */
function loadChatConversation(conversation: ChatConversation): void {
  // Save current chat first if needed
  if (currentChatId && chatHistory.length > 0) {
    saveChatConversation();
  }

  // Set current chat ID
  currentChatId = conversation.id;

  // Update chat history array
  chatHistory.length = 0;
  chatHistory.push(...conversation.messages);

  // Update UI
  if (chatMessages) {
    chatMessages.innerHTML = "";

    // Add all messages
    conversation.messages.forEach((message) => {
      addMessageToChat(message.role, message.content, message.imageUrl || null);
    });
  }

  // Close the history panel
  const chatHistoryPanel = document.getElementById("chat-history-panel");
  if (chatHistoryPanel) {
    chatHistoryPanel.classList.remove("visible");
  }

  // Clear any current attachments
  clearAllAttachments();
}

/**
 * Format a timestamp for display in chat history
 */
function formatChatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return `Today, ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } else {
    return (
      date.toLocaleDateString([], { month: "short", day: "numeric" }) +
      `, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    );
  }
}

/**
 * Adds a message to the chat display
 */
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

  // Add message to history
  chatHistory.push({ role, content, imageUrl });

  // Save chat after a new message is added
  if (currentChatId) {
    saveChatConversation();
  }
}

/**
 * Submit a chat message to the assistant
 */
async function submitChatMessage(): Promise<void> {
  if (!chatInput || !chatMessages || !chatSubmit || isChatLoading) return;

  const message = chatInput.value.trim();
  const hasImage = chatAttachedImages.length > 0;

  if (!message && !hasImage) return; // Don't send empty messages without an image

  log("Submitting chat message:", message, "with images:", chatAttachedImages.length);

  // Create a single message with all images if there are multiple
  if (hasImage) {
    const messageEl = document.createElement("div");
    messageEl.className = "chat-message user";

    const contentEl = document.createElement("div");
    contentEl.className = "message-content";

    // Add all images to the message
    chatAttachedImages.forEach(({ id, url }) => {
      const imgEl = document.createElement("img");
      imgEl.src = url;
      imgEl.className = "chat-message-image";
      imgEl.alt = "Attached image";
      contentEl.appendChild(imgEl);
    });

    // Add text content if present
    if (message) {
      const breakEl = document.createElement("br");
      contentEl.appendChild(breakEl);
      const textNode = document.createTextNode(message);
      contentEl.appendChild(textNode);
    }

    messageEl.appendChild(contentEl);
    chatMessages?.appendChild(messageEl);

    // Scroll to bottom
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  } else {
    // Just text message with no images
    addMessageToChat("user", message);
  }

  // Clear input
  chatInput.value = "";

  // Show thinking indicator
  showThinkingIndicator();

  // Collect all image URLs to send
  const imageUrlsToSend = chatAttachedImages.map((item) => item.url).join(",");

  // Send message to server with images (if any)
  sendChatMessage(message, hasImage ? imageUrlsToSend : null);

  // Clear all attachments
  clearAllAttachments();

  // Create a new chat if one doesn't exist
  if (!currentChatId) {
    currentChatId = Date.now().toString();
  }
}

function showThinkingIndicator(): void {
  if (!chatMessages) return;

  // Remove any existing thinking indicator first
  hideThinkingIndicator();

  isChatLoading = true;

  // Create a standard assistant message with loading class
  const messageElement = document.createElement("div");
  messageElement.className = "chat-message assistant loading";
  messageElement.id = "chat-thinking"; // Keep the same ID for compatibility

  const contentElement = document.createElement("div");
  contentElement.className = "message-content";

  // Add typing indicator with dots
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "typing-indicator";

  // Add three animated dots
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "typing-dot";
    typingIndicator.appendChild(dot);
  }

  contentElement.appendChild(typingIndicator);
  messageElement.appendChild(contentElement);
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (chatSubmit) {
    chatSubmit.disabled = true;
  }
}

function hideThinkingIndicator(): void {
  const thinkingElement = document.getElementById("chat-thinking");
  if (thinkingElement) {
    thinkingElement.remove();
  }

  isChatLoading = false;

  if (chatSubmit) {
    chatSubmit.disabled = false;
  }
}

async function sendChatMessage(
  message: string,
  imageUrls: string | null = null
): Promise<void> {
  try {
    // If we have multiple image URLs (comma-separated), handle each one
    let processedImageUrls = imageUrls;

    if (imageUrls && imageUrls.includes(",")) {
      // Split by comma and process each URL
      const urls = imageUrls.split(",");
      const processedUrls = await Promise.all(
        urls.map(async (url) => {
          // Process blob URLs if needed
          if (url.startsWith("blob:")) {
            try {
              return await convertBlobToDataUrl(url);
            } catch (error) {
              logError(
                `Failed to convert blob URL to data URL: ${url.substring(0, 30)}...`,
                error
              );
              return null; // Skip this URL if conversion fails
            }
          }
          return url;
        })
      );

      // Filter out any nulls from failed conversions
      const validUrls = processedUrls.filter((url) => url !== null);
      processedImageUrls = validUrls.join(",");
    }
    // Handle single blob URL
    else if (imageUrls && imageUrls.startsWith("blob:")) {
      try {
        processedImageUrls = await convertBlobToDataUrl(imageUrls);
      } catch (error) {
        logError("Error converting blob URL to data URL:", error);
        processedImageUrls = null;
      }
    }

    // Resize any data URL images to prevent Multer errors
    if (processedImageUrls) {
      if (processedImageUrls.includes(",")) {
        // Multiple images
        const urls = processedImageUrls.split(",");
        const resizedUrls = await Promise.all(
          urls.map(async (url) => {
            if (url.startsWith("data:image")) {
              return await resizeImage(url, 1200); // Max width 1200px
            }
            return url;
          })
        );
        processedImageUrls = resizedUrls.join(",");
      } else if (processedImageUrls.startsWith("data:image")) {
        // Single image
        processedImageUrls = await resizeImage(processedImageUrls, 1200); // Max width 1200px
      }
    }

    log(
      "Sending chat message to background script" +
        (processedImageUrls ? " with images" : "") +
        (selectedModel ? ` using model: ${selectedModel}` : "")
    );

    // Get active tab URL
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTabUrl = tabs.length > 0 ? tabs[0].url : null;

    // Create the message object based on available parameters
    const messagePayload: any = {
      action: "sendChatMessage",
      message,
      source: "sidePanel",
      conversationHistory: chatHistory,
      currentTabUrl,
    };

    // Only add imageUrl if it's not null
    if (processedImageUrls) {
      messagePayload.imageUrl = processedImageUrls;
    }

    // Only add model if it's not null and not an empty string
    if (selectedModel && selectedModel.trim() !== "") {
      messagePayload.model = selectedModel;
    }

    const response = await chrome.runtime.sendMessage(messagePayload);

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

// Helper function to convert blob URL to data URL
async function convertBlobToDataUrl(blobUrl: string): Promise<string> {
  log("Converting blob URL to data URL");
  // Fetch the image data and convert to data URL
  const response = await fetch(blobUrl);
  const blob = await response.blob();

  // Use FileReader to convert blob to data URL
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert blob to data URL"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Helper function to resize an image and return a new data URL with reduced size
async function resizeImage(dataUrl: string, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      // Create a canvas and resize the image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Get the resized image as a data URL with reduced quality
      // Using image/jpeg with 0.9 quality for better compression
      const type = dataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      const quality = type === "image/jpeg" ? 0.9 : undefined;

      try {
        const resizedDataUrl = canvas.toDataURL(type, quality);
        log(
          `Resized image from ${Math.round(dataUrl.length / 1024)}KB to ${Math.round(
            resizedDataUrl.length / 1024
          )}KB`
        );
        resolve(resizedDataUrl);
      } catch (err) {
        logError("Error generating resized data URL:", err);
        resolve(dataUrl); // Fall back to original if resize fails
      }
    };

    img.onerror = () => {
      logError("Error loading image for resizing");
      resolve(dataUrl); // Fall back to original if loading fails
    };

    img.src = dataUrl;
  });
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

/**
 * Resets the UI elements in the Analysis tab to their initial state.
 */
const resetAnalysisUI = () => {
  log("Resetting analysis UI");
  if (imagePreview) {
    imagePreview.style.display = "none";
    imagePreview.innerHTML = ""; // Clear previous content like spinners or images
    delete imagePreview.dataset.captureId; // Remove associated capture ID
    // Re-add spinner
    const spinner = document.createElement("div");
    spinner.id = "loading-spinner";
    spinner.classList.add("loading-spinner");
    imagePreview.appendChild(spinner);
  }
  if (analysisResults) {
    analysisResults.style.display = "none";
    analysisResults.innerHTML = "";
  }
  if (promptSection) {
    promptSection.style.display = "none"; // Hide prompts until new image is loaded
  }
  if (customPromptTextarea) {
    customPromptTextarea.value = ""; // Clear custom prompt
  }
  hideChatLoader(); // Ensure chat loader is hidden
};

// Delete All History button click
deleteAllHistoryButton?.addEventListener("click", () => {
  log("Delete All History button clicked");
  if (
    window.confirm(
      "Are you sure you want to delete all capture history? This action cannot be undone."
    )
  ) {
    log("User confirmed history deletion");
    chrome.runtime.sendMessage({ action: "clearHistory" }, (response) => {
      if (chrome.runtime.lastError) {
        logError("Error sending clearHistory message:", chrome.runtime.lastError);
        alert("Failed to clear history. Please try again.");
      } else {
        log("clearHistory message sent successfully, response:", response);
        // UI update happens when 'clearHistoryComplete' message is received
      }
    });
  } else {
    log("User cancelled history deletion");
  }
});

/**
 * Shows the chat loading indicator.
 */
const showChatLoader = () => {
  if (chatLoader) {
    chatLoader.style.display = "flex";
  }
  isChatLoading = true;
};

/**
 * Hides the chat loading indicator.
 */
const hideChatLoader = () => {
  if (chatLoader) {
    chatLoader.style.display = "none";
  }
  isChatLoading = false;
};

// Function to fetch available models from the server
async function fetchAvailableModels(): Promise<void> {
  try {
    log("Fetching available models from server");

    const response = await fetch("http://localhost:3000/models");
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const responseData = await response.json();

    if (!responseData.success) {
      throw new Error("Failed to fetch models: Server returned unsuccessful response");
    }

    // Convert models object to array with ID included
    const modelsArray = Object.entries(responseData.models).map(([id, modelData]) => ({
      id,
      ...(modelData as {
        name: string;
        provider: string;
        supportsVision: boolean;
      }),
    }));

    availableModels = modelsArray;
    log("Fetched models:", modelsArray);

    // Populate the model selector dropdown
    populateModelSelector(modelsArray);

    // Set the default model if specified
    if (responseData.defaultModel && chatModelSelector) {
      selectedModel = responseData.defaultModel;
      chatModelSelector.value = responseData.defaultModel;
    }
  } catch (error) {
    logError("Error fetching models:", error);
  }
}

// Function to populate the model selector dropdown
function populateModelSelector(models: any[]): void {
  if (!chatModelSelector) {
    logError("Chat model selector element not found");
    return;
  }

  // Show the model selector container
  const modelSelectorContainer = document.querySelector(".model-selector-container");
  if (modelSelectorContainer) {
    modelSelectorContainer.classList.add("visible");
  }

  // Get the model selector menu
  const modelSelectorMenu = document.getElementById("model-selector-menu");
  const modelSelectorToggle = document.getElementById("model-selector-toggle");
  const selectedModelDisplay = document.getElementById("selected-model-display");

  if (!modelSelectorMenu || !modelSelectorToggle || !selectedModelDisplay) {
    logError("Model selector elements not found");
    return;
  }

  // Add click event listener for the toggle button
  modelSelectorToggle.addEventListener("click", (e) => {
    e.stopPropagation();

    // Position the menu intelligently before showing it
    positionModelSelectorMenu(modelSelectorMenu, modelSelectorToggle);

    modelSelectorMenu.classList.toggle("visible");

    // Add a click event listener to the document to close the menu when clicking outside
    const closeMenu = (event: MouseEvent) => {
      if (
        !modelSelectorMenu.contains(event.target as Node) &&
        event.target !== modelSelectorToggle
      ) {
        modelSelectorMenu.classList.remove("visible");
        document.removeEventListener("click", closeMenu);
      }
    };

    // Only add the event listener if the menu is now visible
    if (modelSelectorMenu.classList.contains("visible")) {
      // Use setTimeout to avoid immediate triggering of the event
      setTimeout(() => {
        document.addEventListener("click", closeMenu);
      }, 0);
    }
  });

  // Add function to position the model selector menu to avoid edge collisions
  function positionModelSelectorMenu(menu: HTMLElement, toggle: HTMLElement): void {
    // Reset any previous custom positioning to get accurate measurements
    menu.style.right = "";
    menu.style.left = "";
    menu.style.bottom = "";
    menu.style.top = "";

    // Get dimensions and positions
    const toggleRect = toggle.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 200; // Fallback to estimated width if not yet rendered
    const menuHeight = menu.offsetHeight || 300; // Fallback to estimated height
    const sidebarWidth = document.body.clientWidth;
    const sidebarHeight = document.body.clientHeight;

    // Check for vertical positioning (above or below)
    const spaceAbove = toggleRect.top;
    const spaceBelow = sidebarHeight - toggleRect.bottom;

    // Default to above if there's enough space, otherwise below
    if (spaceAbove >= menuHeight || spaceAbove >= spaceBelow) {
      menu.style.bottom = `${toggleRect.height + 8}px`; // 8px margin
      menu.style.top = "auto";
    } else {
      menu.style.top = `${toggleRect.height + 8}px`; // 8px margin
      menu.style.bottom = "auto";
    }

    // Check for horizontal positioning (left or right aligned)
    const spaceToRight = sidebarWidth - toggleRect.left;
    const spaceToLeft = toggleRect.right;

    // Default to right-aligned if there's enough space, otherwise left-aligned
    if (menuWidth <= spaceToRight) {
      // Align left edge of menu with left edge of toggle
      menu.style.left = "0";
      menu.style.right = "auto";
    } else if (menuWidth <= spaceToLeft) {
      // Align right edge of menu with right edge of toggle
      menu.style.right = "0";
      menu.style.left = "auto";
    } else {
      // Not enough space on either side, center it as best as possible
      // and let overflow handling deal with scrolling
      menu.style.left = "0";
      menu.style.right = "auto";

      // If this would push it off the left edge, adjust
      if (toggleRect.left - (menuWidth - toggleRect.width) / 2 < 0) {
        menu.style.left = "0";
      }
    }

    // Add some logging
    log(
      `Positioned model menu: ${JSON.stringify({
        toggleRect: {
          top: Math.round(toggleRect.top),
          left: Math.round(toggleRect.left),
          width: Math.round(toggleRect.width),
          height: Math.round(toggleRect.height),
        },
        menuWidth: Math.round(menuWidth),
        menuHeight: Math.round(menuHeight),
        sidebarWidth: Math.round(sidebarWidth),
        sidebarHeight: Math.round(sidebarHeight),
        position: {
          top: menu.style.top,
          left: menu.style.left,
          bottom: menu.style.bottom,
          right: menu.style.right,
        },
      })}`
    );
  }

  // Clear existing options in both select and custom menu
  chatModelSelector.innerHTML = "";
  modelSelectorMenu.innerHTML = "";

  // Group models by provider
  const modelsByProvider: Record<string, any[]> = {};
  models.forEach((model) => {
    if (!modelsByProvider[model.provider]) {
      modelsByProvider[model.provider] = [];
    }
    modelsByProvider[model.provider].push(model);
  });

  // Create option groups for each provider
  Object.entries(modelsByProvider).forEach(([provider, providerModels]) => {
    // For the hidden select element
    const optgroup = document.createElement("optgroup");
    optgroup.label = provider.charAt(0).toUpperCase() + provider.slice(1);

    // For the custom flyout - add a provider label
    const providerLabel = document.createElement("div");
    providerLabel.className = "model-group-label";
    providerLabel.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);
    modelSelectorMenu.appendChild(providerLabel);

    // Add options for each model
    providerModels.forEach((model) => {
      // For the hidden select element
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name;
      optgroup.appendChild(option);

      // For the custom flyout - create a button
      const modelButton = document.createElement("button");
      modelButton.className = "model-option";
      modelButton.dataset.modelId = model.id;
      modelButton.textContent = model.name;

      // Add check icon for the currently selected model
      if (model.id === selectedModel) {
        modelButton.classList.add("selected");

        // Add a check mark icon
        const checkIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        checkIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        checkIcon.setAttribute("width", "16");
        checkIcon.setAttribute("height", "16");
        checkIcon.setAttribute("viewBox", "0 0 24 24");
        checkIcon.setAttribute("fill", "none");
        checkIcon.setAttribute("stroke", "currentColor");
        checkIcon.setAttribute("stroke-width", "2");
        checkIcon.setAttribute("stroke-linecap", "round");
        checkIcon.setAttribute("stroke-linejoin", "round");

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M20 6L9 17l-5-5");
        checkIcon.appendChild(path);

        modelButton.prepend(checkIcon);

        // Update the model toggle button text
        selectedModelDisplay.textContent = model.name;
      }

      // Add click event for model selection
      modelButton.addEventListener("click", () => {
        // Update the selected model
        selectedModel = model.id;

        // Update the hidden select element
        chatModelSelector.value = selectedModel;

        // Trigger change event on the select
        chatModelSelector.dispatchEvent(new Event("change"));

        // Update the UI
        const allModelButtons = modelSelectorMenu.querySelectorAll(".model-option");
        allModelButtons.forEach((btn) => {
          btn.classList.remove("selected");

          // Remove any existing check icons
          const existingIcons = btn.querySelectorAll("svg");
          existingIcons.forEach((icon) => icon.remove());
        });

        // Mark this button as selected and add the check icon
        modelButton.classList.add("selected");

        // Add a check mark icon
        const checkIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        checkIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        checkIcon.setAttribute("width", "16");
        checkIcon.setAttribute("height", "16");
        checkIcon.setAttribute("viewBox", "0 0 24 24");
        checkIcon.setAttribute("fill", "none");
        checkIcon.setAttribute("stroke", "currentColor");
        checkIcon.setAttribute("stroke-width", "2");
        checkIcon.setAttribute("stroke-linecap", "round");
        checkIcon.setAttribute("stroke-linejoin", "round");

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M20 6L9 17l-5-5");
        checkIcon.appendChild(path);

        modelButton.prepend(checkIcon);

        // Update the model toggle button text with the selected model name
        selectedModelDisplay.textContent = model.name;

        // Close the menu
        modelSelectorMenu.classList.remove("visible");

        log("Selected model changed to:", selectedModel);
      });

      modelSelectorMenu.appendChild(modelButton);
    });

    chatModelSelector.appendChild(optgroup);
  });

  // Set the first model as selected by default
  if (models.length > 0 && !selectedModel) {
    selectedModel = models[0].id;
    chatModelSelector.value = selectedModel;

    // Find the model name for the selected ID
    const selectedModelData = models.find((model) => model.id === selectedModel);
    if (selectedModelData) {
      selectedModelDisplay.textContent = selectedModelData.name;
    }
  }

  // Keep existing change event listener for the hidden select
  // but remove any existing listeners first to prevent duplicates
  if (!chatModelSelector.hasEventListener) {
    chatModelSelector.addEventListener("change", () => {
      selectedModel = chatModelSelector.value;

      // Update the model toggle button text when the selection changes
      const selectedModelData = models.find((model) => model.id === selectedModel);
      if (selectedModelData && selectedModelDisplay) {
        selectedModelDisplay.textContent = selectedModelData.name;
      }

      log("Selected model changed to:", selectedModel);
    });
    chatModelSelector.hasEventListener = true;
  }
}

// Function to handle chat action button clicks
function handleChatAction(action: string | null): void {
  if (!action) return;

  log(`Chat action triggered: ${action}`);

  switch (action) {
    case "site-analysis":
      // Site analysis functionality
      log("Site Analysis action triggered");
      const siteAnalysisMessage = "Run site analysis on this page";

      // Add the message to chat UI
      addMessageToChat("user", siteAnalysisMessage);

      // Send the message to the assistant
      sendChatMessage(siteAnalysisMessage);
      break;

    case "visual-analysis":
    case "capture-snippet":
      // Visual Analysis (Capture Page) and Capture Snippet functionality
      const actionName =
        action === "visual-analysis" ? "Capture Page" : "Capture Snippet";
      log(`${actionName} action triggered`);

      // If it's a capture snippet, use the selection mode
      if (action === "capture-snippet") {
        // Use the existing selection mode toggle logic for "Capture Snippet"
        const wasActive = isSelectionModeActive;
        isSelectionModeActive = true; // Always activate (not toggle) when clicked

        // Update UI state
        const selectionToggle = document.getElementById(
          "selection-toggle"
        ) as HTMLButtonElement | null;

        if (selectionToggle) {
          updateSelectionToggleState(isSelectionModeActive, selectionToggle);
        }

        // Send message to background script to enter selection mode
        chrome.runtime
          .sendMessage({
            action: "toggleSelectionMode",
            active: true, // Always true when initiating from action buttons
            source: "sidePanel",
          })
          .then((response) => {
            log(`Background response for toggleSelectionMode:`, response);
            if (response && response.status === "error") {
              logError(`Error toggling selection mode:`, response.message);
              // Revert state on error
              isSelectionModeActive = wasActive;
              if (selectionToggle) updateSelectionToggleState(wasActive, selectionToggle);
            }
          })
          .catch((error) => {
            logError(`Failed to send toggleSelectionMode message:`, error);
            // Revert state on error
            isSelectionModeActive = wasActive;
            if (selectionToggle) updateSelectionToggleState(wasActive, selectionToggle);
          });
      } else {
        // For "Capture Page", directly take a full page screenshot
        log("Capturing full page screenshot");
        showChatLoader(); // Show loading indicator

        // Send message to background script to capture full page
        chrome.runtime
          .sendMessage({
            action: "captureFullPage",
            source: "sidePanel",
          })
          .then(async (response) => {
            log(`Background response for captureFullPage:`, response);

            if (response && response.status === "ok" && response.dataUrl) {
              // Successfully captured screenshot
              hideChatLoader();

              // Attach the screenshot to the chat
              attachImageToChat(response.dataUrl);

              log("Full page screenshot captured and attached to chat");
            } else if (response && response.status === "error") {
              hideChatLoader();
              logError(`Error capturing full page:`, response.message);
              // Show error notification to user
              const errorMsg = response.message || "Failed to capture screenshot";
              alert(`Error: ${errorMsg}`);
            }
          })
          .catch((error) => {
            hideChatLoader();
            logError(`Failed to send captureFullPage message:`, error);
            alert("Error: Failed to capture screenshot");
          });
      }

      // Close the actions menu
      const chatActionsMenu = document.getElementById("chat-actions-menu");
      if (chatActionsMenu) {
        chatActionsMenu.classList.remove("visible");
      }
      break;

    case "add-media":
      // Add media functionality
      log("Add Media action triggered");

      // Create a hidden file input element
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      // Trigger a click on the file input
      fileInput.click();

      // Handle file selection
      fileInput.addEventListener("change", (event) => {
        const files = fileInput.files;
        if (files && files.length > 0) {
          const file = files[0];

          // Check if it's an image
          if (file.type.startsWith("image/")) {
            log("Converting file to data URL");

            // Create a FileReader to convert to data URL instead of blob URL
            const reader = new FileReader();
            reader.onload = (e) => {
              if (e.target && typeof e.target.result === "string") {
                const dataUrl = e.target.result;

                // Attach the image data URL to chat
                attachImageToChat(dataUrl);

                log("Image converted to data URL and attached to chat");
              } else {
                logError("Failed to read file as data URL");
              }
            };

            reader.onerror = () => {
              logError("Error reading file:", reader.error);
            };

            // Read the file as a data URL (base64)
            reader.readAsDataURL(file);
          } else {
            logError("Selected file is not an image");
          }
        }

        // Remove the file input from the DOM
        document.body.removeChild(fileInput);
      });
      break;

    default:
      logError(`Unknown chat action: ${action}`);
  }
}

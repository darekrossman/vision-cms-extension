// Import logger utility first to ensure it's available immediately
import { createSidePanelLogger } from "./utils";

/**
 * Vision CMS Side Panel Script
 * Handles UI interactions and communication with the background service worker
 */

// Set up logging immediately
const { log, error: logError } = createSidePanelLogger();

// Log that the script is starting
log("Sidepanel script starting");

// We'll import marked lazily when needed
let markedModule: any = null;

// Configuration and state
let isSelectionModeActive = false;
let currentTab: chrome.tabs.Tab | null = null;
let selectedPromptId: string | null = null;

// Track if capture is in progress
let captureInProgress = false;
let analysisInProgress = false;

// Store the latest image URL
let latestImageUrl: string | null = null;

// DOM elements
const startButton: HTMLButtonElement | null = null;
const processButton: HTMLButtonElement | null = null;
const imageContainer: HTMLDivElement | null = null;
const loadingIndicator: HTMLDivElement | null = null;

// Initialize when the document is loaded
document.addEventListener("DOMContentLoaded", () => {
  log("DOMContentLoaded fired - Initializing side panel UI");

  try {
    // Import marked library after DOM is ready
    import("marked")
      .then((module) => {
        markedModule = module;
        try {
          markedModule.marked.setOptions({
            gfm: true,
            breaks: true,
          });
          log("Markdown parser imported and configured successfully");
        } catch (error: any) {
          logError("Error configuring markdown parser:", error);
          // Continue execution even if markdown parser fails
        }
      })
      .catch((error: any) => {
        logError("Failed to import markdown parser:", error);
        // Continue without markdown support
      });

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

    // Get reference to toggle button and prompt section
    const selectionToggle = document.getElementById(
      "selection-toggle"
    ) as HTMLButtonElement | null;
    log("Found selection-toggle element:", !!selectionToggle);

    const imagePreview = document.getElementById(
      "image-preview"
    ) as HTMLDivElement | null;
    log("Found image-preview element:", !!imagePreview);

    const promptSection = document.getElementById(
      "prompt-section"
    ) as HTMLDivElement | null;
    log("Found prompt-section element:", !!promptSection);

    // Validate UI elements
    if (!selectionToggle || !imagePreview || !promptSection) {
      logError("Required UI elements not found in DOM");
      return;
    }

    log("All required UI elements loaded successfully");

    // Set up toggle button event listener
    log("Adding click event listener to selection toggle button");
    selectionToggle.addEventListener("click", async (event) => {
      try {
        log("Selection toggle button clicked", event);

        // Get current state before toggling
        const wasActive = isSelectionModeActive;

        // Toggle selection mode state
        isSelectionModeActive = !wasActive;

        log(`Selection mode ${isSelectionModeActive ? "activated" : "deactivated"}`);

        try {
          // Update UI immediately to provide visual feedback
          updateSelectionToggleState(isSelectionModeActive, selectionToggle);
          log("Updated selection toggle UI state");

          if (isSelectionModeActive) {
            // Start selection mode
            log("Sending startSelection message to background script");
            const response = await chrome.runtime.sendMessage({
              action: "startSelection",
              source: "sidePanel",
            });

            log("Background service worker response for startSelection:", response);

            if (response && response.status === "error") {
              // If there's an error, revert the selection state
              isSelectionModeActive = false;
              updateSelectionToggleState(false, selectionToggle);
              logError("Error starting selection:", response.message);
            }
          } else {
            // Cancel selection mode
            log("Sending cancelSelection message to background script");
            const response = await chrome.runtime.sendMessage({
              action: "cancelSelection",
              source: "sidePanel",
            });

            log("Background service worker response for cancelSelection:", response);

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
      } catch (outerError) {
        logError("Unexpected error in selection toggle event handler:", outerError);
        // Try to reset the UI state
        try {
          isSelectionModeActive = false;
          updateSelectionToggleState(false, selectionToggle);
        } catch (resetError) {
          logError("Failed to reset UI after error:", resetError);
        }
      }
    });

    // Set up prompt button event listeners
    const promptButtons = document.querySelectorAll(".prompt-button");
    promptButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        if (!latestImageUrl || analysisInProgress) {
          return;
        }

        try {
          const promptId = (button as HTMLElement).dataset.promptId || "describe";
          selectedPromptId = promptId;

          // Hide prompt buttons and show the loader
          const promptButtons = document.querySelector(
            ".prompt-buttons"
          ) as HTMLDivElement | null;
          const chatLoader = document.getElementById(
            "chat-loader"
          ) as HTMLDivElement | null;

          if (promptButtons && chatLoader) {
            promptButtons.style.display = "none";
            chatLoader.style.display = "block";
          }

          analysisInProgress = true;

          // Send the image for analysis with the selected prompt
          const response = await chrome.runtime.sendMessage({
            action: "analyzeImage",
            imageUrl: latestImageUrl,
            customPrompt: getPromptTextById(promptId),
          });

          log("Background service worker response for analysis:", response);

          if (response && response.status === "error") {
            logError("Error analyzing image:", response.message);

            // Show error in the chat loader text
            if (chatLoader) {
              const loaderText = chatLoader.querySelector(".chat-loader-text");
              if (loaderText) {
                loaderText.textContent = "Analysis failed. Try again.";
              }
            }

            setTimeout(() => {
              // Reset and show prompt buttons again
              if (promptButtons && chatLoader) {
                promptButtons.style.display = "flex";
                chatLoader.style.display = "none";

                // Reset chat loader text
                const loaderText = chatLoader.querySelector(".chat-loader-text");
                if (loaderText) {
                  loaderText.textContent = "Analyzing content...";
                }
              }
              analysisInProgress = false;
            }, 3000);
          }
        } catch (error) {
          logError("Failed to analyze image", error);

          // Reset UI on error
          const promptButtons = document.querySelector(
            ".prompt-buttons"
          ) as HTMLDivElement | null;
          const chatLoader = document.getElementById(
            "chat-loader"
          ) as HTMLDivElement | null;

          if (promptButtons && chatLoader) {
            promptButtons.style.display = "flex";
            chatLoader.style.display = "none";

            // Reset chat loader text
            const loaderText = chatLoader.querySelector(".chat-loader-text");
            if (loaderText) {
              loaderText.textContent = "Analyzing content...";
            }
          }

          analysisInProgress = false;
        }
      });
    });

    // Reset UI to initial state
    resetUI();

    // Listen for messages from the background service worker
    setupMessageListener();

    // Let the background script know we're ready
    notifyBackgroundReady();

    // Listen for window resize to adjust UI
    window.addEventListener("resize", updateUILayout);
  } catch (error) {
    logError("Error initializing side panel:", error);
  }
});

// Reset UI to initial state
function resetUI(): void {
  log("Resetting UI to initial state");

  const selectionToggle = document.getElementById(
    "selection-toggle"
  ) as HTMLButtonElement | null;
  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;
  const loadingSpinner = document.getElementById(
    "loading-spinner"
  ) as HTMLDivElement | null;
  const promptSection = document.getElementById(
    "prompt-section"
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
  selectedPromptId = null;

  if (promptSection) {
    promptSection.style.display = "none";

    // Reset prompt buttons
    const promptButtons = document.querySelector(
      ".prompt-buttons"
    ) as HTMLDivElement | null;
    const chatLoader = document.getElementById("chat-loader") as HTMLDivElement | null;

    if (promptButtons) {
      promptButtons.style.display = "flex";

      const buttons = promptButtons.querySelectorAll(".prompt-button");
      buttons.forEach((btn) => {
        const btnElement = btn as HTMLButtonElement;
        btnElement.disabled = false;
      });
    }

    if (chatLoader) {
      chatLoader.style.display = "none";

      // Reset chat loader text
      const loaderText = chatLoader.querySelector(".chat-loader-text");
      if (loaderText) {
        loaderText.textContent = "Analyzing content...";
      }
    }
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

      case "analysisDone":
        if (message.analysis) {
          displayAnalysis(message.analysis);
        }
        sendResponse({ status: "ok" });
        break;

      case "analysisError":
        handleAnalysisError(message.message || "Unknown error occurred");
        sendResponse({ status: "ok" });
        break;

      case "selectionStatus":
        // No longer need to handle status messages
        sendResponse({ status: "ok" });
        break;

      default:
        log("Unknown message action:", message.action);
        sendResponse({ status: "error", message: "Unknown action" });
    }

    return true; // Keep the message channel open for async responses
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
  log("Screenshot captured, data URL received");

  // Always consider the screenshot captured successfully if we got here
  latestImageUrl = dataUrl;
  captureInProgress = false;

  // Display the captured image
  displayImage(dataUrl);

  // Show the prompt section directly
  showPromptSection();
}

// Show prompt section
function showPromptSection(): void {
  log("Showing prompt section");

  const promptSection = document.getElementById(
    "prompt-section"
  ) as HTMLDivElement | null;

  if (promptSection) {
    promptSection.style.display = "block";
  }
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

  // Make sure the preview container is visible
  imagePreview.style.display = "flex";

  // Create image element
  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = "Captured screenshot";
  img.style.maxWidth = "100%";
  img.style.maxHeight = "100%";
  img.style.objectFit = "contain";

  img.onload = () => {
    log("Image loaded successfully");
    captureInProgress = false;
  };

  img.onerror = (e) => {
    logError("Error loading image", e);
    captureInProgress = false;
    // Show error message in the preview area
    imagePreview.innerHTML =
      '<div style="color: var(--error-color);">Error loading image</div>';
  };

  // Remove any existing images to avoid duplicates
  const existingImages = imagePreview.querySelectorAll("img");
  existingImages.forEach((img) => img.remove());

  // Add the new image
  imagePreview.appendChild(img);

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

// Handle processing started message
function handleProcessingStarted(): void {
  log("Handling processing started");

  captureInProgress = true;

  const imagePreview = document.getElementById("image-preview") as HTMLDivElement | null;
  const loadingSpinner = document.getElementById(
    "loading-spinner"
  ) as HTMLDivElement | null;

  if (imagePreview && loadingSpinner) {
    // Show image preview container and loading spinner
    imagePreview.style.display = "flex";
    loadingSpinner.style.display = "block";
  }
}

// Display analysis in the side panel
function displayAnalysis(analysis: string): void {
  log("Displaying analysis results");

  const analysisResults = document.getElementById(
    "analysis-results"
  ) as HTMLDivElement | null;
  const promptSection = document.getElementById(
    "prompt-section"
  ) as HTMLDivElement | null;

  if (analysisResults) {
    try {
      // Check if markdown is available
      if (markedModule && markedModule.marked) {
        // Parse markdown to HTML - handle potential promise
        const htmlContent = markedModule.marked.parse(analysis);

        // Set the analysis HTML content
        if (typeof htmlContent === "string") {
          analysisResults.innerHTML = htmlContent;

          // Apply syntax highlighting for code blocks
          const codeBlocks = analysisResults.querySelectorAll("pre code");
          codeBlocks.forEach((block) => {
            // Add language classes for JSON if detected
            if (block.textContent?.trim().startsWith("{")) {
              block.parentElement?.classList.add("language-json");

              try {
                // Parse the JSON to ensure it's valid
                const jsonContent = block.textContent;

                if (jsonContent) {
                  // Use a more robust approach to tokenize and highlight JSON
                  const highlightedJson = highlightJson(jsonContent);
                  if (highlightedJson) {
                    block.innerHTML = highlightedJson;
                  }
                }
              } catch (jsonError) {
                // If JSON parsing fails, leave as is
                log("Error highlighting JSON, leaving as plain text", jsonError);
              }
            }
          });
        } else if (htmlContent instanceof Promise) {
          // Handle promise case
          htmlContent
            .then((html: string) => {
              analysisResults.innerHTML = html;
            })
            .catch((error: any) => {
              log("Error parsing markdown in promise, displaying as plain text", error);
              analysisResults.textContent = analysis;
            });
        }
      } else {
        // No markdown support, use plain text
        log("Markdown parser not available, displaying as plain text");
        analysisResults.textContent = analysis;
      }

      analysisResults.style.display = "block";
    } catch (error) {
      // Fallback to plain text if markdown parsing fails
      log("Error parsing markdown, displaying as plain text");
      analysisResults.textContent = analysis;
      analysisResults.style.display = "block";
    }
  }

  if (promptSection) {
    promptSection.style.display = "none";

    // Reset prompt buttons
    const promptButtons = document.querySelector(
      ".prompt-buttons"
    ) as HTMLDivElement | null;
    const chatLoader = document.getElementById("chat-loader") as HTMLDivElement | null;

    if (promptButtons) {
      promptButtons.style.display = "flex";

      // Reset button text and state
      const buttons = promptButtons.querySelectorAll(".prompt-button");
      buttons.forEach((btn) => {
        const btnElement = btn as HTMLButtonElement;
        btnElement.disabled = false;

        // Reset the text in case it was changed during analysis
        const promptId = btnElement.dataset.promptId;
        if (promptId === "describe") {
          btnElement.textContent = "Describe content and extract text";
        } else if (promptId === "extract-text") {
          btnElement.textContent = "Extract text only";
        } else if (promptId === "analyze-ui") {
          btnElement.textContent = "Analyze UI design";
        } else if (promptId === "identify-content") {
          btnElement.textContent = "Identify page structure";
        } else if (promptId === "seo-analysis") {
          btnElement.textContent = "SEO analysis";
        } else if (promptId === "content-type-json") {
          btnElement.textContent = "Create content type json";
        }
      });
    }

    if (chatLoader) {
      chatLoader.style.display = "none";

      // Reset chat loader text
      const loaderText = chatLoader.querySelector(".chat-loader-text");
      if (loaderText) {
        loaderText.textContent = "Analyzing content...";
      }
    }
  }

  analysisInProgress = false;
}

// Handle analysis error
function handleAnalysisError(errorMessage: string): void {
  log("Handling analysis error:", errorMessage);

  // Reset the UI on error
  const promptSection = document.getElementById(
    "prompt-section"
  ) as HTMLDivElement | null;

  if (promptSection) {
    promptSection.style.display = "block";

    const promptButtons = document.querySelector(
      ".prompt-buttons"
    ) as HTMLDivElement | null;
    const chatLoader = document.getElementById("chat-loader") as HTMLDivElement | null;

    if (promptButtons && chatLoader) {
      promptButtons.style.display = "flex";
      chatLoader.style.display = "none";

      // Reset chat loader text
      const loaderText = chatLoader.querySelector(".chat-loader-text");
      if (loaderText) {
        loaderText.textContent = "Analyzing content...";
      }
    }
  }

  analysisInProgress = false;
}

// Helper function to get prompt text by ID
function getPromptTextById(promptId: string): string {
  switch (promptId) {
    case "describe":
      return "Describe what's in this image and extract any text content.";
    case "extract-text":
      return "Extract all text content from this image.";
    case "analyze-ui":
      return "Analyze this UI design and describe its components, layout, and functionality.";
    case "identify-content":
      return "Identify key content sections, headers, and navigation elements in this webpage.";
    case "seo-analysis":
      return "Analyze this webpage for SEO factors and suggest improvements.";
    case "content-type-json":
      return "Create content type json based on this content structure.";
    default:
      return "Describe what's in this image and extract any text content.";
  }
}

// Helper function to properly highlight JSON without breaking nested structures
function highlightJson(json: string): string {
  try {
    // First validate the JSON by parsing it
    JSON.parse(json);

    // Use a token-based approach instead of regex replacement
    return (
      json
        // Handle strings with proper escaping of HTML entities
        .replace(
          /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
          (match) => {
            let cls = "number";
            if (/^"/.test(match)) {
              if (/:$/.test(match)) {
                cls = "key";
                // Only wrap the text in the key, not the colon
                return `<span class="${cls}">${match.replace(":", "")}</span>:`;
              } else {
                cls = "string";
              }
            } else if (/true|false/.test(match)) {
              cls = "boolean";
            } else if (/null/.test(match)) {
              cls = "null";
            }
            return `<span class="${cls}">${match}</span>`;
          }
        )
    );
  } catch (e) {
    // If parsing fails, return the original string
    return json;
  }
}

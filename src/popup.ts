document.addEventListener("DOMContentLoaded", () => {
  const startButton = document.getElementById("startSelection") as HTMLButtonElement;
  const saveButton = document.getElementById("saveSnippet") as HTMLButtonElement;
  const statusDiv = document.getElementById("status") as HTMLDivElement;
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
  let activeTabId: number | null = null;
  let lastDownloadedImage: string | null = null;

  console.log("Popup script initialized");

  const showStatus = (message: string, isError = false) => {
    statusDiv.textContent = message;
    statusDiv.className = `status ${isError ? "error" : "success"}`;
    statusDiv.style.display = "block";
    setTimeout(() => {
      statusDiv.style.display = "none";
    }, 3000);
  };

  // Show info about the downloaded image
  const showImageInfo = (filename: string) => {
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

  const showResult = (data: any) => {
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
    } else {
      // Handle error or unexpected data format
      content.innerHTML = `
        <p class="error">Unable to display analysis result.</p>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `;
    }

    resultDiv.appendChild(content);
    resultDiv.style.display = "block";
  };

  const checkExtensionActive = async (): Promise<boolean> => {
    try {
      console.log("Checking if extension is active...");

      // Try to reload the background page to restart the service worker if needed
      try {
        await chrome.runtime.sendMessage({ action: "ping" }, () => {
          if (chrome.runtime.lastError) {
            console.warn("Connection error:", chrome.runtime.lastError);
          }
        });
      } catch (e) {
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
    } catch (error) {
      console.error("Failed to check extension status:", error);
      return false;
    }
  };

  const getCurrentTab = async (): Promise<chrome.tabs.Tab | null> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    } catch (error) {
      console.error("Failed to get current tab:", error);
      return null;
    }
  };

  // Direct function injection instead of file-based injection
  const setupSelectionInPage = async (tabId: number): Promise<void> => {
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
          (window as any).visionCMSInjected = true;

          // Variables for selection
          let selectionContainer: HTMLDivElement | null = null;
          let selectionOverlay: HTMLDivElement | null = null;
          let startPoint: { x: number; y: number } | null = null;
          let selectedRect: DOMRect | null = null;
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
            if (!selectionOverlay) return;

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
            const preventAllEvents = (e: Event) => {
              e.stopPropagation();
              e.preventDefault();
              e.stopImmediatePropagation();
              return false;
            };

            // Stop all mouse events directly on the button
            captureButton.onmousedown = preventAllEvents;
            captureButton.onmouseup = preventAllEvents;
            captureButton.onmousemove = preventAllEvents;
            captureButton.onclick = (e: MouseEvent) => {
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
            if (!selectedRect) return;

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
          const completeSelection = (rect: DOMRect) => {
            if (!selectionOverlay) return;

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
            const existingContainer = document.querySelector(
              ".vision-cms-selection-container"
            );
            if (existingContainer) {
              existingContainer.remove();
            }
            selectionContainer = null;
            selectionOverlay = null;
          };

          // Update overlay position and size
          const updateOverlay = (
            startX: number,
            startY: number,
            currentX: number,
            currentY: number
          ) => {
            if (!selectionOverlay) return;

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
              if (!container) return;
            }

            isSelecting = true;
            selectionCompleted = false;

            // Mouse event handlers
            if (selectionContainer) {
              selectionContainer.onmousedown = (e: MouseEvent) => {
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
                  const isCompletedOverlay =
                    selectionCompleted && e.target.closest(".vision-cms-selection");

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
                  const buttonsContainer =
                    selectionOverlay.querySelector(".vision-cms-buttons");
                  if (buttonsContainer) {
                    buttonsContainer.remove();
                  }

                  selectionOverlay.classList.remove("completed");
                  updateOverlay(e.clientX, e.clientY, e.clientX, e.clientY);
                }
              };

              selectionContainer.onmousemove = (e: MouseEvent) => {
                if (!startPoint || selectionCompleted) return;
                e.preventDefault();
                updateOverlay(startPoint.x, startPoint.y, e.clientX, e.clientY);
              };

              selectionContainer.onmouseup = (e: MouseEvent) => {
                if (!startPoint || !selectionOverlay) return;
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
                } else {
                  // Reset for a new selection if too small
                  startPoint = null;
                }
              };

              // Handle key presses
              selectionContainer.tabIndex = 0; // Make it focusable to receive key events
              selectionContainer.focus();
              selectionContainer.onkeydown = (e: KeyboardEvent) => {
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
                } else {
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
    } catch (error) {
      console.error("Failed to set up selection:", error);
      throw error;
    }
  };

  // Function to take screenshot of selected area
  const captureSelectedArea = async (tabId: number): Promise<string> => {
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

      const rect = result as DOMRect;

      // Take screenshot of visible tab
      const imageData = await chrome.tabs.captureVisibleTab();

      // Crop the image in memory
      return await cropImage(imageData, rect);
    } catch (error) {
      console.error("Failed to capture screenshot:", error);
      throw error;
    }
  };

  // Helper function to crop image
  const cropImage = (
    dataUrl: string,
    rect: { left: number; top: number; width: number; height: number }
  ): Promise<string> => {
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

        ctx.drawImage(
          img,
          rect.left,
          rect.top,
          rect.width,
          rect.height,
          0,
          0,
          rect.width,
          rect.height
        );

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
      if (
        !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://")
      ) {
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
        } catch (error) {
          // Ignore errors when canceling
          console.log("Error when canceling selection (can be ignored):", error);
        }
      } else {
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
        } catch (error) {
          throw new Error(
            `Failed to start selection: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    } catch (error) {
      console.error("Error:", error);
      showStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        true
      );
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
    } catch (error) {
      showStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        true
      );
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
        } else {
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
        } else if (sender.tab && sender.tab.id) {
          // If the tab ID wasn't already set, use the sender tab ID
          handleCaptureRequest(sender.tab.id, message.rect)
            .then(() => sendResponse({ status: "ok" }))
            .catch((error) => {
              console.error("Failed to handle saveSnippet:", error);
              sendResponse({ status: "error", message: error.message });
            });
          return true; // Will respond asynchronously
        } else {
          showStatus("Cannot capture screenshot: missing tab ID or selection", true);
          sendResponse({ status: "error", message: "Missing tab ID or selection" });
        }
        break;
    }
  });

  // Helper function to handle capture requests from background or content script
  const handleCaptureRequest = async (tabId: number, rect: any): Promise<void> => {
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
    } catch (error) {
      console.error("Failed to handle capture request:", error);
      showStatus(
        `Error capturing screenshot: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        true
      );

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
      } else {
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
    } else {
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

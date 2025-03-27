/**
 * Shared utility functions and types for the Vision CMS extension
 */

// Logger for background script
export function createBackgroundLogger() {
  const prefix = "🔄 Background:";

  return {
    log: (...args: any[]) => console.log(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, "ERROR:", ...args),
  };
}

// Logger for side panel
export function createSidePanelLogger() {
  const prefix = "📋 Side Panel:";

  return {
    log: (...args: any[]) => console.log(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, "ERROR:", ...args),
  };
}

// Logger for content script
export function createContentLogger() {
  const prefix = "🌐 Content:";

  return {
    log: (...args: any[]) => console.log(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, "ERROR:", ...args),
  };
}

// Generate a timestamp-based filename
export function generateFilename(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
  return `vision_cms_snippet_${timestamp}.png`;
}

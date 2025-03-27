# Vision CMS Extension

A Chrome extension for capturing and analyzing webpage content to integrate with CMS systems.

## Features

- **Visual Selection Tool**: Select any area of a webpage with an intuitive dimming overlay that highlights only the selected content
- **Image Processing**: Captures selected areas of webpages and processes them
- **CMS Integration**: Sends processed content to a designated CMS endpoint
- **Side Panel Interface**: Convenient UI for managing captures and viewing results

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Build the extension:
   ```
   npm run build
   ```

### Load the extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" by toggling the switch in the top right corner
3. Click "Load unpacked" and select the `dist` folder from this project

### Development Commands

- `npm run build`: Build the extension
- `npm run generate-icons`: Generate extension icons

## Architecture

The extension is built with TypeScript and follows the Chrome Extension Manifest V3 architecture:

- **Background Script**: Handles the core extension functionality and communication with the server
- **Content Script**: Manages webpage interaction and selection UI
- **Side Panel**: Provides the user interface for interacting with the extension
- **Popup**: Quick access to extension features

## License

MIT 
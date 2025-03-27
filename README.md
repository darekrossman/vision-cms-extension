# Vision CMS Extension

A Chrome extension that allows users to create and save webpage snippets with AI-powered analysis.

## Features

- Select and capture webpage sections
- Save snippets as images
- AI-powered analysis of captured content
- Modern, user-friendly interface
- Server-side image processing to avoid CORS and CSP restrictions

## Development Setup

### Extension

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory

### Proxy Server

The extension requires a proxy server for image processing to avoid CORS and CSP restrictions.

1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Install server dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```

The server will run on http://localhost:3000 by default.

## Development

- Run `npm run watch` to start the extension development build with hot reloading
- Run `npm run dev` in the server directory to start the server with auto-restart
- The extension will be built to the `dist` directory
- Reload the extension in Chrome after making changes

## How It Works

1. The extension uses Chrome's `captureVisibleTab` API to take a screenshot of the current tab
2. The selection coordinates are sent to the proxy server along with the screenshot
3. The server crops the image and stores it
4. The server returns a URL to the cropped image
5. The extension displays the image in the side panel

This approach avoids CORS and Content Security Policy (CSP) restrictions that can prevent direct screenshot capture on many websites.

## Project Structure

```
vision-cms-extension/
├── src/
│   ├── popup.ts      # Extension popup interface
│   ├── content.ts    # Content script for selection
│   ├── background.ts # Service worker
│   ├── sidepanel.ts  # Side panel script
│   └── utils.ts      # Shared utilities
├── public/
│   ├── manifest.json # Extension configuration
│   ├── popup.html    # Popup HTML
│   ├── sidepanel.html # Side panel HTML
│   └── content.css   # Content script styles
├── server/
│   ├── server.js     # Proxy server for image processing
│   ├── package.json  # Server dependencies
│   └── README.md     # Server documentation
├── package.json      # Project dependencies
└── webpack.config.js # Build configuration
```

## License

ISC 
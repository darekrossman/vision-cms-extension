# Vision CMS Proxy Server

This server handles image processing for the Vision CMS Chrome Extension. It receives screenshots and selection coordinates from the extension, crops the images server-side, and provides URLs to the processed images.

## Features

- Receives screenshots captured by Chrome's API
- Crops images based on selection coordinates
- Handles device pixel ratio scaling
- Serves static image files
- Returns image URLs for the Chrome extension to display

## Prerequisites

- Node.js 16+
- npm or yarn

## Installation

1. Install dependencies:

```bash
npm install
# or
yarn install
```

2. Start the server:

```bash
npm start
# or
yarn start
```

For development with auto-restart:

```bash
npm run dev
# or
yarn dev
```

## API Endpoints

### POST /process-image

Processes an image by cropping it according to selection coordinates.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body:
  - `image`: PNG file of the screenshot
  - `x`: X-coordinate of selection (left)
  - `y`: Y-coordinate of selection (top)
  - `width`: Width of selection
  - `height`: Height of selection
  - `dpr`: Device pixel ratio

**Response:**
```json
{
  "success": true,
  "imageUrl": "http://localhost:3000/images/cropped-123456789.png",
  "message": "Image processed successfully"
}
```

## Folder Structure

- `/uploads`: Temporary storage for uploaded images
- `/public`: Processed images served statically

## Development

The server automatically creates the required directories on startup. Images are temporarily stored in the uploads directory during processing, then saved to the public directory for serving.

To modify the server port, set the PORT environment variable:

```bash
PORT=8080 npm start
``` 
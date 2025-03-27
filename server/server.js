const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Serve static files from public directory
app.use('/images', express.static(publicDir));

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Endpoint to process an image 
app.post('/process-image', upload.single('image'), async (req, res) => {
  try {
    console.log('Processing image request');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Get the selection rectangle and device pixel ratio from the request
    const x = parseFloat(req.body.x) || 0;
    const y = parseFloat(req.body.y) || 0;
    const width = parseFloat(req.body.width) || 0;
    const height = parseFloat(req.body.height) || 0;
    const dpr = parseFloat(req.body.dpr) || 1;
    
    console.log(`Selection: x=${x}, y=${y}, width=${width}, height=${height}, dpr=${dpr}`);
    
    // Handle potential invalid dimensions
    if (width <= 0 || height <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid selection dimensions. Width and height must be positive numbers.' 
      });
    }
    
    // Safety check - ensure we have reasonable values to avoid Sharp errors
    const scaledX = Math.max(0, Math.round(x * dpr));
    const scaledY = Math.max(0, Math.round(y * dpr));
    const scaledWidth = Math.max(1, Math.round(width * dpr));
    const scaledHeight = Math.max(1, Math.round(height * dpr));
    
    // Path to the uploaded file
    const uploadedFilePath = req.file.path;
    
    // First check if the image is valid and get its dimensions
    let imageInfo;
    try {
      imageInfo = await sharp(uploadedFilePath).metadata();
      console.log(`Image dimensions: ${imageInfo.width}x${imageInfo.height}`);
      
      // Check if crop area is within image bounds
      if (scaledX + scaledWidth > imageInfo.width || scaledY + scaledHeight > imageInfo.height) {
        console.warn('Crop area exceeds image bounds, adjusting...');
        
        // Adjust crop area to fit within image bounds
        const adjustedWidth = Math.min(scaledWidth, imageInfo.width - scaledX);
        const adjustedHeight = Math.min(scaledHeight, imageInfo.height - scaledY);
        
        // If adjusted dimensions are too small, return an error
        if (adjustedWidth <= 0 || adjustedHeight <= 0) {
          throw new Error('Selection area is outside the image bounds');
        }
      }
    } catch (error) {
      console.error('Invalid image or metadata error:', error);
      return res.status(400).json({ 
        success: false,
        error: `Image processing error: ${error.message}` 
      });
    }
    
    // Create a unique filename for the processed image
    const processedFilename = `cropped-${Date.now()}.png`;
    const outputPath = path.join(publicDir, processedFilename);
    
    // Crop the image using sharp with safe dimensions
    try {
      await sharp(uploadedFilePath)
        .extract({
          left: scaledX,
          top: scaledY,
          width: Math.min(scaledWidth, imageInfo.width - scaledX),
          height: Math.min(scaledHeight, imageInfo.height - scaledY)
        })
        .toFile(outputPath);
      
      console.log(`Image cropped successfully`);
    } catch (error) {
      console.error('Error during image cropping:', error);
      return res.status(500).json({ 
        success: false,
        error: `Image cropping failed: ${error.message}` 
      });
    }
    
    // Remove the temporary uploaded file
    fs.unlink(uploadedFilePath, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });
    
    // Construct the URL for the processed image
    const imageUrl = `http://localhost:${PORT}/images/${processedFilename}`;
    
    // Return the image URL to the client
    res.json({
      success: true,
      imageUrl,
      message: 'Image processed successfully'
    });
    
    console.log(`Image processed and saved to ${outputPath}`);
  } catch (error) {
    console.error('Error processing image:', error);
    
    // Always try to clean up any uploaded file on error
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while processing the image'
    });
  }
});

// Endpoint for analyzing images (legacy support)
app.post('/analyze-image', (req, res) => {
  try {
    console.log('Received legacy analyze-image request');
    res.status(200).json({
      success: true,
      message: 'This endpoint is deprecated. Please use /process-image instead.',
      imageUrl: null
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Images will be available at http://localhost:${PORT}/images/`);
}); 
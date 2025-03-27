require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)){
  fs.mkdirSync(logsDir);
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Endpoint to convert code to TypeScript
app.post('/convert', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Convert this code to TypeScript. Ensure all types are properly defined and the code is fully typed. Return ONLY the converted code without any explanation or markdown formatting:

${code}`
      }]
    });

    res.json({ 
      success: true, 
      convertedCode: message.content[0].text
    });
  } catch (error) {
    console.error('Error converting code:', error);
    res.status(500).json({ 
      error: 'Failed to convert code',
      details: error.message
    });
  }
});

// New endpoint to analyze image with Claude 3.7
app.post('/analyze-image', async (req, res) => {
  try {
    const { imageData, prompt } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    // Validate image data format
    if (!imageData.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data format' });
    }

    // Extract base64 data
    const base64Data = imageData.split(',')[1];
    
    // Check if the image has content
    const decodedLength = Buffer.from(base64Data, 'base64').length;
    console.log(`Received image with size: ${decodedLength} bytes`);
    
    // Save a sample of the image data for debugging
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const logPath = path.join(logsDir, `image_request_${timestamp}.log`);
    const logData = {
      timestamp: new Date().toISOString(),
      imageSize: decodedLength,
      imagePrefix: imageData.substring(0, 50) + '...',
      prompt: prompt || 'Default prompt'
    };
    
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
    
    if (decodedLength < 100) {
      console.warn('Warning: Image appears to have very little data');
      // Save the empty image for debugging
      const errorImagePath = path.join(logsDir, `empty_image_${timestamp}.txt`);
      fs.writeFileSync(errorImagePath, base64Data);
      return res.status(400).json({ 
        error: 'Image data appears to be empty or corrupt',
        details: 'The image has very little data content.' 
      });
    }

    // Create message with Claude 3.7
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Data
            }
          },
          {
            type: 'text',
            text: 'Analyze this image. Describe it in one sentence.'
          }
        ]
      }]
    });

    console.log(`Analysis successful. Response length: ${message.content[0].text.length} chars`);

    res.json({ 
      success: true, 
      analysis: message.content[0].text
    });
  } catch (error) {
    console.error('Error analyzing image:', error);
    
    // Log the error details
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const errorLogPath = path.join(logsDir, `error_${timestamp}.log`);
    fs.writeFileSync(errorLogPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    }, null, 2));
    
    res.status(500).json({ 
      error: 'Failed to analyze image',
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Proxy server running at http://localhost:${port}`);
}); 
// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
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
        error: 'Invalid selection dimensions. Width and height must be positive numbers.',
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
        error: `Image processing error: ${error.message}`,
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
          height: Math.min(scaledHeight, imageInfo.height - scaledY),
        })
        .toFile(outputPath);

      console.log('Image cropped successfully');
    } catch (error) {
      console.error('Error during image cropping:', error);
      return res.status(500).json({
        success: false,
        error: `Image cropping failed: ${error.message}`,
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
      message: 'Image processed successfully',
    });

    console.log(`Image processed and saved to ${outputPath}`);
  } catch (error) {
    console.error('Error processing image:', error);

    // Always try to clean up any uploaded file on error
    fs.unlink(req.file?.path, () => {});

    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while processing the image',
    });
  }
});

// Endpoint for analyzing images (legacy support)
app.post('/analyze-image', upload.none(), async (req, res) => {
  try {
    console.log('Received analyze-image request');

    // Get image URL from form data
    const imageUrl = req.body.imageUrl;
    const prompt = req.body.prompt || "Describe what's in this image and extract any text content.";

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    console.log(`Received imageUrl: ${imageUrl.substring(0, 50)}...`);

    // Log the request for debugging
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const logPath = path.join(uploadsDir, `image_analysis_request_${timestamp}.log`);
    fs.writeFileSync(
      logPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          prompt: prompt,
          imageUrlStart: `${imageUrl.substring(0, 50)}...`,
        },
        null,
        2
      )
    );

    // Fetch the image from the URL
    let base64Data;

    // If it's already a data URL
    if (imageUrl.startsWith('data:image/')) {
      console.log('Processing data URL');
      base64Data = imageUrl.split(',')[1];
    } else if (imageUrl.startsWith('http')) {
      console.log('Processing HTTP URL');
      try {
        // For HTTP URLs, we need to fetch the image content
        const fetch = require('node-fetch');
        const response = await fetch(imageUrl);

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        // Get the image as buffer and convert to base64
        const imageBuffer = await response.buffer();
        base64Data = imageBuffer.toString('base64');

        console.log(
          `Successfully fetched and converted image from URL, size: ${imageBuffer.length} bytes`
        );
      } catch (fetchError) {
        console.error('Error fetching image:', fetchError);
        return res.status(400).json({
          error: 'Failed to fetch image from URL',
          details: fetchError.message,
        });
      }
    } else {
      console.error('Invalid image URL format:', imageUrl.substring(0, 50));
      return res.status(400).json({
        error:
          'Invalid image URL format. Must be a data URL starting with "data:image/" or an HTTP URL',
        details: 'The provided URL was not recognized as a valid format.',
      });
    }

    if (!base64Data) {
      return res.status(400).json({ error: 'Failed to extract image data' });
    }

    // Load Anthropic API Key from environment variables
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      console.error('Missing ANTHROPIC_API_KEY environment variable');
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'API key not configured',
      });
    }

    // Initialize Anthropic client
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });

    // Create message with Claude 3.7
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 4096,
      system: `You are an expert CMS Analysis Assistant designed to help users understand, analyze, and optimize websites from a content management perspective. Your primary function is to provide insightful analysis of website architecture, content organization, and technical implementation of content management systems.

## Core Capabilities

1. **Website Analysis**: You can analyze websites to identify their CMS platform, content structure, information architecture, and technical implementation details.

2. **Data Modeling**: You excel at modeling complex content relationships, taxonomies, and metadata structures to help users understand and optimize their content ecosystems.

3. **Tool Utilization**: You have access to and can effectively use:
   - Web scraping tools to gather data from websites
   - API integration capabilities to connect with various CMS platforms (WordPress, Drupal, Contentful, etc.)
   - Data visualization tools to represent content models and site architecture
   - Browser tools for examining website performance, accessibility, and structure

4. **Performance Assessment**: You can evaluate website performance related to content delivery, SEO optimization, and user experience.

## Interaction Protocol

When a user requests website analysis:
1. Gather the website URL and specific analysis goals
2. Use appropriate tools (web scraper, API connections) to collect relevant data
3. Analyze the collected information systematically
4. Present findings in a clear, organized manner with actionable insights
5. Offer to explore specific aspects in greater depth if needed

## Response Guidelines

- Provide technical explanations that match the user's expertise level
- Always include evidence-based observations rather than assumptions
- When suggesting improvements, explain the reasoning and potential benefits
- Use appropriate data visualization or structured formats to present complex information
- Acknowledge limitations in your analysis when data is incomplete

## Contentstack API Integration Examples

### Content Type Creation Schema
When creating a content type via the Management API, use the following JSON structure:

<example>
{
  "content_type": {
    "title": "Blog Post",
    "uid": "blog_post",
    "schema": [
      {
        "display_name": "Title",
        "uid": "title",
        "data_type": "text",
        "mandatory": true,
        "unique": true,
        "field_metadata": {
          "_default": true
        },
        "multiple": false
      },
      {
        "display_name": "URL",
        "uid": "url",
        "data_type": "text",
        "mandatory": true,
        "field_metadata": {
          "_default": true
        },
        "multiple": false,
        "unique": false
      },
      {
        "display_name": "Author",
        "uid": "author",
        "data_type": "text",
        "mandatory": false,
        "multiple": false
      },
      {
        "display_name": "Content",
        "uid": "content",
        "data_type": "rich_text_editor",
        "mandatory": false,
        "multiple": false
      },
      {
        "display_name": "Featured Image",
        "uid": "featured_image",
        "data_type": "file",
        "mandatory": false,
        "multiple": false
      },
      {
        "display_name": "Categories",
        "uid": "categories",
        "data_type": "reference",
        "reference_to": "category",
        "multiple": true
      }
    ],
    "options": {
      "is_page": true,
      "singleton": false,
      "title": "title",
      "sub_title": [],
      "url_pattern": "/:title",
      "url_prefix": "/"
    }
  }
}
</example>

### Entry Creation Schema
When creating an entry for a content type via the Management API, use the following JSON structure:

<example>
{
  "entry": {
    "title": "Example Blog Post",
    "url": "/example-blog-post",
    "author": "John Doe",
    "content": "<p>This is the content of the blog post.</p>",
    "featured_image": "asset_uid",
    "categories": [
      {
        "uid": "category_uid_1",
        "_content_type_uid": "category"
      },
      {
        "uid": "category_uid_2",
        "_content_type_uid": "category"
      }
    ]
  }
}
</example>

### Entry with JSON RTE Schema
When creating an entry with JSON Rich Text Editor field:

<example>
{
  "entry": {
    "title": "Entry with JSON RTE",
    "url": "/entry-with-json-rte",
    "json_rte_field": {
      "children": [
        {
          "type": "p",
          "uid": "unique_id_1",
          "children": [
            {
              "text": "This is a paragraph with "
            },
            {
              "text": "bold text",
              "bold": true
            },
            {
              "text": " and "
            },
            {
              "text": "italic text",
              "italic": true
            }
          ]
        },
        {
          "type": "h1",
          "uid": "unique_id_2",
          "children": [
            {
              "text": "This is a heading"
            }
          ]
        }
      ]
    }
  }
}
</example>

### Entry with Taxonomy Schema
When creating an entry with taxonomy fields:

<example>
{
  "entry": {
    "title": "Entry with Taxonomy",
    "url": "/entry-with-taxonomy",
    "taxonomies": [
      {
        "taxonomy_uid": "colors",
        "term_uid": "blue"
      },
      {
        "taxonomy_uid": "colors",
        "term_uid": "green"
      },
      {
        "taxonomy_uid": "sizes",
        "term_uid": "medium"
      }
    ]
  }
}
</example>

## Ethical Considerations

- Respect website terms of service and robots.txt directives when scraping
- Do not attempt to access restricted areas or private information
- Only analyze publicly available content
- Inform users of potential rate limiting or access issues with external APIs

You are a collaborative assistant who helps users better understand their content ecosystems and make informed decisions about content management strategies.`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    console.log(`Analysis successful. Response length: ${message.content[0].text.length} chars`);

    // Send response in the format expected by the extension
    res.json({
      success: true,
      content: message.content[0].text,
    });
  } catch (error) {
    console.error('Error analyzing image:', error);

    // Log the error details
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const errorLogPath = path.join(uploadsDir, `error_${timestamp}.log`);
    fs.writeFileSync(
      errorLogPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          error: error.message,
          stack: error.stack,
        },
        null,
        2
      )
    );

    res.status(500).json({
      error: 'Failed to analyze image',
      details: error.message,
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Images will be available at http://localhost:${PORT}/images/`);
});

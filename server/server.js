// Load environment variables from .env file
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
const { v4: uuidv4 } = require("uuid");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const contentstack = require("@contentstack/management"); // Import Contentstack SDK

// Define available models by provider
const ANTHROPIC_MODELS = {
	"claude-3-7-sonnet-20250219": {
		name: "Claude 3.7 Sonnet",
		provider: "anthropic",
		supportsVision: true,
		maxTokens: 4096,
	},
	"claude-3-opus-20240229": {
		name: "Claude 3 Opus",
		provider: "anthropic",
		supportsVision: true,
		maxTokens: 4096,
	},
	"claude-3-sonnet-20240229": {
		name: "Claude 3 Sonnet",
		provider: "anthropic",
		supportsVision: true,
		maxTokens: 4096,
	},
	"claude-3-haiku-20240307": {
		name: "Claude 3 Haiku",
		provider: "anthropic",
		supportsVision: true, 
		maxTokens: 4096,
	},
};

const OPENAI_MODELS = {
	"gpt-4o": {
		name: "GPT-4o",
		provider: "openai",
		supportsVision: true,
		maxTokens: 4096,
	},
	"gpt-4-turbo": {
		name: "GPT-4 Turbo",
		provider: "openai",
		supportsVision: true,
		maxTokens: 4096,
	},
	"gpt-3.5-turbo": {
		name: "GPT-3.5 Turbo",
		provider: "openai",
		supportsVision: true,
		maxTokens: 4096,
	},
};

// Default model
const DEFAULT_MODEL = "claude-3-7-sonnet-20250219";

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// --- Environment Variable Checks ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CONTENTSTACK_API_KEY = process.env.CONTENTSTACK_API_KEY; // Stack API Key
const CONTENTSTACK_MANAGEMENT_TOKEN = process.env.CONTENTSTACK_MANAGEMENT_TOKEN; // Stack Management Token
const CONTENTSTACK_HOST =
	process.env.CONTENTSTACK_HOST || "api.contentstack.io"; // Optional: Defaults to NA endpoint
const CONTENTSTACK_REGION = process.env.CONTENTSTACK_REGION; // Optional: e.g., 'us-east-1', 'eu-central-1'

if (!ANTHROPIC_API_KEY) {
	console.error("Warning: Missing ANTHROPIC_API_KEY environment variable - Anthropic models will not be available");
}

if (!OPENAI_API_KEY) {
	console.error("Warning: Missing OPENAI_API_KEY environment variable - OpenAI models will not be available");
}

if (!ANTHROPIC_API_KEY && !OPENAI_API_KEY) {
	console.error("Error: No API keys provided for any AI providers");
	process.exit(1); // Exit if no API keys are available
}

if (!CONTENTSTACK_API_KEY || !CONTENTSTACK_MANAGEMENT_TOKEN) {
	console.error(
		"Missing CONTENTSTACK_API_KEY or CONTENTSTACK_MANAGEMENT_TOKEN environment variable",
	);
	process.exit(1); // Exit if critical env vars are missing
}

// --- Initialize clients ---
// Initialize Anthropic client if API key is available
let anthropicClient = null;
if (ANTHROPIC_API_KEY) {
	anthropicClient = new Anthropic({
		apiKey: ANTHROPIC_API_KEY,
	});
	console.log("Anthropic client initialized successfully");
}

// Initialize OpenAI client if API key is available
let openaiClient = null;
if (OPENAI_API_KEY) {
	openaiClient = new OpenAI({
		apiKey: OPENAI_API_KEY,
	});
	console.log("OpenAI client initialized successfully");
}

// --- Initialize Contentstack Client ---
const csClient = contentstack.client({
	host: CONTENTSTACK_HOST,
	// Add region if specified
	...(CONTENTSTACK_REGION && {
		region: contentstack.Region[CONTENTSTACK_REGION.toUpperCase()],
	}),
});
const stack = csClient.stack({
	api_key: CONTENTSTACK_API_KEY,
	management_token: CONTENTSTACK_MANAGEMENT_TOKEN,
});

console.log(
	`Contentstack Client Initialized. Host: ${CONTENTSTACK_HOST}${
		CONTENTSTACK_REGION ? ", Region: " + CONTENTSTACK_REGION : ""
	}`,
);

// --- Anthropic API with retry logic ---
/**
 * Calls Anthropic API with retry logic and exponential backoff
 * @param {Object} params - The parameters for the Anthropic API call
 * @param {Function} sendEvent - Optional function to send events to client for chat SSE
 * @param {Number} maxRetries - Maximum number of retries (default: 3)
 * @param {Number} initialDelay - Initial delay in ms (default: 1000)
 * @returns {Promise<Object>} - The API response
 */
async function callAnthropicWithRetry(params, sendEvent = null, maxRetries = 3, initialDelay = 1000) {
	if (!anthropicClient) {
		throw new Error("Anthropic client not initialized. Please check your API key.");
	}
	
	let lastError;
	let retryCount = 0;
	
	while (retryCount <= maxRetries) {
		try {
			console.log(`Calling Anthropic API (attempt ${retryCount + 1}/${maxRetries + 1})...`);
			return await anthropicClient.messages.create(params);
		} catch (error) {
			lastError = error;
			
			// If this was our last retry, throw the error
			if (retryCount >= maxRetries) {
				console.error(`Failed after ${maxRetries + 1} attempts:`, error);
				throw error;
			}
			
			// Calculate delay with exponential backoff: delay = initialDelay * 2^retryCount
			const delay = initialDelay * Math.pow(2, retryCount);
			console.warn(`Anthropic API call failed (attempt ${retryCount + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`, error);
			
			// Notify client if we're in SSE mode
			if (sendEvent) {
				sendEvent("retry", {
					attempt: retryCount + 1,
					maxRetries: maxRetries,
					delay: delay,
					error: error.message,
					nextAttemptIn: `${delay / 1000} seconds`,
				});
			}
			
			// Wait before retrying
			await new Promise(resolve => setTimeout(resolve, delay));
			retryCount++;
		}
	}
}

/**
 * Calls OpenAI API with retry logic and exponential backoff
 * @param {Object} params - The parameters for the OpenAI API call
 * @param {Function} sendEvent - Optional function to send events to client for chat SSE
 * @param {Number} maxRetries - Maximum number of retries (default: 3)
 * @param {Number} initialDelay - Initial delay in ms (default: 1000)
 * @returns {Promise<Object>} - The API response
 */
async function callOpenAIWithRetry(params, sendEvent = null, maxRetries = 3, initialDelay = 1000) {
	if (!openaiClient) {
		throw new Error("OpenAI client not initialized. Please check your API key.");
	}
	
	let lastError;
	let retryCount = 0;
	
	while (retryCount <= maxRetries) {
		try {
			console.log(`Calling OpenAI API (attempt ${retryCount + 1}/${maxRetries + 1})...`);
			return await openaiClient.chat.completions.create(params);
		} catch (error) {
			lastError = error;
			
			// If this was our last retry, throw the error
			if (retryCount >= maxRetries) {
				console.error(`Failed after ${maxRetries + 1} attempts:`, error);
				throw error;
			}
			
			// Calculate delay with exponential backoff: delay = initialDelay * 2^retryCount
			const delay = initialDelay * Math.pow(2, retryCount);
			console.warn(`OpenAI API call failed (attempt ${retryCount + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`, error);
			
			// Notify client if we're in SSE mode
			if (sendEvent) {
				sendEvent("retry", {
					attempt: retryCount + 1,
					maxRetries: maxRetries,
					delay: delay,
					error: error.message,
					nextAttemptIn: `${delay / 1000} seconds`,
				});
			}
			
			// Wait before retrying
			await new Promise(resolve => setTimeout(resolve, delay));
			retryCount++;
		}
	}
}

// Set up middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
const publicDir = path.join(__dirname, "public");

if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(publicDir)) {
	fs.mkdirSync(publicDir, { recursive: true });
}

// Serve static files from public directory
app.use("/images", express.static(publicDir));

// Configure multer for handling file uploads
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, uploadsDir);
	},
	filename: (req, file, cb) => {
		const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(
			file.originalname,
		)}`;
		cb(null, uniqueName);
	},
});

const upload = multer({ storage });

// Endpoint to process an image
app.post("/process-image", upload.single("image"), async (req, res) => {
	try {
		console.log("Processing image request");

		if (!req.file) {
			return res.status(400).json({ error: "No image file provided" });
		}

		// Get the selection rectangle and device pixel ratio from the request
		const x = parseFloat(req.body.x) || 0;
		const y = parseFloat(req.body.y) || 0;
		const width = parseFloat(req.body.width) || 0;
		const height = parseFloat(req.body.height) || 0;
		const dpr = parseFloat(req.body.dpr) || 1;

		console.log(
			`Selection: x=${x}, y=${y}, width=${width}, height=${height}, dpr=${dpr}`,
		);

		// Handle potential invalid dimensions
		if (width <= 0 || height <= 0) {
			return res.status(400).json({
				success: false,
				error:
					"Invalid selection dimensions. Width and height must be positive numbers.",
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
			if (
				scaledX + scaledWidth > imageInfo.width ||
				scaledY + scaledHeight > imageInfo.height
			) {
				console.warn("Crop area exceeds image bounds, adjusting...");

				// Adjust crop area to fit within image bounds
				const adjustedWidth = Math.min(scaledWidth, imageInfo.width - scaledX);
				const adjustedHeight = Math.min(
					scaledHeight,
					imageInfo.height - scaledY,
				);

				// If adjusted dimensions are too small, return an error
				if (adjustedWidth <= 0 || adjustedHeight <= 0) {
					throw new Error("Selection area is outside the image bounds");
				}
			}
		} catch (error) {
			console.error("Invalid image or metadata error:", error);
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

			console.log("Image cropped successfully");
		} catch (error) {
			console.error("Error during image cropping:", error);
			return res.status(500).json({
				success: false,
				error: `Image cropping failed: ${error.message}`,
			});
		}

		// Remove the temporary uploaded file
		fs.unlink(uploadedFilePath, (err) => {
			if (err) console.error("Error deleting temp file:", err);
		});

		// Construct the URL for the processed image
		const imageUrl = `http://localhost:${PORT}/images/${processedFilename}`;

		// Return the image URL to the client
		res.json({
			success: true,
			imageUrl,
			message: "Image processed successfully",
		});

		console.log(`Image processed and saved to ${outputPath}`);
	} catch (error) {
		console.error("Error processing image:", error);

		// Always try to clean up any uploaded file on error
		fs.unlink(req.file?.path, () => {});

		res.status(500).json({
			success: false,
			error: error.message || "An error occurred while processing the image",
		});
	}
});

// --- Tool Definitions ---
// Define tool schemas for Anthropic
const tools = [
	{
		name: "get_content_type",
		description:
			"Retrieves the details of a specific content type within the Contentstack stack using its UID.",
		input_schema: {
			type: "object",
			properties: {
				uid: {
					type: "string",
					description: "The unique ID (UID) of the content type to retrieve.",
				},
			},
			required: ["uid"],
		},
	},
	{
		name: "get_content_types",
		description:
			"Retrieves a list of content types within the Contentstack stack. Supports optional query parameters.",
		input_schema: {
			type: "object",
			properties: {
				query: {
					type: "object",
					description:
						"Optional Contentstack query object (e.g., { limit: 10, skip: 0, include_count: true }). See Contentstack documentation.",
					properties: {
						limit: {
							type: "number",
							description: "Limit the number of results.",
							default: 100,
						},
						skip: {
							type: "number",
							description: "Skip a number of results.",
							default: 0,
						},
						include_count: {
							type: "boolean",
							description: "Include the total count of content types.",
							default: false,
						},
					},
					required: [],
				},
			},
			required: [],
		},
	},
	{
		name: "create_content_type",
		description: "Creates a new content type in the Contentstack stack.",
		input_schema: {
			type: "object",
			properties: {
				content_type_data: {
					type: "object",
					description:
						"An object representing the content type definition, including 'title', 'uid', 'schema' (array of field objects), and 'options'. Refer to Contentstack Management API documentation.",
					properties: {
						title: {
							type: "string",
							description: "The display name of the content type.",
						},
						uid: {
							type: "string",
							description:
								"The unique ID for the content type (lowercase, snake_case).",
						},
						schema: {
							type: "array",
							description: "An array of field schema objects.",
							items: {
								type: "object",
								description: "Schema field definition"
							}
						},
						options: {
							type: "object",
							description:
								"Content type options like 'is_page', 'singleton', 'title', 'url_pattern'.",
						},
					},
					required: ["title", "uid", "schema"],
				},
			},
			required: ["content_type_data"],
		},
	},
	{
		name: "update_content_type",
		description:
			"Updates an existing content type in the Contentstack stack. Fetches the content type first, merges changes, then updates.",
		input_schema: {
			type: "object",
			properties: {
				uid: {
					type: "string",
					description: "The unique ID (UID) of the content type to update.",
				},
				content_type_data: {
					type: "object",
					description:
						"An object containing the fields of the content type to update. Include only fields that need modification.",
					properties: {
						title: { type: "string", description: "The updated display name." },
						description: {
							type: "string",
							description: "The updated description.",
						},
						schema: {
							type: "array",
							description: "The updated array of field schema objects.",
							items: { type: "object" },
						},
						options: {
							type: "object",
							description: "The updated content type options.",
						},
					},
					required: [],
				},
			},
			required: ["uid", "content_type_data"],
		},
	},
	{
		name: "get_entry",
		description: "Retrieves a specific entry for a given content type.",
		input_schema: {
			type: "object",
			properties: {
				content_type_uid: {
					type: "string",
					description: "The UID of the content type the entry belongs to.",
				},
				entry_uid: {
					type: "string",
					description: "The UID of the entry to retrieve.",
				},
				params: {
					type: "object",
					description: "Optional query parameters like locale or version.",
					properties: {
						locale: {
							type: "string",
							description: "The locale code (e.g., 'en-us').",
						},
						version: {
							type: "number",
							description: "The version number to retrieve.",
						},
					},
					required: [],
				},
			},
			required: ["content_type_uid", "entry_uid"],
		},
	},
	{
		name: "get_entries",
		description:
			"Retrieves a list of entries for a given content type. Supports optional query parameters.",
		input_schema: {
			type: "object",
			properties: {
				content_type_uid: {
					type: "string",
					description:
						"The UID of the content type whose entries are to be retrieved.",
				},
				query: {
					type: "object",
					description:
						"Optional Contentstack query object (e.g., { query: { 'title': '...' }, limit: 10, locale: 'en-us' }). See Contentstack documentation.",
					properties: {
						query: {
							type: "object",
							description: "JSON query object for filtering entries.",
							default: {},
						},
						locale: {
							type: "string",
							description: "The locale code.",
							default: "en-us",
						},
						limit: {
							type: "number",
							description: "Limit the number of results.",
							default: 100,
						},
						skip: {
							type: "number",
							description: "Skip a number of results.",
							default: 0,
						},
						include_count: {
							type: "boolean",
							description: "Include the total count of entries.",
							default: false,
						},
					},
					required: [],
				},
			},
			required: ["content_type_uid"],
		},
	},
	{
		name: "create_entry",
		description: "Creates a new entry for a given content type.",
		input_schema: {
			type: "object",
			properties: {
				content_type_uid: {
					type: "string",
					description:
						"The UID of the content type for which to create the entry.",
				},
				entry_data: {
					type: "object",
					description:
						"An object containing the data for the new entry, matching the content type's schema. Must include a 'title' field.",
					properties: {
						title: { type: "string", description: "The title of the entry." },
						// Other fields depend on the content type schema
					},
					required: ["title"],
				},
				params: {
					type: "object",
					description: "Optional query parameters like locale.",
					properties: {
						locale: {
							type: "string",
							description: "The locale code (e.g., 'en-us') for the entry.",
						},
					},
					required: [],
				},
			},
			required: ["content_type_uid", "entry_data"],
		},
	},
	{
		name: "update_entry",
		description:
			"Updates an existing entry for a given content type. Fetches the entry first, merges changes, then updates.",
		input_schema: {
			type: "object",
			properties: {
				content_type_uid: {
					type: "string",
					description: "The UID of the content type the entry belongs to.",
				},
				entry_uid: {
					type: "string",
					description: "The UID of the entry to update.",
				},
				entry_data: {
					type: "object",
					description:
						"An object containing the fields to update in the entry.",
					properties: {
						title: { type: "string", description: "The updated title." },
						// Other fields depend on the content type schema
					},
					required: [],
				},
				params: {
					type: "object",
					description: "Optional query parameters like locale.",
					properties: {
						locale: {
							type: "string",
							description:
								"The locale code (e.g., 'en-us') of the entry to update.",
						},
					},
					required: [],
				},
			},
			required: ["content_type_uid", "entry_uid", "entry_data"],
		},
	},
];

// --- Tool Execution Logic ---
// Functions that execute Contentstack SDK calls based on tool name
async function executeTool(toolName, toolInput) {
	console.log(
		`Executing tool: ${toolName} with input:`,
		JSON.stringify(toolInput, null, 2),
	);
	try {
		switch (toolName) {
			case "get_content_type":
				if (!toolInput.uid) throw new Error("Missing required parameter: uid");
				return await stack.contentType(toolInput.uid).fetch();

			case "get_content_types":
				return await stack
					.contentType()
					.query(toolInput.query || {})
					.find();

			case "create_content_type":
				if (!toolInput.content_type_data)
					throw new Error("Missing required parameter: content_type_data");
				// SDK create method takes { content_type: { ... } }
				return await stack
					.contentType()
					.create({ content_type: toolInput.content_type_data });

			case "update_content_type": {
				// Use block scope for let
				if (!toolInput.uid) throw new Error("Missing required parameter: uid");
				if (!toolInput.content_type_data)
					throw new Error("Missing required parameter: content_type_data");
				// Fetch first, then update
				let contentTypeToUpdate = await stack
					.contentType(toolInput.uid)
					.fetch();
				// Merge updates onto the fetched object
				contentTypeToUpdate = {
					...contentTypeToUpdate,
					...toolInput.content_type_data,
				};
				return await contentTypeToUpdate.update();
			}

			case "get_entry":
				if (!toolInput.content_type_uid)
					throw new Error("Missing required parameter: content_type_uid");
				if (!toolInput.entry_uid)
					throw new Error("Missing required parameter: entry_uid");
				return await stack
					.contentType(toolInput.content_type_uid)
					.entry(toolInput.entry_uid)
					.fetch({ params: toolInput.params || {} });

			case "get_entries":
				if (!toolInput.content_type_uid)
					throw new Error("Missing required parameter: content_type_uid");
				return await stack
					.contentType(toolInput.content_type_uid)
					.entry()
					.query(toolInput.query || {})
					.find();

			case "create_entry":
				if (!toolInput.content_type_uid)
					throw new Error("Missing required parameter: content_type_uid");
				if (!toolInput.entry_data)
					throw new Error("Missing required parameter: entry_data");
				// SDK expects { entry: { ... } }
				return await stack
					.contentType(toolInput.content_type_uid)
					.entry()
					.create(
						{ entry: toolInput.entry_data },
						{ params: toolInput.params || {} },
					);

			case "update_entry": {
				// Use block scope for let
				if (!toolInput.content_type_uid)
					throw new Error("Missing required parameter: content_type_uid");
				if (!toolInput.entry_uid)
					throw new Error("Missing required parameter: entry_uid");
				if (!toolInput.entry_data)
					throw new Error("Missing required parameter: entry_data");
				// Fetch first, then update
				let entryToUpdate = await stack
					.contentType(toolInput.content_type_uid)
					.entry(toolInput.entry_uid)
					.fetch({ params: toolInput.params || {} });
				// Merge updates onto the fetched object
				entryToUpdate = { ...entryToUpdate, ...toolInput.entry_data };
				// The update method is on the fetched entry object
				return await entryToUpdate.update({ params: toolInput.params || {} });
			}

			default:
				console.warn(`Tool ${toolName} not found.`);
				return { error: `Tool ${toolName} not implemented.` };
		}
	} catch (error) {
		console.error(`Error executing tool ${toolName}:`, error);
		// Return a structured error message
		return {
			error: `Failed to execute tool ${toolName}`,
			details: error.message || String(error),
			...(error.errors && { contentstack_errors: error.errors }), // Include Contentstack specific errors if present
		};
	}
}

// New endpoint to get available models
app.get("/models", (req, res) => {
	try {
		const availableModels = {};
		
		// Add Anthropic models if API key is available
		if (ANTHROPIC_API_KEY) {
			Object.keys(ANTHROPIC_MODELS).forEach(modelId => {
				availableModels[modelId] = ANTHROPIC_MODELS[modelId];
			});
		}
		
		// Add OpenAI models if API key is available
		if (OPENAI_API_KEY) {
			Object.keys(OPENAI_MODELS).forEach(modelId => {
				availableModels[modelId] = OPENAI_MODELS[modelId];
			});
		}
		
		res.json({
			success: true,
			models: availableModels,
			defaultModel: DEFAULT_MODEL
		});
	} catch (error) {
		console.error("Error getting models:", error);
		res.status(500).json({
			success: false,
			error: "Failed to retrieve models",
			details: error.message
		});
	}
});

// Endpoint for chat functionality
app.post('/chat', upload.single('image'), async (req, res) => {
	try {
		console.log("Received chat request");

		// Get message from form data
		const message = req.body.message;
		const imageUrl = req.body.imageUrl; // Extract imageUrl from the request
		const modelId = req.body.model || DEFAULT_MODEL; // Get requested model or use default
		
		// Get model info
		const isAnthropicModel = ANTHROPIC_MODELS[modelId] !== undefined;
		const isOpenAIModel = OPENAI_MODELS[modelId] !== undefined;
		
		// Check if requested model is available
		if (isAnthropicModel && !ANTHROPIC_API_KEY) {
			return res.status(400).json({
				error: "Selected Anthropic model is not available. Anthropic API key is missing."
			});
		}
		
		if (isOpenAIModel && !OPENAI_API_KEY) {
			return res.status(400).json({
				error: "Selected OpenAI model is not available. OpenAI API key is missing."
			});
		}
		
		if (!isAnthropicModel && !isOpenAIModel) {
			return res.status(400).json({
				error: `Unknown model: ${modelId}`
			});
		}
		
		console.log(`Using model: ${modelId}`);
		
		// Get uploaded file if any
		const uploadedFile = req.file;
		console.log("Uploaded file:", uploadedFile ? uploadedFile.filename : "None");

		if (!message && !imageUrl && !uploadedFile) {
			return res.status(400).json({ error: "Message or image is required" });
		}

		console.log(
			`Received message: ${
				message ? message.substring(0, 100) : "[No text]"
			}...`,
		);
		console.log(`Received image URL: ${imageUrl ? "Yes" : "No"}`);
		console.log(`Received file upload: ${uploadedFile ? "Yes" : "No"}`);

		// Log the request for debugging
		const timestamp = new Date().toISOString().replace(/:/g, "-");
		const logPath = path.join(uploadsDir, `chat_request_${timestamp}.log`);
		fs.writeFileSync(
			logPath,
			JSON.stringify(
				{
					timestamp: new Date().toISOString(),
					message: message,
					hasImageUrl: !!imageUrl,
					hasUploadedFile: !!uploadedFile,
					model: modelId,
				},
				null,
				2,
			),
		);

		// Create SSE response
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");

		// Helper function to send SSE events
		const sendEvent = (eventType, data) => {
			res.write(`event: ${eventType}\n`);
			res.write(`data: ${JSON.stringify(data)}\n\n`);
		};

		// Process image content if any
		let base64Data = null;
		let mediaType = null;
		
		// Process the file if uploaded
		if (uploadedFile) {
			console.log("Processing uploaded file for chat message");
			try {
				// Read the file content
				const filePath = uploadedFile.path;
				const fileData = fs.readFileSync(filePath);
				base64Data = fileData.toString('base64');
				
				// Determine media type from file mimetype
				mediaType = uploadedFile.mimetype || 'image/png';
				
				console.log(`Successfully read uploaded file, size: ${fileData.length} bytes`);
			} catch (fileError) {
				console.error("Error processing uploaded file:", fileError);
				sendEvent("error", {
					error: "Failed to process uploaded file",
					details: fileError.message,
				});
				res.end();
				return;
			}
		}
		// If no file but imageUrl is provided
		else if (imageUrl) {
			console.log("Processing image URL for chat message");

			// If it's already a data URL
			if (imageUrl.startsWith("data:image/")) {
				console.log("Processing data URL for chat");
				mediaType = imageUrl.split(';')[0].split(':')[1] || 'image/png';
				base64Data = imageUrl.split(",")[1];
			} else if (imageUrl.startsWith("http")) {
				console.log("Processing HTTP URL for chat");
				try {
					// For HTTP URLs, fetch the image content
					const fetch = require("node-fetch");
					const response = await fetch(imageUrl);

					if (!response.ok) {
						throw new Error(
							`Failed to fetch image: ${response.status} ${response.statusText}`,
						);
					}

					// Get the image as buffer and convert to base64
					const imageBuffer = await response.buffer();
					base64Data = imageBuffer.toString("base64");
					
					// Determine media type from Content-Type header or default to image/png
					mediaType = response.headers.get('content-type') || 'image/png';

					console.log(
						`Successfully fetched and converted image from URL, size: ${imageBuffer.length} bytes`,
					);
				} catch (fetchError) {
					console.error("Error fetching image for chat:", fetchError);
					sendEvent("error", {
						error: "Failed to fetch image from URL",
						details: fetchError.message,
					});
					res.end();
					return;
				}
			} else {
				console.error(
					"Invalid image URL format for chat:",
					imageUrl.substring(0, 50),
				);
				sendEvent("error", {
					error: "Invalid image URL format",
					details: "The provided URL was not recognized as a valid format.",
				});
				res.end();
				return;
			}
		}

		// Define Contentstack tools
		const tools = [
			{
				name: "get_content_types",
				description:
					"Get all content types or a specific content type from Contentstack",
				input_schema: {
					type: "object",
					properties: {
						uid: {
							type: "string",
							description:
								"Optional: UID of the specific content type to fetch. If not provided, all content types will be returned.",
						},
					},
					required: [],
				},
			},
			{
				name: "create_content_type",
				description: "Create a new content type in Contentstack",
				input_schema: {
					type: "object",
					properties: {
						content_type_data: {
							type: "object",
							description:
								"Content type object with title, uid, schema, and options",
							properties: {
								title: { type: "string" },
								uid: { type: "string" },
								schema: { 
									type: "array",
									items: {
										type: "object",
										description: "Schema field definition"
									}
								},
								options: { type: "object" },
							},
							required: ["title", "uid", "schema"],
						},
					},
					required: ["content_type_data"],
				},
			},
			{
				name: "update_content_type",
				description: "Update an existing content type in Contentstack",
				input_schema: {
					type: "object",
					properties: {
						uid: {
							type: "string",
							description: "UID of the content type to update",
						},
						content_type: {
							type: "object",
							description: "Content type object with updated properties",
						},
					},
					required: ["uid", "content_type"],
				},
			},
			{
				name: "get_entries",
				description: "Get entries from a content type in Contentstack",
				input_schema: {
					type: "object",
					properties: {
						content_type_uid: {
							type: "string",
							description: "UID of the content type to fetch entries from",
						},
						query: {
							type: "object",
							description: "Optional: Query parameters for filtering entries",
						},
						limit: {
							type: "number",
							description: "Optional: Number of entries to fetch (default: 10)",
						},
						skip: {
							type: "number",
							description: "Optional: Number of entries to skip (default: 0)",
						},
					},
					required: ["content_type_uid"],
				},
			},
			{
				name: "create_entry",
				description: "Create a new entry in a content type in Contentstack",
				input_schema: {
					type: "object",
					properties: {
						content_type_uid: {
							type: "string",
							description: "UID of the content type to create an entry in",
						},
						entry: {
							type: "object",
							description: "Entry data object with all required fields",
						},
					},
					required: ["content_type_uid", "entry"],
				},
			},
		];

		// *** Handle Different AI Providers ***
		if (isAnthropicModel) {
			await handleAnthropicChat(modelId, message, base64Data, mediaType, tools, sendEvent, res);
		} else if (isOpenAIModel) {
			await handleOpenAIChat(modelId, message, base64Data, mediaType, tools, sendEvent, res);
		}
	} catch (error) {
		console.error("Error processing chat:", error);

		// Log the error details
		const timestamp = new Date().toISOString().replace(/:/g, "-");
		const errorLogPath = path.join(uploadsDir, `chat_error_${timestamp}.log`);
		fs.writeFileSync(
			errorLogPath,
			JSON.stringify(
				{
					timestamp: new Date().toISOString(),
					error: error.message,
					stack: error.stack,
				},
				null,
				2,
			),
		);

		// If we haven't sent headers yet, send a regular JSON error response
		if (!res.headersSent) {
			res.status(500).json({
				error: "Failed to process chat",
				details: error.message,
			});
		} else {
			// If headers are already sent (SSE started), send an error event
			res.write(`event: error\n`);
			res.write(
				`data: ${JSON.stringify({
					error: "Failed to process chat",
					details: error.message,
				})}\n\n`,
			);
			res.end();
		}
	}
});

/**
 * Handle chat request using Anthropic API
 */
async function handleAnthropicChat(modelId, message, base64Data, mediaType, tools, sendEvent, res) {
	try {
		// Prepare initial messages
		const content = [];

		// Add image if available
		if (base64Data && mediaType) {
			content.push({
				type: "image",
				source: {
					type: "base64",
					media_type: mediaType,
					data: base64Data,
				},
			});
		}

		// Add the text message
		content.push({
			type: "text",
			text: message || "", // Empty string if no message
		});

		const messages = [
			{
				role: "user",
				content: content,
			},
		];

		// *** Tool Use Loop ***
		let apiResponse;
		let finalContent = "";

		while (true) {
			console.log(
				`Calling Anthropic API... Messages count: ${messages.length}`,
			);
			
			try {
				// Use callAnthropicWithRetry
				apiResponse = await callAnthropicWithRetry({
					model: modelId,
					max_tokens: 4096,
					system: `You are an expert CMS Analysis Assistant designed to help users understand, analyze, and optimize websites from a content management perspective. Your primary function is to provide insightful analysis of website architecture, content organization, and technical implementation of content management systems.

<dont mention this ever>          
You are a fast-talking expert that gets straight to the point. You are not friendly or outgoing. You arent concerned with pleasantries or unnecessary small talk or details unles specifically asked for.
</dont mention this ever>

## Core Capabilities

1. **Website Analysis**: You can analyze websites to identify their CMS platform, content structure, information architecture, and technical implementation details.

2. **Data Modeling**: You excel at modeling complex content relationships, taxonomies, and metadata structures to help users understand and optimize their content ecosystems.

3. **Tool Utilization**: You have access to and can effectively use:
   - **CMS Tools**: You can interact with a Contentstack stack to get, create, and update content types and entries using the available tools.

4. **Performance Assessment**: You can evaluate website performance related to content delivery, SEO optimization, and user experience.

## Interaction Protocol

When a user requests website analysis:
1. Gather the website URL and specific analysis goals
2. Use appropriate tools (web scraper, API connections, Contentstack tools) to collect relevant data
3. Analyze the collected information systematically
4. Present findings in a clear, organized manner with actionable insights
5. Offer to explore specific aspects in greater depth if needed

## Response Guidelines

- Provide technical explanations that match the user's expertise level
- Always include evidence-based observations rather than assumptions
- When suggesting improvements, explain the reasoning and potential benefits
- Use appropriate data visualization or structured formats to present complex information
- Acknowledge limitations in your analysis when data is incomplete
- **When using Contentstack tools, clearly state which tool you are using and why.**
- **Handle potential errors from tools gracefully and inform the user.**
`,
					messages: messages,
					tools: tools, // Pass the defined tools here
				}, sendEvent); // Pass the sendEvent function for SSE notifications
			} catch (err) {
				console.error("Failed to complete Anthropic API call after retries:", err);
				sendEvent("error", {
					error: "Failed to complete chat request after multiple attempts",
					details: err.message,
				});
				res.end();
				return;
			}

			console.log(
				`Anthropic response stop_reason: ${apiResponse.stop_reason}`,
			);

			// Check if the response requires tool use
			if (apiResponse.stop_reason === "tool_use") {
				const toolUses = apiResponse.content.filter(
					(block) => block.type === "tool_use",
				);

				// Add the assistant's tool use request message to history
				messages.push({
					role: apiResponse.role,
					content: apiResponse.content,
				});

				// Send tool usage events to client
				for (const toolUse of toolUses) {
					const toolName = toolUse.name;
					sendEvent("tool", {
						name: toolName,
						status: "started",
						description: `Using tool: ${toolName}`,
					});
				}

				// Execute tools and gather results
				const toolResults = [];
				for (const toolUse of toolUses) {
					const toolName = toolUse.name;
					const toolInput = toolUse.input;
					const toolUseId = toolUse.id;

					try {
						const result = await executeTool(toolName, toolInput);

						// Send tool completion event
						sendEvent("tool", {
							name: toolName,
							status: "completed",
							description: `Tool ${toolName} completed successfully`,
						});

						toolResults.push({
							type: "tool_result",
							tool_use_id: toolUseId,
							content: JSON.stringify(result), // Send result back as a JSON string
						});
					} catch (toolError) {
						console.error(`Error executing tool ${toolName}:`, toolError);

						// Send tool error event
						sendEvent("tool", {
							name: toolName,
							status: "failed",
							description: `Tool ${toolName} failed: ${toolError.message}`,
						});

						toolResults.push({
							type: "tool_result",
							tool_use_id: toolUseId,
							content: JSON.stringify({ error: toolError.message }),
							is_error: true,
						});
					}
				}

				// Add the tool results to the message history
				messages.push({
					role: "user", // Role is 'user' for tool_result messages
					content: toolResults,
				});
				// Continue the loop to send results back to Anthropic
			} else if (apiResponse.stop_reason === "end_turn") {
				// If no tool use is needed, break the loop
				break;
			} else {
				// Handle other stop reasons if necessary (e.g., 'max_tokens')
				console.warn(`Unexpected stop_reason: ${apiResponse.stop_reason}`);
				break;
			}
		} // End of while loop

		// Extract the final text content from the response
		finalContent = apiResponse.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n");

		console.log(
			`Chat response successful. Response length: ${finalContent.length} chars`,
		);

		// Send the final content event
		sendEvent("complete", {
			success: true,
			content: finalContent,
		});

		// End the response
		res.end();
	} catch (apiError) {
		console.error("Error in Anthropic API communication:", apiError);
		sendEvent("error", {
			error: "Error communicating with Anthropic AI service",
			details: apiError.message,
		});
		res.end();
	}
}

/**
 * Handle chat request using OpenAI API
 */
async function handleOpenAIChat(modelId, message, base64Data, mediaType, tools, sendEvent, res) {
	try {
		// Prepare messages for OpenAI
		const messages = [];
		
		// Add system message
		messages.push({
			role: "system",
			content: `You are an expert CMS Analysis Assistant designed to help users understand, analyze, and optimize websites from a content management perspective. Your primary function is to provide insightful analysis of website architecture, content organization, and technical implementation of content management systems.

You are a fast-talking expert that gets straight to the point. You are not friendly or outgoing. You aren't concerned with pleasantries or unnecessary small talk or details unless specifically asked for.

## Core Capabilities

1. **Website Analysis**: You can analyze websites to identify their CMS platform, content structure, information architecture, and technical implementation details.

2. **Data Modeling**: You excel at modeling complex content relationships, taxonomies, and metadata structures to help users understand and optimize their content ecosystems.

3. **Tool Utilization**: You have access to and can effectively use:
   - **CMS Tools**: You can interact with a Contentstack stack to get, create, and update content types and entries using the available tools.

4. **Performance Assessment**: You can evaluate website performance related to content delivery, SEO optimization, and user experience.`
		});
		
		// Build user message content
		const userMessage = { role: "user", content: [] };
		
		// Add image if available
		if (base64Data && mediaType) {
			userMessage.content.push({
				type: "image_url",
				image_url: {
					url: `data:${mediaType};base64,${base64Data}`
				}
			});
		}
		
		// Add text message
		userMessage.content.push({
			type: "text", 
			text: message || ""
		});
		
		messages.push(userMessage);
		
		// Convert Anthropic tool format to OpenAI function calling format
		const openAIFunctions = tools.map(tool => ({
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.input_schema
			}
		}));
		
		// Call OpenAI API
		console.log(`Calling OpenAI API with model ${modelId}...`);
		
		try {
			const completion = await callOpenAIWithRetry({
				model: modelId,
				messages: messages,
				tools: openAIFunctions,
				temperature: 0.7,
				max_tokens: 4096,
				tool_choice: "auto"
			}, sendEvent);
			
			console.log("OpenAI response received");
			
			// Handle tool calls
			let currentResponse = completion;
			const fullMessages = [...messages]; // Track all messages for subsequent calls
						
			// While the model wants to call tools
			while (currentResponse.choices[0].message.tool_calls) {
				// Add assistant response to message history
				fullMessages.push(currentResponse.choices[0].message);
				
				const toolCalls = currentResponse.choices[0].message.tool_calls;
				
				// Send tool usage events to client
				for (const toolCall of toolCalls) {
					const functionName = toolCall.function.name;
					sendEvent("tool", {
						name: functionName,
						status: "started",
						description: `Using tool: ${functionName}`,
					});
				}
				
				// Execute each tool call
				const toolResults = [];
				for (const toolCall of toolCalls) {
					const functionName = toolCall.function.name;
					const functionArgs = JSON.parse(toolCall.function.arguments);
					
					try {
						const result = await executeTool(functionName, functionArgs);
						
						// Send completion event
						sendEvent("tool", {
							name: functionName,
							status: "completed",
							description: `Tool ${functionName} completed successfully`,
						});
						
						// Add result to messages
						toolResults.push({
							role: "tool",
							tool_call_id: toolCall.id,
							name: functionName,
							content: JSON.stringify(result)
						});
					} catch (toolError) {
						console.error(`Error executing tool ${functionName}:`, toolError);
						
						// Send tool error event
						sendEvent("tool", {
							name: functionName,
							status: "failed",
							description: `Tool ${functionName} failed: ${toolError.message}`,
						});
						
						// Add error result
						toolResults.push({
							role: "tool",
							tool_call_id: toolCall.id,
							name: functionName,
							content: JSON.stringify({ error: toolError.message })
						});
					}
				}
				
				// Add all tool results to messages
				fullMessages.push(...toolResults);
				
				// Call API again with updated messages
				currentResponse = await callOpenAIWithRetry({
					model: modelId,
					messages: fullMessages,
					tools: openAIFunctions,
					temperature: 0.7,
					max_tokens: 4096,
				}, sendEvent);
			}
			
			// Extract final content
			const finalContent = currentResponse.choices[0].message.content;
			
			console.log(`Chat response successful. Response length: ${finalContent.length} chars`);
			
			// Send final response
			sendEvent("complete", {
				success: true,
				content: finalContent,
			});
			
			// End the response
			res.end();
		} catch (err) {
			console.error("Failed to complete OpenAI API call after retries:", err);
			sendEvent("error", {
				error: "Failed to complete chat request after multiple attempts",
				details: err.message,
			});
			res.end();
		}
	} catch (apiError) {
		console.error("Error in OpenAI API communication:", apiError);
		sendEvent("error", {
			error: "Error communicating with OpenAI service",
			details: apiError.message,
		});
		res.end();
	}
}

// Start the server
app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
	console.log(`Images will be available at http://localhost:${PORT}/images/`);
	
	// Log available models
	const anthropicModelsAvailable = ANTHROPIC_API_KEY ? Object.keys(ANTHROPIC_MODELS).length : 0;
	const openaiModelsAvailable = OPENAI_API_KEY ? Object.keys(OPENAI_MODELS).length : 0;
	console.log(`Available models: ${anthropicModelsAvailable} Anthropic models, ${openaiModelsAvailable} OpenAI models`);
});

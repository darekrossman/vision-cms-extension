const fs = require("fs");
const path = require("path");

const sourceDir = path.join(__dirname, "../public");
const targetDir = path.join(__dirname, "../dist");

// Create dist directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
	fs.mkdirSync(targetDir);
}

// Copy files from public to dist
function copyFiles(dir) {
	const files = fs.readdirSync(dir);
	files.forEach((file) => {
		const sourcePath = path.join(dir, file);
		const targetPath = path.join(
			targetDir,
			path.relative(sourceDir, sourcePath),
		);

		if (fs.lstatSync(sourcePath).isDirectory()) {
			if (!fs.existsSync(targetPath)) {
				fs.mkdirSync(targetPath, { recursive: true });
			}
			copyFiles(sourcePath);
		} else {
			fs.copyFileSync(sourcePath, targetPath);
		}
	});
}

copyFiles(sourceDir);

// Additionally copy manifest.json from project root to dist
const manifestSource = path.join(__dirname, "../manifest.json");
const manifestTarget = path.join(targetDir, "manifest.json");
if (fs.existsSync(manifestSource)) {
	fs.copyFileSync(manifestSource, manifestTarget);
	console.log("Copied manifest.json to dist directory");
} else {
	console.error("manifest.json not found in project root directory!");
}

console.log("Assets copied to dist directory successfully");

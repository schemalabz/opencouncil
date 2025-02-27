import fs from "fs";
import path from "path";
import axios from "axios";

// Configuration
const BASE_URL = "http://localhost:3000";
const OUTPUT_DIR = path.join(process.cwd(), "og-previews");
const INDEX_FILE = path.join(OUTPUT_DIR, "index.html");

// Define test case interfaces
interface BaseTestCase {
    id: string;
    description?: string;
}

interface TestCases {
    city: BaseTestCase[];
    meeting: BaseTestCase[];
    subject: BaseTestCase[];
    [key: string]: BaseTestCase[];
}

// Define test cases
const testCases: TestCases = {
    // For cities, just the cityId
    city: [
        { id: "athens" },
        { id: "chania" },
        // Add more cities as needed
    ],

    // For meetings, use the format "cityId/meetingId"
    meeting: [
        { id: "athens/feb12_2025" },
        { id: "chania/feb12_2025" },
        // Add more meetings as needed
    ],

    // For subjects, use the format "cityId/meetingId/subjectId"
    subject: [
        { id: "athens/feb12_2025/cm72gk9gd03itgrjw0yksppby", description: "One line title" },
        { id: "athens/feb12_2025/cm72gka3y03w4grjwtcduixaa", description: "Small title" },
        { id: "athens/feb12_2025/cm72gk9ii03k4grjwa45cyiia", description: "With location" },
        { id: "chania/feb12_2025/cm7cbuymi0hdmw8skmfhjza6f", description: "Two lines title" },
        // Add more subject edge cases as needed
    ],

    // Add more categories as needed
};

// Define PathGenerator interface
interface PathGenerators {
    [key: string]: (id: string) => string;
}

// Category-specific path generators
const pathGenerators: PathGenerators = {
    city: (id: string) => `/api/og?cityId=${id}`,
    meeting: (id: string) => {
        const [cityId, meetingId] = id.split("/");
        return `/api/og?cityId=${cityId}&meetingId=${meetingId}`;
    },
    subject: (id: string) => {
        const [cityId, meetingId, subjectId] = id.split("/");
        return `/${cityId}/${meetingId}/subjects/${subjectId}/opengraph-image-1jfjlu`;
    },
    // Add more generators as needed
};

/**
 * Ensures the output directory exists
 */
function ensureOutputDir(): void {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
}

// Define Route interface
interface Route {
    name: string;
    path: string;
}

// Define Routes type
type Routes = Record<string, Route[]>;

/**
 * Processes test cases into routes
 */
function getRoutesFromTestCases(): Routes {
    const routes: Routes = {};

    // Process each category of test cases
    for (const [category, cases] of Object.entries(testCases)) {
        const pathGenerator = pathGenerators[category];

        if (!pathGenerator) {
            console.warn(`No path generator found for category: ${category}`);
            continue;
        }

        routes[category] = cases.map(testCase => {
            // Create a human-readable name based on the id if description is not provided
            let name = testCase.description;
            if (!name) {
                // Format the ID in a more readable way
                if (category === "city") {
                    name = `City: ${testCase.id.charAt(0).toUpperCase() + testCase.id.slice(1)}`;
                } else if (category === "meeting") {
                    const [cityId, meetingId] = testCase.id.split("/");
                    name = `Meeting: ${cityId.charAt(0).toUpperCase() + cityId.slice(1)} - ${meetingId}`;
                } else if (category === "subject") {
                    const [cityId, meetingId, subjectId] = testCase.id.split("/");
                    name = `Subject: ${cityId.charAt(0).toUpperCase() + cityId.slice(1)} - ${meetingId} - ${subjectId}`;
                } else {
                    name = `${category}: ${testCase.id}`;
                }
            }

            return {
                name: name,
                path: pathGenerator(testCase.id),
            };
        });
    }

    return routes;
}

/**
 * Generates a clean filename from a path
 */
function getFilenameFromPath(path: string): string {
    return (
        path
            .replace(/^\//g, "")
            .replace(/\//g, "_")
            .replace(/[\?&=]/g, "_") + ".png"
    );
}

// Define ImageInfo interface
interface ImageInfo {
    name: string;
    path: string;
    filename: string;
    timestamp: string;
}

// Define Images type
type Images = Record<string, ImageInfo[]>;

/**
 * Creates an HTML index file for easy viewing of generated images
 */
function createIndexFile(images: Images): void {
    // Generate the tabs HTML
    const tabsHtml = Object.keys(images)
        .map(
            (category, index) =>
                `<button 
      class="tab-button${index === 0 ? " active" : ""}" 
      onclick="openTab(event, '${category}')"
    >
      ${category.charAt(0).toUpperCase() + category.slice(1)} (${images[category].length})
    </button>`,
        )
        .join("");

    // Generate the tab content HTML
    const tabContentHtml = Object.entries(images)
        .map(
            ([category, categoryImages], index) => `
    <div id="${category}" class="tab-content" style="display: ${index === 0 ? "block" : "none"}">
      <div class="gallery">
        ${categoryImages
            .map(
                image => `
          <div class="image-card">
            <img src="${image.filename}" alt="${image.name}">
            <div class="image-info">
              <div class="image-name">${image.name}</div>
              <div class="image-path">${image.path}</div>
              <div class="image-timestamp">Generated: ${image.timestamp}</div>
            </div>
          </div>
        `,
            )
            .join("")}
      </div>
    </div>
  `,
        )
        .join("");

    // Total image count
    const totalImageCount = Object.values(images).reduce((total, categoryImages) => total + categoryImages.length, 0);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>OG Image Previews</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 {
      text-align: center;
      margin-bottom: 10px;
    }
    .timestamp {
      text-align: center;
      color: #666;
      margin-bottom: 20px;
    }
    .tab-container {
      overflow: hidden;
      background-color: #ffffff;
      border-radius: 8px 8px 0 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .tab-button {
      background-color: inherit;
      float: left;
      border: none;
      outline: none;
      cursor: pointer;
      padding: 14px 16px;
      transition: 0.3s;
      font-size: 16px;
      color: #4b5563;
      border-bottom: 2px solid transparent;
    }
    .tab-button:hover {
      background-color: #f3f4f6;
      color: #1f2937;
    }
    .tab-button.active {
      background-color: #f9fafb;
      color: #0070f3;
      border-bottom: 2px solid #0070f3;
      font-weight: 500;
    }
    .tab-content {
      display: none;
      padding: 20px;
      background-color: #ffffff;
      border-radius: 0 0 8px 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      margin-bottom: 20px;
    }
    .gallery {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
    }
    .image-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .image-card img {
      width: 100%;
      display: block;
      border-bottom: 1px solid #eee;
    }
    .image-info {
      padding: 15px;
    }
    .image-name {
      font-weight: bold;
      margin-bottom: 8px;
      font-size: 18px;
    }
    .image-path {
      color: #666;
      font-family: monospace;
      font-size: 14px;
      word-break: break-all;
    }
    .image-timestamp {
      color: #888;
      font-size: 12px;
      margin-top: 8px;
    }
    .refresh-button {
      display: block;
      margin: 20px auto;
      padding: 10px 20px;
      background: #0070f3;
      color: white;
      border: none;
      border-radius: 5px;
      font-size: 16px;
      cursor: pointer;
    }
    .refresh-button:hover {
      background: #0051a2;
    }
    .command {
      text-align: center;
      background: #1e293b;
      color: #e2e8f0;
      padding: 10px;
      border-radius: 5px;
      margin: 15px auto;
      max-width: 600px;
      font-family: monospace;
    }
    .summary {
      text-align: center;
      margin-bottom: 15px;
      color: #4b5563;
    }
  </style>
</head>
<body>
  <h1>OG Image Previews</h1>
  <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
  <div class="summary">Total: ${totalImageCount} images across ${Object.keys(images).length} categories</div>
  <div class="command">npm run test:og</div>
  
  <!-- Tab navigation -->
  <div class="tab-container">
    ${tabsHtml}
  </div>
  
  <!-- Tab content -->
  ${tabContentHtml}
  
  <button class="refresh-button" onclick="window.location.reload()">Refresh Page</button>

  <script>
    function openTab(evt, categoryName) {
      // Hide all tab content
      const tabContent = document.getElementsByClassName("tab-content");
      for (let i = 0; i < tabContent.length; i++) {
        tabContent[i].style.display = "none";
      }
      
      // Remove "active" class from all tab buttons
      const tabButtons = document.getElementsByClassName("tab-button");
      for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].className = tabButtons[i].className.replace(" active", "");
      }
      
      // Show the current tab and add "active" class to the button
      document.getElementById(categoryName).style.display = "block";
      evt.currentTarget.className += " active";
    }
  </script>
</body>
</html>
  `;

    fs.writeFileSync(INDEX_FILE, html);
}

/**
 * Main function to fetch and save all OG images
 */
async function fetchOgImages(): Promise<void> {
    ensureOutputDir();

    console.log("Starting to fetch OG images...");

    // Process test cases into routes
    const routes = getRoutesFromTestCases();

    const images: Images = {};

    // Initialize image arrays for each category
    for (const category of Object.keys(routes)) {
        images[category] = [];
    }

    // Process all routes by category
    for (const [category, categoryRoutes] of Object.entries(routes)) {
        console.log(`\nProcessing category: ${category}`);

        for (const route of categoryRoutes) {
            const url = `${BASE_URL}${route.path}`;
            const filename = getFilenameFromPath(route.path);
            const outputPath = path.join(OUTPUT_DIR, filename);

            console.log(`  Fetching: ${route.name} (${url})`);

            try {
                // Fetch image directly using axios
                const response = await axios({
                    method: "GET",
                    url,
                    responseType: "arraybuffer",
                    timeout: 30000,
                    headers: {
                        // Set a user agent to avoid any blocking
                        "User-Agent": "Mozilla/5.0 OpenCouncil OG Image Tester",
                    },
                });

                // Check if we got an image back
                const contentType = response.headers["content-type"];
                if (!contentType || !contentType.includes("image")) {
                    throw new Error(`Not an image! Got content-type: ${contentType}`);
                }

                // Save image to file
                fs.writeFileSync(outputPath, response.data);

                const timestamp = new Date().toLocaleString();
                console.log(`  ✅ Saved to: ${outputPath}`);

                images[category].push({
                    name: route.name,
                    path: route.path,
                    filename: filename,
                    timestamp,
                });
            } catch (err: any) {
                console.error(`  ❌ Error fetching ${url}:`, err.message);
            }
        }
    }

    // Create index HTML file
    createIndexFile(images);

    // Count total images
    const totalCount = Object.values(images).reduce((sum, arr) => sum + arr.length, 0);

    console.log(`\n✨ Generated index file: ${INDEX_FILE}`);
    console.log(`✨ Generated ${totalCount} images across ${Object.keys(images).length} categories`);
    console.log(`✨ View your OG images by opening: file://${INDEX_FILE}`);
}

// Run the script
if (require.main === module) {
    fetchOgImages().catch(console.error);
}

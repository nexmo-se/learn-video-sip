import { Vonage } from "@vonage/server-sdk";

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

const vonage = new Vonage({
  applicationId: process.env.API_APPLICATION_ID,
  privateKey: process.env.PRIVATE_KEY,
});

// Serve static files from the React build directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildPath = path.join(__dirname, "build");
app.use(express.static(buildPath));

// Serve React app for all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

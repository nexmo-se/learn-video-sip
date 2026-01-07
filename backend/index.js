import { Vonage } from "@vonage/server-sdk";
import { Auth } from "@vonage/auth";
import express from "express";
import axios from "axios";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();

// Initialize Vonage with credentials from environment variables
const vonageApiKey = process.env.VONAGE_API_KEY;
const vonageApiSecret = process.env.VONAGE_API_SECRET;
const vonageApplicationId = process.env.VONAGE_APPLICATION_ID;
const vonagePrivateKey = process.env.VONAGE_PRIVATE_KEY;

let vonage = null;

if (vonageApiKey && vonageApiSecret) {
  try {
    const auth = new Auth({
      apiKey: vonageApiKey,
      apiSecret: vonageApiSecret,
      applicationId: vonageApplicationId,
      privateKey: vonagePrivateKey,
    });
    vonage = new Vonage(auth);
    console.log("✓ Vonage SDK initialized successfully");
    console.log("Available properties:", Object.keys(vonage));
  } catch (error) {
    console.error("✗ Failed to initialize Vonage SDK:", error.message);
  }
} else {
  console.warn("⚠ Vonage credentials not found in environment variables");
}

const frontendUrl = process.env.FRONTEND_URL || "*"; // fallback for local/dev

app.use(
  cors({
    origin: frontendUrl,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// API Routes
app.get("/api/vonage/test", async (req, res) => {
  try {
    if (!vonage) {
      return res.status(500).json({
        success: false,
        error:
          "Vonage SDK not initialized. Please check your environment variables.",
        requiredEnvVars: [
          "VONAGE_API_KEY",
          "VONAGE_API_SECRET",
          "VONAGE_APPLICATION_ID (optional)",
          "VONAGE_PRIVATE_KEY (optional)",
        ],
      });
    }

    res.json({
      success: true,
      message: "Vonage SDK is initialized and working!",
      timestamp: new Date().toISOString(),
      data: {
        sdkInitialized: true,
        availableProperties: Object.keys(vonage),
        credentials: {
          apiKeySet: !!vonageApiKey,
          apiSecretSet: !!vonageApiSecret,
          applicationIdSet: !!vonageApplicationId,
          privateKeySet: !!vonagePrivateKey,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || "No additional details",
    });
  }
});

app.get("/api/first", async (req, res) => {
  try {
    res.json({
      success: true,
      message: "First endpoint response",
      timestamp: new Date().toISOString(),
      data: {
        route: "first",
        description: "This is the first API endpoint",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/second", async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Second endpoint response",
      timestamp: new Date().toISOString(),
      data: {
        route: "second",
        description: "This is the second API endpoint",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

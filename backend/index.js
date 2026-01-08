import { Vonage } from "@vonage/server-sdk";
import { Auth } from "@vonage/auth";
import express from "express";
import axios from "axios";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();

// Initialize Vonage with credentials from environment variables
const vonageApiKey = process.env.VONAGE_API_KEY;
const vonageApiSecret = process.env.VONAGE_API_SECRET;
const vonageApplicationId = process.env.VONAGE_APPLICATION_ID;
const vonagePrivateKeyPath =
  process.env.VONAGE_PRIVATE_KEY || process.env.VONAGE_PRIVATE_KEY_PATH;
const lvn = process.env.LVN;

let vonage = null;
let privateKeyContent = null;

// Read private key from file if path is provided
if (vonagePrivateKeyPath) {
  try {
    const keyPath = path.resolve(__dirname, vonagePrivateKeyPath);
    console.log("Attempting to load private key from:", keyPath);
    privateKeyContent = fs.readFileSync(keyPath, "utf8");
    console.log("✓ Private key loaded from file");
    console.log("Private key length:", privateKeyContent.length);
  } catch (error) {
    console.error("✗ Failed to read private key file:", error.message);
  }
} else {
  console.warn("⚠ No private key path specified in environment variables");
}

if (vonageApplicationId && privateKeyContent) {
  try {
    console.log("Initializing Vonage SDK with:");
    console.log("- Application ID:", vonageApplicationId);
    console.log("- Has Private Key:", !!privateKeyContent);

    const auth = new Auth({
      applicationId: vonageApplicationId,
      privateKey: privateKeyContent,
    });
    vonage = new Vonage(auth);
    console.log("✓ Vonage SDK initialized successfully");
    console.log("Available properties:", Object.keys(vonage));
  } catch (error) {
    console.error("✗ Failed to initialize Vonage SDK:", error.message);
  }
} else {
  console.warn("⚠ Vonage Video API credentials not found");
  if (!vonageApplicationId) console.warn("  Missing: VONAGE_APPLICATION_ID");
  if (!privateKeyContent) console.warn("  Missing: VONAGE_PRIVATE_KEY");
}

// Store active video sessions
const activeSessions = new Map();

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

// Create a new Video API session
app.post("/api/video/session", async (req, res) => {
  try {
    if (!vonage) {
      return res
        .status(500)
        .json({ success: false, error: "Vonage SDK not initialized" });
    }

    const { archiveMode = "manual" } = req.body;

    const session = await vonage.video.createSession({
      archiveMode,
      mediaMode: "routed",
    });

    // Store session info
    activeSessions.set(session.sessionId, {
      sessionId: session.sessionId,
      created: new Date(),
      sipConnections: [],
    });

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        applicationId: vonageApplicationId,
      },
    });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate a token for a video session
app.post("/api/video/token", async (req, res) => {
  try {
    if (!vonage) {
      return res
        .status(500)
        .json({ success: false, error: "Vonage SDK not initialized" });
    }

    const { sessionId, role = "publisher", data = "" } = req.body;

    if (!sessionId) {
      return res
        .status(400)
        .json({ success: false, error: "sessionId is required" });
    }

    console.log("Generating token for:");
    console.log("- Session ID:", sessionId);
    console.log("- Application ID:", vonageApplicationId);
    console.log("- Has Private Key:", !!privateKeyContent);

    const token = vonage.video.generateClientToken(sessionId, {
      role,
      data,
      expireTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    });

    console.log("✓ Token generated, length:", token.length);

    res.json({
      success: true,
      data: {
        token,
        sessionId,
        apiKey: vonageApplicationId,
      },
    });
  } catch (error) {
    console.error("Error generating token:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dial a SIP URI to connect phone call to video session
app.post("/api/video/dial", async (req, res) => {
  try {
    if (!vonage) {
      return res
        .status(500)
        .json({ success: false, error: "Vonage SDK not initialized" });
    }

    const { sessionId, token } = req.body;

    if (!sessionId || !token) {
      return res.status(400).json({
        success: false,
        error: "sessionId and token are required",
      });
    }

    if (!lvn) {
      return res.status(500).json({
        success: false,
        error: "LVN not configured in environment variables",
      });
    }

    // Create SIP dial request
    const sipUri = `sip:${lvn}@sip.nexmo.com`;

    const dialResult = await vonage.video.initiateSIPCall(sessionId, token, {
      sip: {
        uri: sipUri,
        from: lvn,
        headers: {},
        secure: false,
      },
    });

    // Track SIP connection
    if (activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      session.sipConnections.push({
        connectionId: dialResult.connectionId,
        streamId: dialResult.streamId,
        sipUri,
        created: new Date(),
      });
    }

    res.json({
      success: true,
      data: {
        connectionId: dialResult.connectionId,
        streamId: dialResult.streamId,
        message: "SIP call initiated to LVN: " + lvn,
      },
    });
  } catch (error) {
    console.error("Error dialing SIP:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || "No additional details",
    });
  }
});

// Get session info
app.get("/api/video/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook endpoint for SIP events
app.post("/api/webhooks/sip", async (req, res) => {
  try {
    console.log("SIP Webhook received:", JSON.stringify(req.body, null, 2));

    const { event, sessionId, connectionId, streamId } = req.body;

    // Handle different SIP events
    switch (event) {
      case "connectionCreated":
        console.log(`✓ SIP Connection created: ${connectionId}`);
        break;
      case "streamCreated":
        console.log(`✓ SIP Stream created: ${streamId}`);
        break;
      case "connectionDestroyed":
        console.log(`✓ SIP Connection destroyed: ${connectionId}`);
        break;
      default:
        console.log(`Event received: ${event}`);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get LVN information
app.get("/api/sip/lvn", async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        lvn: lvn || "Not configured",
        dialInstructions: lvn
          ? `Dial ${lvn} to join the video session`
          : "LVN not configured in environment variables",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
  console.log(`LVN configured: ${lvn || "Not set"}`);
});

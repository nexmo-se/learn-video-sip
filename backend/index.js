import { Vonage } from "@vonage/server-sdk";
import { Auth } from "@vonage/auth";
import { tokenGenerate } from "@vonage/jwt";
import { Conversation, NCCOBuilder, Talk } from "@vonage/voice";
import { Video } from "@vonage/video";
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

// Video API credentials
const vonageVideoApplicationId = process.env.VONAGE_VIDEO_APPLICATION_ID;
const vonageVideoPrivateKey =
  process.env.VONAGE_VIDEO_PRIVATE_KEY || process.env.VONAGE_VIDEO_PRIVATE_KEY;

// Voice API credentials
const vonageVoiceApplicationId = process.env.VONAGE_VOICE_APPLICATION_ID;
const vonageVoicePrivateKey = process.env.VONAGE_VOICE_PRIVATE_KEY;

const lvn = process.env.LVN;
const conferenceNumber = process.env.CONFERENCE_NUMBER || lvn;
const defaultVideoRoom = process.env.DEFAULT_VIDEO_ROOM || "main-conference";
const sipTrunkDomain = process.env.VONAGE_SIP_TRUNK_DOMAIN;
const publicWebhookUrl = process.env.PUBLIC_WEBHOOK_URL;

// For Outbound SIP calls from Voice API to Video API
const sipTrunkUsername = process.env.VONAGE_SIP_USERNAME;
const sipTrunkPassword = process.env.VONAGE_SIP_PASSWORD;

let vonage = null;
let vonageVoice = null;
let vonageVideo = null;
let privateKeyContent = null;
let voicePrivateKeyContent = null;

// Read Video and Voice API private key files
try {
  if (vonageVideoPrivateKey) {
    // Resolve file path relative to __dirname (backend directory)
    const videoKeyPath = vonageVideoPrivateKey.startsWith("/")
      ? vonageVideoPrivateKey
      : path.join(__dirname, vonageVideoPrivateKey);

    if (fs.existsSync(videoKeyPath)) {
      privateKeyContent = fs.readFileSync(videoKeyPath, "utf8");
      console.log("✓ Loaded Video API private key from:", videoKeyPath);
    } else {
      // Treat as raw key content if file doesn't exist
      privateKeyContent = vonageVideoPrivateKey;
      console.log("✓ Loaded Video API private key from environment variable");
    }
  } else {
    console.warn("⚠ No Video API private key path specified");
  }

  if (vonageVoicePrivateKey) {
    // Resolve file path relative to __dirname (backend directory)
    const voiceKeyPath = vonageVoicePrivateKey.startsWith("/")
      ? vonageVoicePrivateKey
      : path.join(__dirname, vonageVoicePrivateKey);

    if (fs.existsSync(voiceKeyPath)) {
      voicePrivateKeyContent = fs.readFileSync(voiceKeyPath, "utf8");
      console.log("✓ Loaded Voice API private key from:", voiceKeyPath);
    } else {
      // Treat as raw key content if file doesn't exist
      voicePrivateKeyContent = vonageVoicePrivateKey;
      console.log("✓ Loaded Voice API private key from environment variable");
    }
  } else {
    console.warn("⚠ No Voice API private key path specified");
  }
} catch (error) {
  console.error("✗ Failed to read private key files:", error.message);
}

// Initialize Video API SDK
if (vonageVideoApplicationId && privateKeyContent) {
  try {
    console.log("Initializing Vonage Video API SDK with:");
    console.log("- Application ID:", vonageVideoApplicationId);
    console.log("- Has Private Key:", !!privateKeyContent);

    vonageVideo = new Video({
      applicationId: vonageVideoApplicationId,
      privateKey: privateKeyContent,
    });
    console.log("✓ Vonage Video API SDK initialized successfully");
  } catch (error) {
    console.error(
      "✗ Failed to initialize Vonage Video API SDK:",
      error.message
    );
  }
} else {
  console.warn("⚠ Vonage Video API credentials not found");
  if (!vonageVideoApplicationId)
    console.warn("  Missing: VONAGE_VIDEO_APPLICATION_ID");
  if (!privateKeyContent) console.warn("  Missing: VONAGE_VIDEO_PRIVATE_KEY");
}

// Initialize Voice API SDK
if (vonageVoiceApplicationId && voicePrivateKeyContent) {
  try {
    console.log("Initializing Vonage Voice API SDK with:");
    console.log("- Voice Application ID:", vonageVoiceApplicationId);
    console.log("- Has Private Key:", !!voicePrivateKeyContent);

    const voiceAuth = new Auth({
      applicationId: vonageVoiceApplicationId,
      privateKey: voicePrivateKeyContent,
    });
    vonageVoice = new Vonage(voiceAuth);
    console.log("✓ Vonage Voice API SDK initialized successfully");
  } catch (error) {
    console.error(
      "✗ Failed to initialize Vonage Voice API SDK:",
      error.message
    );
  }
} else {
  console.warn("⚠ Vonage Voice API credentials not found");
  if (!vonageVoiceApplicationId)
    console.warn("  Missing: VONAGE_VOICE_APPLICATION_ID");
  if (!voicePrivateKeyContent)
    console.warn("  Missing: VONAGE_VOICE_PRIVATE_KEY");
}

// Store active video sessions and call mappings
const activeSessions = new Map();
const callMappings = new Map(); // Maps Voice call UUID -> Video session info
const roomSessions = new Map(); // Maps room name -> Video session ID

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
    if (!vonageVideo) {
      return res
        .status(500)
        .json({ success: false, error: "Vonage Video SDK not initialized" });
    }

    const { archiveMode = "manual" } = req.body;

    const session = await vonageVideo.createSession({
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
        applicationId: vonageVideoApplicationId,
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
    if (!vonageVideo) {
      return res
        .status(500)
        .json({ success: false, error: "Vonage Video SDK not initialized" });
    }

    const { sessionId, role = "publisher", data = "" } = req.body;

    if (!sessionId) {
      return res
        .status(400)
        .json({ success: false, error: "sessionId is required" });
    }

    console.log("Generating token for:");
    console.log("- Session ID:", sessionId);
    console.log("- Application ID:", vonageVideoApplicationId);
    console.log("- Has Private Key:", !!privateKeyContent);

    const token = vonageVideo.generateClientToken(sessionId, {
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
        apiKey: vonageVideoApplicationId,
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
    if (!vonageVideo) {
      return res
        .status(500)
        .json({ success: false, error: "Vonage Video SDK not initialized" });
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

    const dialResult = await vonageVideo.initiateSIPCall(sessionId, token, {
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

// Inbound SIP call handler - simulates an inbound call for testing
// In production, Vonage would call your webhook endpoint instead
app.post("/api/video/sip-inbound", async (req, res) => {
  try {
    // Log the raw webhook payload from Vonage for debugging
    console.log("\n[SIP Webhook] Received incoming call webhook");
    console.log("[SIP Webhook] Raw body:", JSON.stringify(req.body, null, 2));

    // Handle both custom format (from test script) and Vonage's format
    let sessionId = req.body.sessionId || req.body.session_id;
    let inboundLvn = req.body.lvn || req.body.to;
    let callerPhone = req.body.callerPhone || req.body.from;

    console.log("[SIP Webhook] Parsed values:");
    console.log(`  - Session ID: ${sessionId}`);
    console.log(`  - Caller: ${callerPhone}`);
    console.log(`  - LVN: ${inboundLvn}`);

    if (!sessionId) {
      console.error("[SIP Webhook] ❌ Missing Session ID");
      return res.status(400).json({
        success: false,
        error: "Session ID required",
      });
    }

    if (!vonageVideo) {
      console.error("[SIP Webhook] ❌ Vonage Video SDK not initialized");
      return res.status(500).json({
        success: false,
        error: "Vonage Video SDK not initialized",
      });
    }

    console.log(
      `\n[SIP Inbound] ✓ Call from ${callerPhone} to LVN ${
        inboundLvn || "N/A"
      } on session ${sessionId}`
    );

    // Generate a token for the SIP caller with publisher role
    // This allows them to both publish audio and receive others' audio
    const sipToken = vonageVideo.generateClientToken(sessionId, {
      role: "publisher",
      data: JSON.stringify({
        type: "sip_caller",
        phone: callerPhone,
        timestamp: new Date().toISOString(),
      }),
    });

    // Track this SIP connection
    if (!activeSessions.has(sessionId)) {
      activeSessions.set(sessionId, {
        sessionId,
        sipConnections: [],
      });
    }

    const session = activeSessions.get(sessionId);
    const sipConnection = {
      id: `sip_${Date.now()}`,
      type: "inbound",
      callerPhone,
      lvn: inboundLvn || "Unknown",
      createdAt: new Date().toISOString(),
      status: "connected",
    };

    session.sipConnections.push(sipConnection);

    res.json({
      success: true,
      message: "SIP inbound call routed to session",
      data: {
        sessionId,
        sipToken,
        callerPhone,
        lvn: inboundLvn,
        connectionId: sipConnection.id,
      },
    });
  } catch (error) {
    console.error("[SIP Inbound] Error handling call:", error);
    res.status(500).json({
      success: false,
      error: error.message,
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

// Get all active calls and sessions
app.get("/api/status", (req, res) => {
  const calls = Array.from(callMappings.entries()).map(([uuid, info]) => ({
    callUuid: uuid,
    ...info,
  }));

  const rooms = Array.from(roomSessions.entries()).map(([room, sessionId]) => ({
    roomName: room,
    sessionId,
    session: activeSessions.get(sessionId),
  }));

  res.json({
    success: true,
    data: {
      activeCalls: calls,
      activeRooms: rooms,
      lvn: lvn || "Not configured",
      webhookUrl: publicWebhookUrl || "Not configured",
    },
  });
});

// ========================================
// VOICE API WEBHOOKS FOR LVN DIAL-IN
// ========================================

// Voice API Answer Webhook
// Called when someone dials your LVN
// Routes inbound voice calls to video session
app.get("/sip/vapi/answer", async (req, res) => {
  console.log("\n[Voice Answer] Incoming call to LVN");
  console.log("[Voice Answer] From:", req.query.from);
  console.log("[Voice Answer] To:", req.query.to);
  console.log("[Voice Answer] UUID:", req.query.uuid);

  const callUuid = req.query.uuid;
  const callerNumber = req.query.from;

  try {
    // Always route to the default video room
    const roomName = defaultVideoRoom;

    // Get or create Video session and Conversation for this room
    let videoSessionId = roomSessions.get(roomName);
    let conversationName = `video-room-${roomName}`;

    if (!videoSessionId) {
      console.log(
        `[Voice Answer] Creating new Video session for room: ${roomName}`
      );
      const session = await vonageVideo.createSession({
        archiveMode: "manual",
        mediaMode: "routed",
      });
      videoSessionId = session.sessionId;
      roomSessions.set(roomName, videoSessionId);
      activeSessions.set(videoSessionId, {
        sessionId: videoSessionId,
        roomName,
        created: new Date(),
        sipConnections: [],
      });
    }

    // Store call mapping
    callMappings.set(callUuid, {
      videoSessionId,
      roomName,
      conversationName,
      callerNumber,
      status: "connecting",
      created: new Date(),
    });

    console.log(
      `[Voice Answer] Routing call to Video session: ${videoSessionId}`
    );
    console.log(`[Voice Answer] Conversation name: ${conversationName}`);

    // Generate token for Video session SIP connection
    const videoToken = vonageVideo.generateClientToken(videoSessionId, {
      role: "subscriber",
      data: JSON.stringify({
        callUuid,
        callerNumber,
        isInboundSIP: true,
      }),
    });

    // Asynchronously dial the conversation from Video API
    initiateVideoSIPCall(
      videoSessionId,
      videoToken,
      conversationName,
      callUuid
    );

    // Return NCCO with Conversation to keep voice call active
    // The video session will dial into this conversation
    const ncco = new NCCOBuilder();
    ncco.addAction(
      new Talk("Please wait while we connect you to the video session.")
    );
    ncco.addAction(
      new Conversation(
        conversationName,
        null,
        true,
        true,
        false,
        null,
        null,
        false
      )
    );

    res.json(ncco.build());
  } catch (error) {
    console.error("[Voice Answer] Error:", error);

    // Fallback NCCO to inform caller of error
    const ncco = new NCCOBuilder();
    ncco.addAction(
      new Talk(
        "Sorry, we could not connect you to the video session. Please try again later."
      )
    );
    res.json(ncco.build());
  }
});

// Helper function to dial video session into voice conversation
async function initiateVideoSIPCall(
  sessionId,
  token,
  conversationName,
  callUuid
) {
  try {
    console.log(
      `[Video SIP] Initiating SIP call for session ${sessionId} into conversation: ${conversationName}`
    );
    console.log("[Video SIP] Token length:", token.length);
    console.log("[Video SIP] Conference number:", conferenceNumber);

    // Use the Vonage SDK's intiateSIPCall method (note: SDK has typo in method name)
    // Method signature: intiateSIPCall(sessionId, options)
    // where options = { token, sip: { uri, from, secure } }
    const options = {
      token,
      sip: {
        uri: `sip:${conferenceNumber}@sip.nexmo.com`,
        from: `${conferenceNumber}@sip.nexmo.com`,
        secure: false,
      },
    };

    console.log(
      "[Video SIP] Request options:",
      JSON.stringify(options, null, 2)
    );

    const dialResult = await vonageVideo.intiateSIPCall(sessionId, options);

    console.log("[Video SIP] SIP call initiated successfully:", dialResult);

    // Update call mapping with connection details
    const callMapping = callMappings.get(callUuid);
    if (callMapping) {
      callMapping.connectionId = dialResult.connectionId;
      callMapping.streamId = dialResult.streamId;
      callMapping.status = "connected";
      callMappings.set(callUuid, callMapping);
    }
  } catch (error) {
    console.error("[Video SIP] SIP call initiation failed:", error.message);
    console.error("[Video SIP] Error name:", error.name);

    // Try to parse the response body for the actual error
    if (error.response) {
      console.error("[Video SIP] Response status:", error.response.status);
      console.error("[Video SIP] Response headers:", error.response.headers);

      if (error.response.body) {
        try {
          const bodyText =
            (await error.response.text?.()) || error.response.body;
          console.error("[Video SIP] Response body:", bodyText);
        } catch (e) {
          console.error("[Video SIP] Could not parse response body");
        }
      }
    }

    if (error.response?.data) {
      console.error("[Video SIP] Error details (data):", error.response.data);
    }
    if (error.response?.status) {
      console.error("[Video SIP] Status code:", error.response.status);
    }
    console.error("[Video SIP] Stack trace:", error.stack);
  }
}

// Voice API Answer Webhook (POST version for some configurations)
app.post("/sip/vapi/answer", async (req, res) => {
  console.log("\n[Voice Answer POST] Incoming call to LVN");
  console.log("[Voice Answer POST] Body:", req.body);

  // Forward to GET handler
  req.query = req.body;
  return app._router.handle(
    { ...req, method: "GET", url: "/sip/vapi/answer" },
    res,
    () => {}
  );
});

// Voice API Event Webhook
// Receives call status updates
app.all("/sip/vapi/events", (req, res) => {
  console.log("\n[Voice Event]", req.body.status || req.body);

  const callUuid = req.body.uuid || req.query.uuid;
  const status = req.body.status || req.query.status;

  if (callMappings.has(callUuid)) {
    const mapping = callMappings.get(callUuid);
    mapping.status = status;

    if (status === "completed" || status === "failed") {
      console.log(`[Voice Event] Call ${callUuid} ended`);
      callMappings.delete(callUuid);
    }
  }

  res.status(204).send();
});

// ========================================
// VIDEO API SIP WEBHOOK
// ========================================

// Video API SIP Monitoring Callback for SIP Interconnect
app.post("/video/sip/callback", (req, res) => {
  console.log("\n[Video API SIP Monitoring] Callback received");
  console.log(
    "[Video API SIP Monitoring] Headers:",
    JSON.stringify(req.headers, null, 2)
  );
  console.log(
    "[Video API SIP Monitoring] Query params:",
    JSON.stringify(req.query, null, 2)
  );
  console.log(
    "[Video API SIP Monitoring] Body:",
    JSON.stringify(req.body, null, 2)
  );
  res.status(200).json({ success: true });
});
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
  console.log(`LVN configured: ${lvn || "Not set"}`);
});

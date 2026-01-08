import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Paper,
  Typography,
  TextField,
  CircularProgress,
  Alert,
  Grid,
  Divider,
  Chip,
} from "@mui/material";
import {
  Videocam,
  VideocamOff,
  Mic,
  MicOff,
  Phone,
  PhoneDisabled,
} from "@mui/icons-material";
import OT from "@opentok/client";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

const VideoSession = () => {
  const [sessionId, setSessionId] = useState("");
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [session, setSession] = useState(null);
  const [publisher, setPublisher] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [publishVideo, setPublishVideo] = useState(true);
  const [publishAudio, setPublishAudio] = useState(true);
  const [publisherVideoElement, setPublisherVideoElement] = useState(null);
  const [subscriberVideoElements, setSubscriberVideoElements] = useState({});

  const publisherRef = useRef(null);
  const subscribersRef = useRef(null);

  // Initialize publisher after session is connected and DOM container exists
  useEffect(() => {
    if (!session || !connected) return;
    if (publisher) return; // Already initialized

    console.log("Initializing publisher...");

    const pub = OT.initPublisher(
      null, // Don't specify container - will append manually after videoElementCreated event
      {
        insertDefaultUI: false,
        publishVideo: publishVideo,
        publishAudio: publishAudio,
        fitMode: "cover",
        style: {
          buttonDisplayMode: "off",
          nameDisplayMode: "off",
        },
      },
      (error) => {
        if (error) {
          console.error("Error initializing publisher:", error);
          setError("Error initializing publisher: " + error.message);
        } else {
          console.log("✓ Publisher initialized successfully");
          setPublisher(pub);

          // Publish to session
          session.publish(pub, (publishError) => {
            if (publishError) {
              console.error("Publish error:", publishError);
              setError("Error publishing: " + publishError.message);
            } else {
              console.log("✓ Publishing successfully");
            }
          });
        }
      }
    );

    // Listen for video element creation - store in state
    pub.on("videoElementCreated", (event) => {
      console.log("✓ Publisher videoElementCreated event fired");
      const elem = event.element;
      console.log("Video element details at creation:", {
        tagName: elem.tagName,
        autoplay: elem.autoplay,
        srcObject: elem.srcObject,
        readyState: elem.readyState,
        networkState: elem.networkState,
        videoWidth: elem.videoWidth,
        videoHeight: elem.videoHeight,
        innerHTML: elem.innerHTML?.substring(0, 100),
      });
      console.log("Browser WebRTC support:", {
        RTCPeerConnection: !!window.RTCPeerConnection,
        getUserMedia: !!navigator.mediaDevices?.getUserMedia,
        mediaDevices: !!navigator.mediaDevices,
      });
      setPublisherVideoElement(elem);
    });
  }, [session, connected, publisher, publishVideo, publishAudio]);

  // Append publisher video element to DOM when ready
  useEffect(() => {
    if (!publisherVideoElement) return;

    const appendElement = (retries = 0) => {
      const container = document.getElementById("publisher-container");

      if (!container) {
        if (retries < 30) {
          console.log("Publisher container not found, retrying...", retries);
          setTimeout(() => appendElement(retries + 1), 100);
        } else {
          console.error("Publisher container never appeared in DOM!");
        }
        return;
      }

      console.log("✓ Appending publisher video element to DOM");
      console.log("Video element details before append:", {
        tagName: publisherVideoElement.tagName,
        autoplay: publisherVideoElement.autoplay,
        srcObject: publisherVideoElement.srcObject,
        readyState: publisherVideoElement.readyState,
        networkState: publisherVideoElement.networkState,
        videoWidth: publisherVideoElement.videoWidth,
        videoHeight: publisherVideoElement.videoHeight,
        canPlayType: publisherVideoElement.canPlayType?.("video/mp4"),
        innerHTML: publisherVideoElement.innerHTML,
      });

      publisherVideoElement.style.width = "100%";
      publisherVideoElement.style.height = "100%";
      publisherVideoElement.style.objectFit = "cover";
      publisherVideoElement.style.position = "absolute";
      publisherVideoElement.style.top = "0";
      publisherVideoElement.style.left = "0";
      publisherVideoElement.style.zIndex = "1";

      // Listen for video playback events
      const onPlay = () => {
        console.log("✓ Publisher video element playing:", {
          videoWidth: publisherVideoElement.videoWidth,
          videoHeight: publisherVideoElement.videoHeight,
          readyState: publisherVideoElement.readyState,
          duration: publisherVideoElement.duration,
        });
      };

      const onLoadedMetadata = () => {
        console.log("✓ Publisher video metadata loaded:", {
          videoWidth: publisherVideoElement.videoWidth,
          videoHeight: publisherVideoElement.videoHeight,
          readyState: publisherVideoElement.readyState,
        });
      };

      publisherVideoElement.addEventListener("play", onPlay);
      publisherVideoElement.addEventListener(
        "loadedmetadata",
        onLoadedMetadata
      );

      container.innerHTML = "";
      container.appendChild(publisherVideoElement);

      // Ensure autoplay is set
      publisherVideoElement.autoplay = true;
      publisherVideoElement.muted = true; // Prevent audio feedback

      // Check after append
      setTimeout(() => {
        console.log("✓ Publisher video element appended successfully", {
          containerWidth: container.clientWidth,
          containerHeight: container.clientHeight,
          containerDisplay: window.getComputedStyle(container).display,
          videoInDOM: container.contains(publisherVideoElement),
          videoVideoWidth: publisherVideoElement.videoWidth,
          videoVideoHeight: publisherVideoElement.videoHeight,
          videoReadyState: publisherVideoElement.readyState,
          videoNetworkState: publisherVideoElement.networkState,
          videoMuted: publisherVideoElement.muted,
          videoAutoplay: publisherVideoElement.autoplay,
        });
      }, 0);

      // Cleanup listeners
      return () => {
        publisherVideoElement.removeEventListener("play", onPlay);
        publisherVideoElement.removeEventListener(
          "loadedmetadata",
          onLoadedMetadata
        );
      };
    };

    const cleanup = appendElement();
    return cleanup;
  }, [publisherVideoElement]);

  // Append subscriber video elements to DOM
  useEffect(() => {
    console.log("Subscriber video elements effect triggered:", {
      elementCount: Object.keys(subscriberVideoElements).length,
      hasRef: !!subscribersRef.current,
    });

    if (Object.keys(subscriberVideoElements).length > 0) {
      // Retry logic to wait for container to appear in DOM
      const tryAppend = (retries = 0) => {
        let container = subscribersRef.current;
        if (!container) {
          container = document.getElementById("subscribers-container");
        }

        if (container) {
          Object.entries(subscriberVideoElements).forEach(
            ([streamId, element]) => {
              if (element && !element.parentElement) {
                console.log(
                  "✓ Appending subscriber element for stream:",
                  streamId
                );
                element.style.width = "100%";
                element.style.height = "100%";
                element.style.objectFit = "cover";
                element.style.position = "absolute";
                element.style.top = "0";
                element.style.left = "0";
                element.style.zIndex = "1";

                container.appendChild(element);
                console.log(
                  "✓ Subscriber element appended to DOM for stream:",
                  streamId
                );
              }
            }
          );
        } else if (retries < 30) {
          // Container not in DOM yet, retry after 100ms
          console.log("Subscribers container not found, retrying...", retries);
          setTimeout(() => tryAppend(retries + 1), 100);
        } else {
          console.error("Subscribers container never appeared in DOM!");
        }
      };

      tryAppend();
    }
  }, [subscriberVideoElements]);

  const createSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/video/session`);
      const { sessionId } = response.data.data;
      setSessionId(sessionId);

      // Generate token
      const tokenResponse = await axios.post(`${BACKEND_URL}/api/video/token`, {
        sessionId,
        role: "publisher",
      });
      const generatedToken = tokenResponse.data.data.token;
      const generatedApiKey = tokenResponse.data.data.apiKey;

      console.log("Session created:", sessionId);
      console.log("API Key:", generatedApiKey);
      console.log("Token length:", generatedToken?.length);

      setToken(generatedToken);
      setApiKey(generatedApiKey);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const connectToSession = () => {
    if (!apiKey || !sessionId || !token) {
      setError("Missing session credentials");
      return;
    }

    console.log("Connecting to session with:");
    console.log("API Key:", apiKey);
    console.log("Session ID:", sessionId);
    console.log("Token (first 50 chars):", token?.substring(0, 50) + "...");
    console.log("Token type:", typeof token);

    try {
      const newSession = OT.initSession(apiKey, sessionId);

      // Add error handler for session
      newSession.on("sessionConnected", () => {
        console.log("✓ Session connected successfully");
      });

      newSession.on("sessionDisconnected", (event) => {
        console.log("Session disconnected:", event.reason);
      });

      newSession.on("exception", (event) => {
        console.error("Session exception:", event);
        setError("Session error: " + event.message);
      });

      // Set session and mark as connected - publisher will be initialized in useEffect
      setSession(newSession);
      setConnected(true);

      // Handle remote streams
      newSession.on("streamCreated", (event) => {
        console.log("Stream created:", event.stream.id);
        console.log("Stream details:", {
          hasVideo: event.stream.hasVideo,
          hasAudio: event.stream.hasAudio,
          videoType: event.stream.videoType,
          id: event.stream.id,
        });

        // Check if this is a SIP stream (typically audio-only, no video)
        const isSipStream = !event.stream.hasVideo;

        const subscriber = newSession.subscribe(
          event.stream,
          {
            insertDefaultUI: false,
            fitMode: "cover",
            style: {
              buttonDisplayMode: "off",
              nameDisplayMode: "off",
            },
          },
          (error) => {
            if (error) {
              console.error("Error subscribing to stream:", error);
            } else {
              console.log("✓ Subscribed to stream:", event.stream.id);
              setSubscribers((prev) => [
                ...prev,
                {
                  id: event.stream.id,
                  subscriber,
                  isSip: isSipStream,
                  createdAt: new Date(),
                },
              ]);
            }
          }
        );

        // Listen for subscriber video element creation - store in state
        subscriber.on("videoElementCreated", (subEvent) => {
          console.log(
            "✓ Subscriber videoElementCreated event fired for",
            event.stream.id
          );
          console.log("Subscriber video element:", subEvent.element);
          console.log(
            "Setting subscriber video element in state for stream:",
            event.stream.id
          );
          setSubscriberVideoElements((prev) => ({
            ...prev,
            [event.stream.id]: subEvent.element,
          }));
          console.log(
            "Subscriber video element state set for stream:",
            event.stream.id
          );
        });
      });

      // Handle stream destroyed
      newSession.on("streamDestroyed", (event) => {
        setSubscribers((prev) =>
          prev.filter((sub) => sub.id !== event.stream.id)
        );
        // Also remove the video element for this stream
        setSubscriberVideoElements((prev) => {
          const updated = { ...prev };
          delete updated[event.stream.id];
          return updated;
        });
      });

      // Connect to session
      newSession.connect(token, (error) => {
        if (error) {
          console.error("Connection error details:", error);
          setError(
            "Error connecting to session: " +
              error.message +
              " (Code: " +
              error.code +
              ")"
          );
        } else {
          console.log("✓ Connected to session, now initializing publisher...");
          // Set connected state - publisher will be initialized in useEffect
          setSession(newSession);
          setConnected(true);
        }
      });
    } catch (err) {
      console.error("Exception in connectToSession:", err);
      setError("Error initializing session: " + err.message);
    }
  };

  const disconnect = () => {
    if (session) {
      session.disconnect();
      setSession(null);
      setConnected(false);
      setPublisher(null);
      setSubscribers([]);
    }
  };

  const toggleVideo = () => {
    if (publisher) {
      publisher.publishVideo(!publishVideo);
      setPublishVideo(!publishVideo);
    }
  };

  const toggleAudio = () => {
    if (publisher) {
      publisher.publishAudio(!publishAudio);
      setPublishAudio(!publishAudio);
    }
  };

  const dialSIP = async () => {
    if (!sessionId || !token) {
      setError("Session not initialized");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/video/dial`, {
        sessionId,
        token,
      });
      console.log("SIP dial response:", response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!connected ? (
        <Paper elevation={3} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Video Session Setup
          </Typography>
          <Box sx={{ display: "flex", gap: 2, flexDirection: "column" }}>
            <Button
              variant="contained"
              onClick={createSession}
              disabled={loading || sessionId !== ""}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              Create Session
            </Button>

            {sessionId && (
              <>
                <TextField
                  label="Session ID"
                  value={sessionId}
                  fullWidth
                  InputProps={{ readOnly: true }}
                  size="small"
                />
                <TextField
                  label="Token"
                  value={token}
                  fullWidth
                  InputProps={{ readOnly: true }}
                  size="small"
                />
                <Button
                  variant="contained"
                  color="success"
                  onClick={connectToSession}
                >
                  Connect to Session
                </Button>
              </>
            )}
          </Box>
        </Paper>
      ) : (
        <Box>
          <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="h6">
                Video Session{" "}
                <Chip label="Connected" color="success" size="small" />
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  variant="outlined"
                  onClick={toggleVideo}
                  startIcon={publishVideo ? <Videocam /> : <VideocamOff />}
                  color={publishVideo ? "primary" : "error"}
                >
                  {publishVideo ? "Video On" : "Video Off"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={toggleAudio}
                  startIcon={publishAudio ? <Mic /> : <MicOff />}
                  color={publishAudio ? "primary" : "error"}
                >
                  {publishAudio ? "Audio On" : "Audio Off"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={dialSIP}
                  startIcon={<Phone />}
                  disabled={loading}
                >
                  Dial SIP
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={disconnect}
                  startIcon={<PhoneDisabled />}
                >
                  Disconnect
                </Button>
              </Box>
            </Box>
          </Paper>

          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                elevation={2}
                sx={{
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "450px",
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Publisher
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box
                  ref={publisherRef}
                  id="publisher-container"
                  style={{
                    backgroundColor: "#1a1a1a",
                    height: "400px",
                    minHeight: "400px",
                    width: "100%",
                    borderRadius: "4px",
                    overflow: "hidden",
                    position: "relative",
                    display: "block",
                  }}
                />
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                elevation={2}
                sx={{
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "450px",
                }}
              >
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                >
                  <Typography variant="h6">
                    Subscribers ({subscribers.length})
                  </Typography>
                  {subscribers.some((s) => s.isSip) && (
                    <Chip
                      icon={<Phone style={{ fontSize: "16px" }} />}
                      label="SIP Active"
                      color="warning"
                      size="small"
                    />
                  )}
                </Box>

                {/* Show list of active participants */}
                {subscribers.length > 0 && (
                  <Box
                    sx={{
                      mb: 2,
                      p: 1,
                      backgroundColor: "#f5f5f5",
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="caption" display="block" gutterBottom>
                      Active Participants:
                    </Typography>
                    {subscribers.map((sub) => {
                      const elapsed = Math.round(
                        (Date.now() - sub.createdAt.getTime()) / 1000
                      );
                      return (
                        <Typography
                          key={sub.id}
                          variant="body2"
                          sx={{ mb: 0.5 }}
                        >
                          {sub.isSip ? "☎️" : "📹"} {sub.id.substring(0, 12)}...
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ ml: 1, color: "gray" }}
                          >
                            ({elapsed}s)
                          </Typography>
                        </Typography>
                      );
                    })}
                  </Box>
                )}

                <Divider sx={{ mb: 2 }} />
                <Box
                  ref={subscribersRef}
                  id="subscribers-container"
                  style={{
                    backgroundColor: "#1a1a1a",
                    height: "400px",
                    minHeight: "400px",
                    width: "100%",
                    borderRadius: "4px",
                    overflow: "hidden",
                    position: "relative",
                    display: "flex",
                    flexWrap: "wrap",
                    alignContent: "flex-start",
                  }}
                />
              </Paper>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default VideoSession;

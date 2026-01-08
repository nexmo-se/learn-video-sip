# Vonage Application Setup - Two Applications Required

## Overview

For LVN dial-in to Video session, you need **TWO separate Vonage applications**. This is the recommended architecture by Vonage.

---

## Application 1: Video API Application ✅

**Purpose**: Create and manage video sessions

### Current Configuration

```
Application ID: 068a9682-5481-4dc8-92cb-aa7b8f43ed79
Private Key: private.key
```

### Used For:

- Creating video sessions (`vonage.video.createSession()`)
- Generating client tokens (`vonage.video.generateClientToken()`)
- SIP operations (if needed)

### Webhook Configuration:

- **None required** for basic Video API operations
- Optional: SIP monitoring webhook for advanced debugging

### Environment Variables:

```bash
VONAGE_APPLICATION_ID=068a9682-5481-4dc8-92cb-aa7b8f43ed79
VONAGE_PRIVATE_KEY=./private.key
```

### Status: ✅ Already Configured

---

## Application 2: Voice API Application ⚠️

**Purpose**: Handle inbound PSTN calls to your LVN

### Need to Create:

1. Go to [Vonage Dashboard → Applications](https://dashboard.nexmo.com/applications)
2. Click **"Create a new application"**
3. Name it: `Video SIP Voice Connector`
4. Enable **Voice** capability

### Webhook Configuration (CRITICAL):

You **must** set these webhook URLs:

#### Answer URL (GET or POST):

```
https://your-ngrok-url.ngrok.io/webhooks/voice/answer
```

- Called when someone dials your LVN
- Returns NCCO to control the call
- **Method**: GET (or POST, both supported)

#### Event URL (POST):

```
https://your-ngrok-url.ngrok.io/webhooks/voice/events
```

- Receives call status updates (answered, completed, failed)
- **Method**: POST

### Generate Keys:

1. Click **"Generate public and private key"**
2. Save as `voice-private.key` in backend folder
3. Copy the **Application ID**

### Environment Variables:

```bash
VONAGE_VOICE_APPLICATION_ID=your_new_voice_app_id_here
VONAGE_VOICE_PRIVATE_KEY=./voice-private.key
```

### Link Your LVN:

1. Go to Dashboard → Numbers → Your Numbers
2. Find LVN: `12089908002`
3. Click **Edit** (pencil icon)
4. Under "Voice", select your new Voice application
5. Click **Save**

### Status: ⚠️ Needs to be Created

---

## Why Two Applications?

### Reason 1: Different APIs

- **Voice API** = PSTN/Phone calls
- **Video API** = WebRTC/Video sessions
- They use different protocols and endpoints

### Reason 2: Different Authentication

- **Voice API** = JWT (private key) for webhooks
- **Video API** = Session tokens for clients

### Reason 3: Different Webhooks

- **Voice API** = Requires Answer & Event URLs
- **Video API** = Client-initiated, no webhooks needed

### Reason 4: Easier Management

- Separate credentials
- Easier debugging (separate logs)
- Better security isolation
- Independent scaling

---

## Complete Configuration Summary

### Step-by-Step Checklist

#### Video API Application (✅ Done)

- [x] Application exists (ID: 068a9682...)
- [x] Private key downloaded (private.key)
- [x] Configured in .env
- [x] SDK initialized in backend

#### Voice API Application (⚠️ To Do)

- [ ] Create new Voice application in Dashboard
- [ ] Generate and download private key
- [ ] Save as `voice-private.key` in backend/
- [ ] Set Answer webhook URL
- [ ] Set Event webhook URL
- [ ] Link LVN (12089908002) to this app
- [ ] Add credentials to .env
- [ ] Restart backend to load new credentials

#### Ngrok (Required for Local Dev)

- [ ] Install ngrok
- [ ] Start: `ngrok http 3000`
- [ ] Copy HTTPS URL (e.g., https://abc123.ngrok.io)
- [ ] Update `PUBLIC_WEBHOOK_URL` in .env
- [ ] Update Voice App webhook URLs with ngrok URL

---

## Configuration Files

### backend/.env (Complete)

```bash
# =============================================
# API Credentials (both apps use these)
# =============================================
VONAGE_API_KEY=4f2ff535
VONAGE_API_SECRET=jtYzPbh3MXr8M1Hr

# =============================================
# Video API Application (✅ Already Configured)
# =============================================
VONAGE_APPLICATION_ID=068a9682-5481-4dc8-92cb-aa7b8f43ed79
VONAGE_PRIVATE_KEY=./private.key

# =============================================
# Voice API Application (⚠️ Need to Create)
# =============================================
VONAGE_VOICE_APPLICATION_ID=your_voice_app_id_here
VONAGE_VOICE_PRIVATE_KEY=./voice-private.key

# =============================================
# Configuration
# =============================================
LVN=12089908002
DEFAULT_VIDEO_ROOM=main-conference

# Your ngrok URL (update when ngrok restarts)
PUBLIC_WEBHOOK_URL=https://your-ngrok-url.ngrok.io

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3001
```

### backend/ Directory Structure

```
backend/
├── index.js                 # Main server
├── package.json
├── .env                     # Configuration
├── private.key              # ✅ Video API key (exists)
└── voice-private.key        # ⚠️ Voice API key (need to create)
```

---

## Testing After Setup

### 1. Verify SDK Initialization

Start backend and look for these logs:

```
✓ Video API SDK initialized successfully
✓ Voice API SDK initialized successfully
App listening on port 3000
LVN configured: 12089908002
```

### 2. Test Video Session Creation

```bash
curl -X POST http://localhost:3000/api/video/session
```

Expected response:

```json
{
  "success": true,
  "data": {
    "sessionId": "2_MX40Nj...",
    "applicationId": "068a9682-5481-4dc8-92cb-aa7b8f43ed79"
  }
}
```

### 3. Test LVN Dial-In

1. From any phone, dial: `+1 (208) 990-8002`
2. Should hear: "Welcome to the video conference. Connecting you now."
3. Check backend logs for webhook activity

### 4. Verify Webhook Delivery

Check ngrok dashboard: http://localhost:4040

- Should see `GET /webhooks/voice/answer` requests
- Should see `POST /webhooks/voice/events` requests

---

## Common Issues

### Issue 1: "Voice API credentials not found"

**Cause**: Missing `VONAGE_VOICE_APPLICATION_ID` or `VONAGE_VOICE_PRIVATE_KEY`

**Solution**:

1. Create Voice API application in Dashboard
2. Download private key as `voice-private.key`
3. Add credentials to `.env`
4. Restart backend

### Issue 2: Call rings but no webhook

**Cause**: LVN not linked to Voice Application

**Solution**:

1. Dashboard → Numbers → Your Numbers
2. Find `12089908002`
3. Edit → Select your Voice application
4. Save

### Issue 3: Webhook returns 404

**Cause**: Webhook URLs in Voice App don't match your server

**Solution**:

1. Verify ngrok is running
2. Copy ngrok HTTPS URL
3. Update Voice App webhook URLs
4. Update `PUBLIC_WEBHOOK_URL` in `.env`
5. Restart backend

### Issue 4: "Could not connect to video session"

**Cause**: Video API credentials incorrect

**Solution**:

1. Verify `VONAGE_APPLICATION_ID` is correct
2. Verify `private.key` file exists and is valid
3. Check Dashboard → Applications → Your Video App
4. Regenerate private key if needed

---

## Dashboard Navigation

### To Create Voice Application:

```
Dashboard → Applications → "Create a new application"
```

### To Link LVN:

```
Dashboard → Numbers → Your Numbers → Edit (pencil icon) → Voice section
```

### To View Call Logs:

```
Dashboard → Voice → Logs
```

### To View Application Details:

```
Dashboard → Applications → [Your App Name]
```

---

## Next Steps

1. ✅ You already have Video API application configured
2. ⚠️ Create Voice API application (follow steps above)
3. ⚠️ Download `voice-private.key`
4. ⚠️ Update `.env` with Voice credentials
5. ⚠️ Start ngrok: `ngrok http 3000`
6. ⚠️ Update webhook URLs in Voice App
7. ⚠️ Link LVN to Voice App
8. ✅ Restart backend
9. ✅ Test by calling LVN

---

## Resources

- [Create Voice Application](https://dashboard.nexmo.com/applications/new)
- [Voice API Docs](https://developer.vonage.com/voice/voice-api/overview)
- [Video API Docs](https://tokbox.com/developer/guides/basics/)
- [SIP Integration Guide](https://tokbox.com/developer/guides/sip/)

---

## Support

If you encounter issues:

1. Check backend logs for errors
2. Check Vonage Dashboard → Voice → Logs
3. Check ngrok dashboard (http://localhost:4040)
4. Verify all credentials in `.env`
5. Ensure both private key files exist
6. Test webhook URLs with curl

For detailed setup instructions, see: [LVN_DIALIN_SETUP.md](./LVN_DIALIN_SETUP.md)

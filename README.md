# React Express Monorepo Template

A full-stack monorepo template with ReactJS frontend and ExpressJS backend, using NGROK.

## Overview

This monorepo contains two separate applications, however in the Vonage Dashboard it is one Application.

- **Frontend** (`/frontend`): ReactJS application created with Create React App
- **Backend** (`/backend`): ExpressJS API server

Each application has its own `.env` configuration file and must be run and deployed independently.

## Prerequisites

- Vonage Application with Video enabled

## Setup

1. **Install dependencies** in both directories:

   ```bash
   cd frontend && npm install
   cd ../backend && npm install
   ```

2. **Configure .env files** using the provided samples as reference:

   - `.env-frontend-sample`
   - `.env-backend-sample`

3. **Configure frontend environment variables**
   - Copy `.env.frontend-sample` to `.env` in the `/frontend` directory
   - Set `REACT_APP_BACKEND_URL` to your backend URL
   - Example:
     ```bash
     cp frontend/.env.frontend-sample frontend/.env
     # Edit frontend/.env and set REACT_APP_BACKEND_URL
     ```

## Local Development

Run both applications in separate terminal windows:

**Terminal 1 - Backend:**

```bash
cd backend
npm install
npm start or nodemon index.js
```

**Terminal 2 - Frontend:**

```bash
cd frontend
npm install
npm start
```

Use NGROK to expose the backend URL, for example: `ngrok http 3000 --domain=kitt-phi.ngrok.app`

1. Update `BACKEND_URL` in `/frontend/src/App.js` with your deployed backend URL
2. Update `FRONTEND_URL` in `/backend/.env` with your frontend URL.

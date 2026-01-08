import React from "react";
import { Container, Typography, Paper, Box } from "@mui/material";
import VideoSession from "./VideoSession";
import "./App.css";

function App() {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box sx={{ mb: 3, textAlign: "center" }}>
          <Typography variant="h4" gutterBottom>
            Vonage Video SIP Demo
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Dial into video sessions using SIP/Phone
          </Typography>
        </Box>
        <VideoSession />
      </Paper>
    </Container>
  );
}

export default App;

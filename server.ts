import express from "express";
import path from "path";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// API health endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve static assets from Vite build output
const distPath = path.join(process.cwd(), "dist");
app.use(express.static(distPath));

// Single Page Application fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HUMA server running on http://0.0.0.0:${PORT}`);
});


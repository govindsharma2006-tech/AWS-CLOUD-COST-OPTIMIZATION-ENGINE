const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middleware/authMiddleware"); // ✅ upar lao
const awsRoutes = require("./routes/awsRoutes");
const alertRoutes = require("./routes/alertRoutes");

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      'http://localhost:5000',
      'http://127.0.0.1:5000',
      'http://localhost:3000',
      'https://cloud-project-ausj.onrender.com'  // ← add this
    ];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed → ' + origin));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Fix: Cross-Origin-Opener-Policy — Google OAuth popup fix
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});

// DB connect
connectDB();

// test route
app.get("/test", (req, res) => {
    res.send("Test route working ✅");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/aws",  awsRoutes);
app.use("/api/user", alertRoutes);

// protected route ✅ (listen se pehle)
app.get("/api/protected", authMiddleware, (req, res) => {
    res.json({
        message: "Protected data accessed ✅",
        user: req.user
    });
});

const path = require("path");

// Serve the entire Frontend folder statically
app.use(express.static(path.join(__dirname, "../Frontend")));

// When someone goes to the home route, send the index.html page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../Frontend/index.html"));
});

// server start (last me hona chahiye)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
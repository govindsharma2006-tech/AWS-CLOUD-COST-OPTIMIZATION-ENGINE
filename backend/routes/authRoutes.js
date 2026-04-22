const express = require("express");
const router = express.Router();

const { googleAuth, updateProfile } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/google", googleAuth);
router.patch("/profile", authMiddleware, updateProfile);

module.exports = router;
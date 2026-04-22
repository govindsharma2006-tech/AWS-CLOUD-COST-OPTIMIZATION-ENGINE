const express = require("express");
const router  = express.Router();

const { getDashboardData, saveAwsCredentials, disconnectAws } = require('../controllers/awsController');
const authMiddleware = require('../middleware/authMiddleware');

router.get("/dashboard",     authMiddleware, getDashboardData);
router.post("/connect",      authMiddleware, saveAwsCredentials);
router.delete("/disconnect", authMiddleware, disconnectAws);

module.exports = router;
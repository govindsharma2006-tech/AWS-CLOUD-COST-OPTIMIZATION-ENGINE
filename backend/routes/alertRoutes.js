const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const {
  getAlerts, createAlert,
  getBudgets, createBudget,
  deleteItem,
} = require("../controllers/alertController");

router.get("/alerts",    auth, getAlerts);
router.post("/alerts",   auth, createAlert);
router.get("/budgets",   auth, getBudgets);
router.post("/budgets",  auth, createBudget);
router.delete("/:id",    auth, deleteItem);

module.exports = router;

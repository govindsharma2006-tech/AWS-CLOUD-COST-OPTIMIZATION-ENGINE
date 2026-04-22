const Alert = require("../models/Alert");

// ─── Factory: list items by type ─────────────────────────────────────────────
const getItems = (type) => async (req, res) => {
  try {
    const items = await Alert.find({ userId: req.user._id, type }).sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── Factory: create an item ──────────────────────────────────────────────────
const createItem = (type) => async (req, res) => {
  try {
    const { name, service, threshold } = req.body;
    if (!name || !threshold) {
      return res.status(400).json({ success: false, message: "Name and threshold are required." });
    }
    const item = await Alert.create({
      userId: req.user._id,
      type,
      name,
      service: service || "Total AWS Spend",
      threshold: parseFloat(threshold),
    });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── Delete by id (both types) ────────────────────────────────────────────────
const deleteItem = async (req, res) => {
  try {
    await Alert.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAlerts:    getItems("alert"),
  createAlert:  createItem("alert"),
  getBudgets:   getItems("budget"),
  createBudget: createItem("budget"),
  deleteItem,
};

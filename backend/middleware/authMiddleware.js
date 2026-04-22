const jwt  = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header("Authorization");
        if (!token) {
            return res.status(401).json({ message: "No token, access denied" });
        }

        const actualToken = token.startsWith("Bearer ") ? token.slice(7) : token;
        const decoded = jwt.verify(actualToken, process.env.JWT_SECRET);

        // Fetch full user from DB so we have AWS credentials on req.user
        const user = await User.findById(decoded.id).select("-password -resetToken -resetTokenExpiry");
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = user;
        next();

    } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
    }
};

module.exports = authMiddleware;
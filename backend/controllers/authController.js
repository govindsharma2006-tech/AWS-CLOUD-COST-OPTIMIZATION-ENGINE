const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || "472020276868-pu6kue623hl2utqjmuloe0rr8hj89pvq.apps.googleusercontent.com");

exports.googleAuth = async (req, res) => {
    try {
        const { token } = req.body;

        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { email, given_name, family_name, picture } = payload;

        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                firstName: given_name || "Cloud",
                lastName: family_name || "User",
                email: email,
                picture: picture || null,
                awsAccountId: "Pending"
            });
            await user.save();
        } else if (picture && user.picture !== picture) {
            await User.findByIdAndUpdate(user._id, { picture });
            user.picture = picture;
        }

        const appToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET || "fallback_secret_123",
            { expiresIn: "1d" }
        );

        res.json({
            message: "Login successful ✅",
            token: appToken,
            user: {
                name: `${user.firstName} ${user.lastName}`,
                email: user.email,
                picture: user.picture || null,
                awsConnected: user.awsConnected || false,
                awsRegion:    user.awsRegion    || null,
                awsAccountId: user.awsAccountId || null,
                preferredRegion:   user.preferredRegion   || "us-east-1",
                anomalyThreshold:  user.anomalyThreshold  || "15",
            }
        });

    } catch (error) {
        console.error("Google Auth Error:", error.message);
        res.status(500).json({ message: "Server error during authentication" });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { name, preferredRegion, anomalyThreshold } = req.body;
        const update = {};
        if (name && name.trim()) {
            const parts     = name.trim().split(" ");
            update.firstName = parts[0];
            update.lastName  = parts.slice(1).join(" ") || ".";
        }
        if (preferredRegion)  update.preferredRegion  = preferredRegion;
        if (anomalyThreshold) update.anomalyThreshold = anomalyThreshold;
        await User.findByIdAndUpdate(req.user._id, update);
        res.json({ success: true, message: "Profile updated successfully." });
    } catch (err) {
        console.error("Update Profile Error:", err.message);
        res.status(500).json({ success: false, message: "Server error." });
    }
};
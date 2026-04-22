const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    picture: {
        type: String,
        default: null
    },
    awsAccountId: {
        type: String,
        default: "Pending"
    },
    awsConnected: {
        type: Boolean,
        default: false
    },
    awsAccessKeyId: {
        type: String,
        default: null
    },
    awsSecretAccessKey: {
        type: String,
        default: null
    },
    awsRegion: {
        type: String,
        default: null
    },
    password: {
        type: String
    },
    preferredRegion: {
        type: String,
        default: "us-east-1"
    },
    anomalyThreshold: {
        type: String,
        default: "15"
    },
    resetToken: String,
    resetTokenExpiry: Date
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
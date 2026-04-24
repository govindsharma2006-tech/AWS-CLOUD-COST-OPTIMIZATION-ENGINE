const mongoose = require("mongoose");
const dns = require("dns");

// Force Google DNS to resolve MongoDB Atlas SRV records
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB = async () => {
    const connect = async () => {
        try {
            await mongoose.connect(process.env.MONGO_URI, {
                serverSelectionTimeoutMS: 30000,  // 30s to find a server
                socketTimeoutMS: 45000,           // 45s socket timeout
                connectTimeoutMS: 30000,          // 30s connection timeout
            });
            console.log("MongoDB Connected ✅");
        } catch (error) {
            console.error("❌ MongoDB connection failed:", error.message);
            console.log("🔄 Retrying MongoDB connection in 10 seconds...");
            setTimeout(connect, 10000); // Retry after 10 seconds — server stays alive
        }
    };

    await connect();
};

module.exports = connectDB;
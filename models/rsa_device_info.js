const mongoose = require("mongoose");

const RsaDeviceInfoSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    publicKey: { type: String, required: true },
    deviceId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("RsaDeviceInfo", RsaDeviceInfoSchema);
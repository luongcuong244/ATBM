const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Types.ObjectId, ref: "User" },
    receiver: { type: mongoose.Types.ObjectId, ref: "User" },
    system: { type: Boolean, default: false },
    room: { type: mongoose.Types.ObjectId, ref: "Room" },
    revoked: { type: Boolean, default: false },
    text: { type: String, default: null },
    senderPublicKeyEncryptedText: [
      {
        userId: { type: String, required: true },
        publicKey: { type: String, required: true },
        deviceId: { type: String, required: true },
        encryptedText: { type: String, required: true },
      },
    ],
    receiverPublicKeyEncryptedText: [
      {
        userId: { type: String, required: true },
        publicKey: { type: String, required: true },
        deviceId: { type: String, required: true },
        encryptedText: { type: String, required: true },
      },
    ],
    image: { type: String },
    video: { type: String },
    file: { type: String },
    status: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// const fieldsToEncrypt = [
//   "system",
//   "revoked",
//   "text",
//   "image",
//   "video",
//   "file",
//   "status",
// ];

// messageSchema.pre("save", async function (next) {
//   try {
//     // Tạo IV nếu chưa tồn tại
//     if (!this.iv) {
//       this.iv = crypto.randomBytes(16).toString("hex");
//     }

//     // Mã hóa các trường được chỉ định trong `fieldsToEncrypt`
//     fieldsToEncrypt.forEach((field) => {
//       if (this.isModified(field) && this[field]) {
//         // Kiểm tra nếu là mảng (ví dụ photos), mã hóa từng phần tử trong mảng
//         if (Array.isArray(this[field])) {
//           this[field] = this[field].map((item) => encrypt(item, this.iv)); // Mã hóa từng phần tử
//         } else {
//           this[field] = encrypt(this[field], this.iv); // Mã hóa trường đơn lẻ
//         }
//       }
//     });

//     next(); // Tiếp tục
//   } catch (err) {
//     next(err); // Truyền lỗi đến middleware xử lý lỗi
//   }
// });

// messageSchema.methods.decryptFields = function () {
//   if (!this.iv) return {}; // Nếu không có IV, trả về đối tượng trống

//   // Giải mã tất cả các trường cần thiết
//   const decryptedData = {};
//   fieldsToEncrypt.forEach((field) => {
//     if (this[field]) {
//       if (Array.isArray(this[field])) {
//         // Giải mã từng phần tử của mảng
//         decryptedData[field] = this[field].map((item) =>
//           decrypt(item, this.iv)
//         );
//       } else {
//         // Giải mã trường đơn
//         decryptedData[field] = decrypt(this[field], this.iv);
//       }
//     }
//   });

//   return decryptedData;
// };

module.exports = mongoose.model("Message", messageSchema);

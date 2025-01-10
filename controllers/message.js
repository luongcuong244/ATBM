const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const MessageModel = require("./../models/message");
const RoomModel = require("./../models/room");

const addMessage = asyncHandler(async (req, res) => {
  try {
    const { sender, receiver, room, text, image, video, file, system, senderPublicKeyEncryptedText, receiverPublicKeyEncryptedText } =
      req.body; // Dữ liệu từ client gửi lên

    // Kiểm tra các trường bắt buộc
    if (!sender || !receiver || !room) {
      return res.status(400).json({
        mes: "Thiếu thông tin cần thiết: sender, receiver hoặc room.",
      });
    }

    // Kiểm tra xem phòng chat có tồn tại không
    const existingRoom = await RoomModel.findById(room);
    if (!existingRoom) {
      return res.status(404).json({ mes: "Phòng chat không tồn tại." });
    }

    // Kiểm tra chỉ có **một** trong các trường `text`, `image`, `video`, hoặc `file` có giá trị
    const contentFields = [text, image, video, file];
    const nonEmptyFields = contentFields.filter((field) => field); // Lấy các trường không rỗng

    if (nonEmptyFields.length > 1) {
      return res.status(400).json({
        mes: "Chỉ được phép gửi một trong các trường: text, image, video hoặc file.",
      });
    }

    // Tạo tin nhắn mới
    const newMessage = new MessageModel({
      sender,
      receiver,
      room,
      text,
      senderPublicKeyEncryptedText,
      receiverPublicKeyEncryptedText,
      image,
      video,
      file,
      system: system || false, // Nếu không phải tin nhắn hệ thống, mặc định là `false`
    });

    // Lưu tin nhắn vào cơ sở dữ liệu
    const savedMessage = await newMessage.save();

    return res.status(201).json({
      mes: "Tin nhắn đã được thêm thành công.",
      data: savedMessage,
    });
  } catch (error) {
    console.error("Lỗi khi thêm tin nhắn:", error.message);
    res.status(500).json({ mes: "Lỗi máy chủ khi thêm tin nhắn." });
  }
});

const getMessagesInRoom = asyncHandler(async (req, res) => {
  try {
    const { roomId } = req.body; // Lấy roomId từ tham số URL

    // Tìm tất cả tin nhắn trong phòng chat đã cho và populate thông tin người gửi và người nhận
    const messages = await MessageModel.find({ room: roomId })
      .populate("sender", "name mobile photos") // Populate thông tin người gửi
      .populate("receiver", "name mobile photos") // Populate thông tin người nhận
      .sort({ createdAt: 1 }); // Sắp xếp tin nhắn theo thời gian (tăng dần: cũ đến mới)

    // Nếu không có tin nhắn
    if (!messages || messages.length === 0) {
      return res.status(404).json({
        mes: "Không có tin nhắn trong phòng chat này.",
      });
    }

    // Trả về danh sách tin nhắn đã populate và sắp xếp
    return res.status(200).json({
      mes: "Danh sách tin nhắn trong phòng chat.",
      messages,
    });
  } catch (error) {
    console.error("Lỗi khi lấy tin nhắn:", error.message);
    return res.status(500).json({
      mes: "Lỗi máy chủ khi lấy tin nhắn.",
    });
  }
});

module.exports = { getMessagesInRoom, addMessage };

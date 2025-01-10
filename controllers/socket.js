const MessageModel = require("../models/message"); // Model Message
const RoomModel = require("../models/room");
const UserModel = require("../models/user"); // Model Room
const Session = require("../models/session");
const RsaDeviceInfo = require("../models/rsa_device_info");
const AES = require("../encryption/AES");
const { text } = require("express");

const handleSocketEvents = (io, socket) => {
  socket.on("getChatList", async (data) => {
    try {
      const userId = data.userId;

      // Lấy tất cả các phòng mà người dùng tham gia
      const user = await UserModel.findById(userId).populate({
        path: "roomIDs",
        populate: {
          path: "userIDs",
          select: "iv name _id photos", // Chỉ lấy các thông tin cần thiết
        },
      });

      if (!user) {
        return socket.emit("getChatList", {
          error: "Người dùng không tồn tại.",
        });
      }

      const chatList = await Promise.all(
        user.roomIDs.map(async (room) => {
          // Lấy thông tin đối phương (ngoại trừ userId hiện tại)
          const opponents = room.userIDs.filter(
            (user) => user._id.toString() !== userId
          ).map((user) => {
            return {
              _id: user._id,
              name: AES.decrypt(user.name, user.iv),
              photos: user.photos.map((photo) => AES.decrypt(photo, user.iv)),
            };
          });

          // Nếu không có đối phương (phòng chỉ có 1 người), bỏ qua
          if (opponents.length === 0) return null;

          // Lấy thông tin người đối phương (lấy phần tử đầu tiên)
          const opponent = opponents[0];

          // Lấy tin nhắn mới nhất trong phòng
          const latestMessage = await MessageModel.findOne({ room: room._id })
            .sort({ createdAt: -1 }) // Sắp xếp theo thời gian mới nhất
            .populate({
              path: "sender",
              select: "name _id photos", // Lấy thông tin người gửi
            });

          if (latestMessage) {
            // Kiểm tra nếu tồn tại image, video hoặc file
            var text = [
              ...latestMessage.senderPublicKeyEncryptedText,
              ...latestMessage.receiverPublicKeyEncryptedText,
            ];

            if (latestMessage.system) {
              text = latestMessage.text;
            }

            if (
              latestMessage.image ||
              latestMessage.video ||
              latestMessage.file
            ) {
              text = "Tệp đính kèm.";
            }

            if (latestMessage.revoked) text = "Tin nhắn đã bị thu hồi.";

            // Trả thông tin phòng chat
            return {
              userID: opponent._id,
              userName: opponent.name,
              message: text,
              time: latestMessage.createdAt,
              isNewMessage: latestMessage.status,
              avatar: opponent.photos?.[0] || null, // Lấy ảnh đại diện đầu tiên (nếu có)
              userIsSendMes:
                latestMessage.sender._id.toString() === userId ? true : false, // So sánh chính xác
            };
          }

          // Nếu không có tin nhắn, bỏ qua phòng này
          return null;
        })
      );

      // Loại bỏ các giá trị null trong mảng chatList
      const filteredChatList = chatList.filter((item) => item !== null);

      // Sắp xếp lại theo thời gian mới nhất
      filteredChatList.sort((a, b) => {
        return new Date(b.time) - new Date(a.time);
      });

      // Trả kết quả về client
      socket.emit("getChatList", { chatList: filteredChatList });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách phòng chat:", error.message);
      socket.emit("getChatList", { error: "Đã xảy ra lỗi, vui lòng thử lại." });
    }
  });

  socket.on("getAllMessages", async (data) => {
    const { userId, guestId } = data;

    try {
      // Kiểm tra xem userId có bị guestId block hay không
      const guest = await UserModel.findById(guestId);
      if (!guest) {
        return socket.emit("getAllMessages", {
          status: "error",
          message: "Người dùng khách không tồn tại.",
        });
      }

      const isBlocked = guest.listBlock.includes(userId);

      // Kiểm tra xem guestId có bị userId block hay không
      const user = await UserModel.findById(userId);
      if (!user) {
        return socket.emit("getAllMessages", {
          status: "error",
          message: "Người dùng không tồn tại.",
        });
      }

      const isBlock = user.listBlock.includes(guestId);

      // Tìm phòng chat có chứa cả hai userId và guestId
      const room = await RoomModel.findOne({
        userIDs: { $all: [userId, guestId] }, // Kiểm tra cả hai userId đều có trong phòng
      });

      if (!room) {
        return socket.emit("getAllMessages", {
          status: "error",
          message: "Không tìm thấy phòng chat giữa hai người.",
          isBlocked,
          isBlock,
        });
      }

      // Lấy tất cả tin nhắn của phòng chat và sắp xếp theo thời gian
      const messages = await MessageModel.find({ room: room._id })
        .sort({ createdAt: -1 }) // Sắp xếp theo thời gian tăng dần (hoặc -1 nếu muốn giảm dần)
        .populate({
          path: "sender",
          select: "iv name _id photos", // Lấy thông tin người gửi
        })
        .populate({
          path: "receiver",
          select: "iv name _id photos", // Lấy thông tin người nhận
        });

      const formattedMessages = messages.map((msg) => {
        const senderInfo = msg.sender
          ? {
            _id: msg.sender._id.toString(),
            name: AES.decrypt(msg.sender.name, msg.sender.iv),
            avatar: msg.sender.photos?.[0] ? AES.decrypt(msg.sender.photos?.[0], msg.sender.iv) : null,
          }
          : null;

        return {
          _id: msg._id,
          createdAt: msg.createdAt,
          pending: false,
          received: true,
          sent: false,
          text: msg.text,
          rsaDeviceInfos: [
            ...msg.senderPublicKeyEncryptedText,
            ...msg.receiverPublicKeyEncryptedText,
          ],
          revoked: msg.revoked,
          user: senderInfo,
          system: msg.system,
          image: msg.image,
          video: msg.video,
          file: msg.file,
        };
      });

      // Trả về danh sách tin nhắn, thông tin phòng chat, và trạng thái block
      socket.emit("getAllMessages", {
        status: "success",
        messages: formattedMessages,
        isBlocked,
        isBlock,
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách tin nhắn:", error);
      socket.emit("getAllMessages", {
        status: "error",
        message: "Đã xảy ra lỗi khi lấy danh sách tin nhắn.",
      });
    }
  });

  socket.on("send_message", async (data) => {
    const { guestId, message, senderPublicKeyEncryptedText, receiverPublicKeyEncryptedText } = data;

    if (!message.user || !guestId) {
      console.log("Thiếu thông tin cần thiết: sender, receiver hoặc room.");
    }

    if (!message.text && !message.image && !message.video && !message.file) {
      console.log(
        "Phải cung cấp ít nhất một nội dung: text, image, video hoặc file."
      );
    }

    try {
      const room = await RoomModel.findOne({
        userIDs: { $all: [message.user._id, guestId] }, // Kiểm tra cả hai userId đều có trong phòng
      });

      if (!room) {
        return socket.emit("sendMessage", {
          status: "error",
          message: "Không tìm thấy phòng chat giữa hai người.",
        });
      }

      const contentFields = [
        message.text,
        message.image,
        message.video,
        message.file,
      ];
      const nonEmptyFields = contentFields.filter((field) => field); // Lấy các trường không rỗng

      if (nonEmptyFields.length > 1) {
        console.log(
          "Chỉ được phép gửi một trong các trường: text, image, video hoặc file."
        );
      }

      // Tạo tin nhắn mới
      const newMessage = new MessageModel({
        sender: message.user._id,
        receiver: guestId,
        room: room._id,
        senderPublicKeyEncryptedText,
        receiverPublicKeyEncryptedText,
        image: message.image,
        video: message.video,
        file: message.file,
        system: false, // Nếu không phải tin nhắn hệ thống, mặc định là `false`
      });

      // Lưu tin nhắn vào cơ sở dữ liệu
      const savedMessage = await newMessage.save();
      await savedMessage.populate({
        path: "sender",
        select: "iv _id name photos", // Chỉ lấy các trường cần thiết
      });

      const formattedMessage = (msg) => {
        const senderInfo = msg.sender
          ? {
            _id: msg.sender._id.toString(),
            name: AES.decrypt(msg.sender.name, msg.sender.iv),
            avatar: msg.sender.photos?.[0] ? AES.decrypt(msg.sender.photos?.[0], msg.sender.iv) : null,
          }
          : null;

        return {
          _id: msg._id,
          createdAt: msg.createdAt,
          pending: false,
          received: true,
          sent: false,
          text: msg.text,
          rsaDeviceInfos: [
            ...msg.senderPublicKeyEncryptedText,
            ...msg.receiverPublicKeyEncryptedText,
          ],
          revoked: msg.revoked,
          // guest: senderInfo,
          user: senderInfo,
          system: msg.system,
          image: msg.image,
          video: msg.video,
          file: msg.file,
        };
      };

      const data = formattedMessage(savedMessage);

      // // Gửi tin nhắn đến tất cả user trong phòng chat
      io.emit("newMessage", data);

      console.log("Tin nhắn đã được thêm thành công.");
    } catch (error) {
      console.error("Lỗi khi thêm tin nhắn:", error.message);
    }
  });

  socket.on("recall_message", async (data) => {
    try {
      const { messageId } = data; // messageId: id của tin nhắn cần thu hồi, userId: id của người yêu cầu thu hồi

      // Tìm tin nhắn trong cơ sở dữ liệu
      const message = await MessageModel.findById(messageId);

      if (!message) {
        return socket.emit("revoked_message_error", {
          error: "Tin nhắn không tồn tại.",
        });
      }

      // Cập nhật trạng thái của tin nhắn thành "revoked"
      message.revoked = true;
      await message.save();

      // Thông báo cho các client (kể cả người gửi và người nhận) về việc thu hồi tin nhắn
      io.emit("update_messages");

      console.log("Tin nhắn đã bị thu hồi", messageId);
    } catch (error) {
      console.error("Lỗi khi thu hồi tin nhắn:", error);
      socket.emit("revoked_message_error", {
        error: "Đã có lỗi xảy ra. Vui lòng thử lại.",
      });
    }
  });

  socket.on(
    "registerSession",
    async ({ userId, deviceId, deviceName, address }) => {
      if (!userId || !deviceId || !deviceName || !address) return;

      try {
        await Session.updateOne(
          { deviceId },
          { socketId: socket.id, userId, deviceName, address },
          { upsert: true } // Thêm mới nếu không tồn tại
        );
        console.log(
          `Session registered for userId: ${userId}, deviceId: ${deviceId}`
        );
      } catch (error) {
        console.error("Error registering session:", error);
      }
    }
  );

  socket.on("forceDisconnect", async ({ userId, deviceId, password }) => {
    const response = await UserModel.findById({ _id: userId });
    if (response && (await response.isCorrectPassword(password))) {
      try {
        const session = await Session.findOneAndDelete({ userId, deviceId });

        if (session && session.socketId) {
          // Gửi sự kiện ngắt kết nối tới thiết bị
          io.to(session.socketId).emit("forceLogout");
          socket.to(session.socketId).emit("forceLogout");
          console.log(
            `Force logout event sent to socketId: ${session.socketId}`
          );
        } else {
          console.log(
            `No active session found for userId: ${userId}, deviceId: ${deviceId}`
          );
        }
      } catch (error) {
        console.error("Error forcing disconnect:", error);
      }
    } else {
      throw new Error("Password is incorrect.");
    }
  });

  socket.on("update_rows", () => {
    io.emit("update_rows");
  });

  socket.on("blockUser", async (data) => {
    try {
      const { _id, blockedUserId } = data; // _id là ID của người dùng hiện tại, blockedUserId là ID của người bị block

      if (!_id || !blockedUserId) {
        console.log("User ID or blockedUserId is missing");
        return;
      }

      // Tìm người dùng hiện tại
      const user = await UserModel.findById(_id);
      if (!user) {
        console.log("User not found!");
        return;
      }

      // Kiểm tra xem người dùng đã bị block chưa
      if (user.listBlock.includes(blockedUserId)) {
        console.log("User is already blocked");
        return;
      }

      // Kiểm tra xem người dùng bị block có tồn tại không
      const blockedUser = await UserModel.findById(blockedUserId);
      if (!blockedUser) {
        console.log("Blocked user not found!");
        return;
      }

      // Thêm người dùng vào danh sách block
      user.listBlock.push(blockedUserId);
      await user.save();

      console.log("User blocked successfully!");

      // Thông báo cho các socket khác nếu cần
      io.emit("userBlocked", { blockerId: _id, blockedUserId });
    } catch (error) {
      console.error("Error blocking user:", error);
    }
  });

  socket.on("unblockUser", async (data) => {
    try {
      const { _id, blockedUserId } = data; // _id là ID của người dùng hiện tại, blockedUserId là ID của người dùng bị bỏ block

      if (!_id || !blockedUserId) {
        console.log("User ID or blockedUserId is missing");
        return;
      }

      // Tìm người dùng hiện tại
      const user = await UserModel.findById(_id);
      if (!user) {
        console.log("User not found!");
        return;
      }

      // Kiểm tra xem người dùng có trong danh sách block không
      if (!user.listBlock.includes(blockedUserId)) {
        console.log("User is not blocked");
        return;
      }

      // Loại bỏ người dùng khỏi danh sách block
      user.listBlock = user.listBlock.filter(
        (id) => id.toString() !== blockedUserId
      );

      // Lưu người dùng sau khi cập nhật danh sách block
      await user.save();

      console.log("User unblocked successfully!");

      // Thông báo cho các socket khác nếu cần
      io.emit("userUnblocked", { blockerId: _id, blockedUserId });
    } catch (error) {
      console.error("Error unblocking user:", error);
    }
  });

  socket.on("newLogin", async (userId, newDeviceName) => {
    console.log(`New device logged in: ${newDeviceName} for user: ${userId}`);
    const sendLoginNotificationToAllDevices = async (userId, newDeviceName) => {
      try {
        // Tìm tất cả các session của userId
        const sessions = await Session.find({ userId });

        // Nếu có session cũ, gửi thông báo tới tất cả các socketId đã đăng nhập
        sessions.forEach((session) => {
          // Tìm socketId của mỗi session cũ

          if (session.socketId && session.deviceId !== newDeviceName) {
            // Gửi thông báo tới client có socketId
            io.to(session.socketId).emit("notification", {
              message: "Một thiết bị mới vừa đăng nhập vào tài khoản cảu bạn.",
              deviceName: newDeviceName,
            });
          }
        });
      } catch (error) {
        console.error("Error while sending login notification:", error);
      }
    };
    // Gửi thông báo đến tất cả các thiết bị đang đăng nhập vào tài khoản
    await sendLoginNotificationToAllDevices(userId, newDeviceName);
  });

  socket.on("getAllRsaDeviceInfos", async (data) => {
    try {
      const { userId, guestId } = data;
      const userRsaDeviceInfos = await RsaDeviceInfo.find({ userId });
      const guestRsaDeviceInfos = await RsaDeviceInfo.find({ userId: guestId });
      socket.emit("receiveAllRsaDeviceInfos", {
        userRsaDeviceInfos,
        guestRsaDeviceInfos,
      });
    } catch (error) {
      console.error("Error while getting all RSA device infos:", error);
    }
  });
  // socket.on("sendRSAPublicKeyAndDeviceId", async (data) => {
  //   const { userId, deviceId, rsaPublicKey } = data;
  //   try {
  //     // Tìm tất cả các session của userId
  //     const sessions = await Session.find({ userId });

  //     // Nếu có session cũ, gửi thông báo tới tất cả các socketId đã đăng nhập
  //     sessions.forEach((session) => {
  //       // Tìm socketId của mỗi session cũ

  //       if (session.socketId && session.deviceId !== newDeviceName) {
  //         // Gửi thông báo tới client có socketId
  //         io.to(session.socketId).emit("receiveRSAPublicKeyAndDeviceId", {
  //           rsaPublicKey,
  //           deviceId,
  //         });
  //       }
  //     });
  //   } catch (error) {
  //     console.error("Error while sending login notification:", error);
  //   }
  // });

  socket.on("disconnect", async () => {
    try {
      // Cập nhật socketId thành null khi client mất kết nối
      await Session.updateOne({ socketId: socket.id }, { socketId: null });
      console.log(`SocketId ${socket.id} has been removed from session.`);
    } catch (error) {
      console.error("Error updating session on disconnect:", error);
    }
  });
};

module.exports = { handleSocketEvents };

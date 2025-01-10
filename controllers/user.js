const userModel = require("../models/user");
const RoomModel = require("../models/room");
const MessageModel = require("../models/message");
const Session = require("../models/session");
const RsaDeviceInfo = require("../models/rsa_device_info");
const mongoose = require("mongoose");
const { getDistanceFromLatLonInKm } = require("../ultils/haversine");

const asyncHandler = require("express-async-handler");

const getCurrentInfo = asyncHandler(async (req, res) => {
  const { _id } = req.user;
  const { deviceId } = req.body;

  try {
    const user = await userModel.findById(_id);
    const session = await Session.findOne({ userId: _id, deviceId });

    if (session && user) {
      res.status(200).json({ success: true, data: user.decryptFields() });
    } else {
      res
        .status(404)
        .json({ success: false, mes: "Session or userId not found." });
    }
  } catch (error) {
    console.error("Error in check-session:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

const updateInfo = asyncHandler(async (req, res) => {
  const { _id } = req.user;
  const {
    name,
    dateOfBirth,
    country,
    city,
    gender,
    introductory,
    hometown,
    hobby,
    height,
    weight,
    httpPhotos,
  } = req.body;

  if (!name || !dateOfBirth || !country || !city) {
    return res.status(400).json({
      success: false,
      mes: "Missing required fields!",
    });
  }

  let updatedPhotos = httpPhotos ? JSON.parse(httpPhotos) : []; // Nếu không có httpPhotos, gán là mảng rỗng.
  if (req.files && req.files.length > 0) {
    const newPhotos = req.files.map((el) => el.path);
    updatedPhotos = updatedPhotos.concat(newPhotos); // Nối các tệp mới vào mảng cũ
  }

  // try {
  //   const updatedUser = await userModel.findByIdAndUpdate(
  //     _id,
  //     {
  //       name,
  //       dateOfBirth,
  //       country,
  //       city,
  //       gender,
  //       introduce: introductory,
  //       hometown,
  //       hobbies: JSON.parse(hobby),
  //       height,
  //       weight,
  //       photos: updatedPhotos,
  //     },
  //     { new: true }
  //   );

  //   res.status(200).json({
  //     success: true,
  //     mes: "Update success!",
  //     data: updatedUser,
  //   });
  // } catch (error) {
  //   res.status(500).json({
  //     success: false,
  //     mes: "Failed to update user information.",
  //   });
  // }

  try {
    // Tìm user theo ID
    const user = await userModel.findById(_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Cập nhật các trường
    user.name = name || user.name;
    user.dateOfBirth = dateOfBirth || user.dateOfBirth;
    user.country = country || user.country;
    user.city = city || user.city;
    user.gender = gender || user.gender;
    user.hometown = hometown || user.hometown;
    user.introduce = introductory || user.introduce; // Trường sẽ được mã hóa tự động
    user.hobbies = JSON.parse(hobby) || user.hobbies;
    user.height = height || user.height;
    user.weight = weight || user.weight;
    user.photos = updatedPhotos || user.photos;

    // Gọi save để kích hoạt middleware
    await user.save();

    res.status(200).json({
      success: true,
      mes: "Update success!",
      data: user.decryptFields(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      mes: "Failed to update user information.",
    });
  }
});

const addToListLike = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại
  const { userIdToAdd } = req.body; // ID của user cần thêm vào listLike

  if (!userIdToAdd) {
    return res.status(400).json({
      success: false,
      mes: "Missing required userIdToAdd!",
    });
  }

  try {
    // Tìm user hiện tại và đối phương
    const user = await userModel.findById(_id);
    const targetUser = await userModel.findById(userIdToAdd);

    if (!user || !targetUser) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Kiểm tra nếu đối phương có trong listDislike của người dùng hiện tại
    const inListDislike = user.listDislike.includes(userIdToAdd);
    if (inListDislike) {
      // Loại bỏ đối phương khỏi listDislike của người dùng hiện tại
      user.listDislike = user.listDislike.filter(
        (userId) => userId.toString() !== userIdToAdd
      );
    }

    // Kiểm tra xem đối phương đã thích mình chưa (có trong listLike của họ)
    const inTargetUserListLike = targetUser.listLike.includes(_id);
    const inUserListLike = user.listLike.includes(userIdToAdd);

    // console.log(inTargetUserListLike);
    let roomId;
    if (inTargetUserListLike) {
      // Nếu đối phương đã thích mình, loại bỏ mình khỏi listLike của họ
      targetUser.listLike = targetUser.listLike.filter(
        (userId) => userId.toString() !== _id
      );

      // Thêm vào listMatch của cả hai người
      user.listMatch.push(userIdToAdd);
      targetUser.listMatch.push(_id);

      const userIDsObject = [userIdToAdd, _id].map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      // Kiểm tra xem phòng chat đã tồn tại chưa
      const existingRoom = await RoomModel.findOne({
        userIDs: { $all: userIDsObject }, // Kiểm tra 2 userIDs đã có trong cùng một phòng chat
      });

      if (existingRoom) {
        return res.status(400).json({
          mes: "Phòng chat đã tồn tại.",
          room: existingRoom,
        });
      }

      const newRoom = new RoomModel({ userIDs: userIDsObject });
      const check = await newRoom.save();

      roomId = check._id;

      user.roomIDs.push(check._id);
      targetUser.roomIDs.push(check._id);

      const systemMessage = new MessageModel({
        sender: _id, // Tin nhắn hệ thống không có người gửi cụ thể
        receiver: userIdToAdd,
        system: true, // Đánh dấu là tin nhắn hệ thống
        room: check._id,
        text: "Hai bạn hãy bắt đầu gửi nhau những lời yêu thương.", // Nội dung tin nhắn
      });

      await systemMessage.save();

      // Tạo phòng chat mới nếu chưa tồn tại
    } else {
      // Nếu đối phương chưa thích mình, chỉ thêm vào danh sách listLike của user hiện tại
      if (!inUserListLike) {
        user.listLike.push(userIdToAdd);
      }
    }

    // Lưu thay đổi cho cả hai người dùng
    await user.save();
    await targetUser.save();

    res.status(200).json({
      success: true,
      mes: "User added to listLike or listMatch successfully!",
      roomId,
      data: {
        listLike: user.listLike,
        listMatch: user.listMatch,
        listDislike: user.listDislike,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to add user to listLike.",
    });
  }
});

const addToListDislike = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại
  const { userIdToDislike } = req.body; // ID của user cần thêm vào listDislike

  if (!userIdToDislike) {
    return res.status(400).json({
      success: false,
      mes: "Missing required userIdToDislike!",
    });
  }

  try {
    // Tìm user hiện tại và đối phương
    const user = await userModel.findById(_id);
    const targetUser = await userModel.findById(userIdToDislike);

    if (!user || !targetUser) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Kiểm tra nếu đối phương có trong listLike của user hiện tại, nếu có thì xóa
    if (user.listLike.includes(userIdToDislike)) {
      user.listLike = user.listLike.filter(
        (userId) => userId.toString() !== userIdToDislike
      );
    }

    // Kiểm tra nếu cả hai người đang trong listMatch, nếu có thì xóa cả hai khỏi listMatch
    if (user.listMatch.includes(userIdToDislike)) {
      user.listMatch = user.listMatch.filter(
        (userId) => userId.toString() !== userIdToDislike
      );
      targetUser.listMatch = targetUser.listMatch.filter(
        (userId) => userId.toString() !== _id
      );
      // Thêm người dùng hiện tại vào listLike của đối phương
      targetUser.listLike.push(_id);
    }

    // Thêm đối phương vào listDislike của mình
    if (!user.listDislike.includes(userIdToDislike)) {
      user.listDislike.push(userIdToDislike);
    }

    // Lưu thay đổi cho cả hai người
    await user.save();
    await targetUser.save();

    res.status(200).json({
      success: true,
      mes: "User added to listDislike and updated successfully!",
      data: {
        listLike: user.listLike,
        listDislike: user.listDislike,
        listMatch: user.listMatch,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to add user to listDislike.",
    });
  }
});

const removeFromListLike = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại
  const { userIdToRemove } = req.body; // ID của user cần loại bỏ khỏi listLike

  if (!userIdToRemove) {
    return res.status(400).json({
      success: false,
      mes: "Missing required userIdToRemove!",
    });
  }

  try {
    // Tìm user hiện tại
    const user = await userModel.findById(_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Kiểm tra nếu userIdToRemove có trong listLike
    const inListLike = user.listLike.includes(userIdToRemove);

    if (!inListLike) {
      return res.status(400).json({
        success: false,
        mes: "User not found in listLike!",
      });
    }

    // Loại bỏ userIdToRemove khỏi listLike
    user.listLike = user.listLike.filter(
      (userId) => userId.toString() !== userIdToRemove
    );

    // Lưu thay đổi
    await user.save();

    res.status(200).json({
      success: true,
      mes: "User removed from listLike successfully!",
      data: {
        listLike: user.listLike,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to remove user from listLike.",
    });
  }
});

const removeFromListDislike = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại
  const { userIdToRemove } = req.body; // ID của user cần loại bỏ khỏi listDislike

  if (!userIdToRemove) {
    return res.status(400).json({
      success: false,
      mes: "Missing required userIdToRemove!",
    });
  }

  try {
    // Tìm user hiện tại
    const user = await userModel.findById(_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Kiểm tra nếu userIdToRemove có trong listDislike
    const inListDislike = user.listDislike.includes(userIdToRemove);

    if (!inListDislike) {
      return res.status(400).json({
        success: false,
        mes: "User not found in listDislike!",
      });
    }

    // Loại bỏ userIdToRemove khỏi listDislike
    user.listDislike = user.listDislike.filter(
      (userId) => userId.toString() !== userIdToRemove
    );

    // Lưu thay đổi
    await user.save();

    res.status(200).json({
      success: true,
      mes: "User removed from listDislike successfully!",
      data: {
        listDislike: user.listDislike,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to remove user from listDislike.",
    });
  }
});

const getAllUsersExcludingLists = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại

  try {
    // Tìm thông tin người dùng hiện tại
    const user = await userModel.findById(_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Lọc danh sách users ngoại trừ những người có trong listLike, listDislike, và listMatch
    const excludedUsers = [
      _id,
      ...user.listLike,
      ...user.listDislike,
      ...user.listMatch,
    ];

    // Tìm tất cả users nhưng loại bỏ những user trong danh sách excludedUsers
    const users = await userModel
      .find({
        _id: { $nin: excludedUsers },
      })
      .select("-password");
    // Loại bỏ password khỏi kết quả

    users.forEach((user) => {
      if (user.decryptFields) {
        user.decryptFields(); // Giải mã từng đối tượng người dùng
      }
    });

    const transformUsers = (users) => {
      return users.map((user) => {
        const { _id, name, introduce, dateOfBirth, city, photos } = user;

        return {
          ...user,
          userID: _id,
          name: name,
          introduce: introduce,
          age: new Date().getFullYear() - new Date(dateOfBirth).getFullYear(),
          address: city,
          listImages: photos,
          // ...user,
        };
      });
    };

    // users.length > 0 && users.decryptFields();

    // lọc nhung user khong co name
    const data = transformUsers(users.map((user) => user.decryptFields())).filter((user) => user.name);

    res.status(200).json({
      success: true,
      mes: "Users fetched successfully!",
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to fetch users.",
    });
  }
});

// const getAllUsersExcludingLists = asyncHandler(async (req, res) => {
//   const { _id } = req.user; // ID của user hiện tại
//   const { ageMax, ageMin, gender } = req.body.filter || {}; // Lọc theo filter nếu có

//   try {
//     // Tìm thông tin người dùng hiện tại
//     const user = await userModel.findById(_id);

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         mes: "User not found!",
//       });
//     }

//     // Lọc danh sách users ngoại trừ những người có trong listLike, listDislike, và listMatch
//     const excludedUsers = [
//       _id,
//       ...user.listLike,
//       ...user.listDislike,
//       ...user.listMatch,
//     ];

//     // Tạo điều kiện truy vấn thêm các filter
//     const filterConditions = {
//       _id: { $nin: excludedUsers }, // Loại bỏ các user đã có trong danh sách loại trừ
//     };

//     // Nếu có filter về độ tuổi, thêm vào điều kiện lọc
//     if (ageMax)
//       filterConditions["dateOfBirth"] = {
//         $gte: new Date().setFullYear(new Date().getFullYear() - ageMax),
//       };
//     if (ageMin)
//       filterConditions["dateOfBirth"] = {
//         ...filterConditions["dateOfBirth"],
//         $lte: new Date().setFullYear(new Date().getFullYear() - ageMin),
//       };
//     if (gender) filterConditions["gender"] = gender;

//     // Tìm tất cả users nhưng loại bỏ những user trong danh sách excludedUsers và áp dụng filter
//     const users = await userModel.find(filterConditions).select("-password"); // Loại bỏ password khỏi kết quả

//     const transformUsers = (users) => {
//       return users.map((user) => {
//         const { _id, name, introduce, dateOfBirth, city, photos } = user;

//         return {
//           ...user,
//           userID: _id,
//           name: name,
//           introduce: introduce,
//           age: new Date().getFullYear() - new Date(dateOfBirth).getFullYear(),
//           address: city,
//           listImages: photos,
//         };
//       });
//     };

//     const data = transformUsers(users.map((user) => user.decryptFields()));

//     res.status(200).json({
//       success: true,
//       mes: "Users fetched successfully!",
//       data,
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       mes: error.message || "Failed to fetch users.",
//     });
//   }
// });

const getUsersInLikeList = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại

  try {
    // Tìm thông tin người dùng hiện tại
    const user = await userModel.findById(_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Lấy danh sách người dùng có trong listLike
    const usersInLike = await userModel
      .find({
        _id: { $in: user.listLike }, // Tìm những người có ID trong listLike
      })
      .select("-password"); // Loại bỏ password khỏi kết quả

    usersInLike.forEach((user) => {
      if (user.decryptFields) {
        user.decryptFields(); // Giải mã từng đối tượng người dùng
      }
    });

    const transformUsers = (users) => {
      return users.map((user) => {
        const { _id, name, gender, dateOfBirth, city, photos } = user;

        return {
          ...user,
          userID: _id,
          name: name,
          gender: gender,
          age: new Date().getFullYear() - new Date(dateOfBirth).getFullYear(),
          address: city,
          photo: photos[0],
          // ...user,
        };
      });
    };

    const data = transformUsers(usersInLike.map((user) => user.decryptFields()));

    res.status(200).json({
      success: true,
      mes: "Users in listLike fetched successfully!",
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to fetch users in listLike.",
    });
  }
});

const getUsersInDislikeList = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại

  try {
    // Tìm thông tin người dùng hiện tại
    const user = await userModel.findById(_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Lấy danh sách người dùng có trong listDislike
    const usersInDislike = await userModel
      .find({
        _id: { $in: user.listDislike }, // Tìm những người có ID trong listDislike
      })
      .select("-password"); // Loại bỏ password khỏi kết quả

    usersInDislike.forEach((user) => {
      if (user.decryptFields) {
        user.decryptFields(); // Giải mã từng đối tượng người dùng
      }
    });

    res.status(200).json({
      success: true,
      mes: "Users in listDislike fetched successfully!",
      data: usersInDislike,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to fetch users in listDislike.",
    });
  }
});

const getUsersInMatchList = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại

  try {
    // Tìm thông tin người dùng hiện tại
    const user = await userModel.findById(_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Lấy danh sách người dùng có trong listMatch
    const usersInMatch = await userModel
      .find({
        _id: { $in: user.listMatch }, // Tìm những người có ID trong listMatch
      })
      .select("-password"); // Loại bỏ password khỏi kết quả

    usersInMatch.forEach((user) => {
      if (user.decryptFields) {
        user.decryptFields(); // Giải mã từng đối tượng người dùng
      }
    });

    res.status(200).json({
      success: true,
      mes: "Users in listMatch fetched successfully!",
      data: usersInMatch,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to fetch users in listMatch.",
    });
  }
});

const getUsersWhoLikedMe = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại

  try {
    // Tìm tất cả người dùng đã thích người dùng hiện tại (ID của người dùng hiện tại có trong listLike của họ)
    const usersWhoLikedMe = await userModel
      .find({
        listLike: { $in: [_id] }, // Tìm những người có ID người dùng hiện tại trong listLike của họ
      })
      .select("-password"); // Loại bỏ password khỏi kết quả

    usersWhoLikedMe.forEach((user) => {
      if (user.decryptFields) {
        user.decryptFields(); // Giải mã từng đối tượng người dùng
      }
    });

    const transformUsers = (users) => {
      return users.map((user) => {
        const { _id, name, gender, dateOfBirth, city, photos } = user;

        return {
          ...user,
          userID: _id,
          name: name,
          gender: gender,
          age: new Date().getFullYear() - new Date(dateOfBirth).getFullYear(),
          address: city,
          photo: photos[0],
          // ...user,
        };
      });
    };

    const data = transformUsers(usersWhoLikedMe.map((user) => user.decryptFields()));

    res.status(200).json({
      success: true,
      mes: "Users who liked you fetched successfully!",
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to fetch users who liked you.",
    });
  }
});

const getUserInfo = asyncHandler(async (req, res) => {
  const { userId } = req.body; // Lấy userId từ body

  if (!userId) {
    return res.status(400).json({
      success: false,
      mes: "User ID is required!",
    });
  }

  try {
    // Tìm thông tin người dùng theo userId
    const user = await userModel.findById(userId).select("-password"); // Loại bỏ password khỏi kết quả

    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // const { _id, name, introduce, dateOfBirth, city, photos, ...userInfo } =
    //   user;

    res.status(200).json({
      success: true,
      mes: "User info fetched successfully!",
      data: user.decryptFields(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      mes: error.message || "Failed to fetch user info.",
    });
  }
});

const getUserNearBy = asyncHandler(async (req, res) => {
  try {
    const radius = 2;
    const { latitude, longitude } = req.body;
    const { _id } = req.user;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Vui lòng cung cấp tọa độ." });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    const currentUser = await userModel
      .findById(_id)
      .select("listLike listDislike listMatch");
    if (!currentUser) {
      return res.status(404).json({ error: "Không tìm thấy người dùng." });
    }

    // Lấy tất cả người dùng
    const users = await userModel.find({
      _id: {
        $nin: [
          // ...currentUser.listLike,
          ...currentUser.listDislike,
          ...currentUser.listMatch,
          _id,
        ],
      }, // Lọc bỏ những người trong danh sách
      latitude: { $ne: null }, // Lọc bỏ người dùng không có tọa độ
      longitude: { $ne: null },
    });
    // .select("_id photos latitude longitude");

    users.forEach((user) => {
      if (user.decryptFields) {
        user.decryptFields(); // Giải mã từng đối tượng người dùng
      }
    });

    // Lọc người dùng theo bán kính
    const nearbyUsers = users.filter((user) => {
      if (!user.latitude || !user.longitude) return false; // Bỏ qua nếu không có tọa độ
      const distance = getDistanceFromLatLonInKm(
        lat,
        lon,
        user.latitude,
        user.longitude
      );
      return distance <= radius;
    });

    // Định dạng lại kết quả trả về
    const response = nearbyUsers.map((user) => ({
      _id: user._id,
      photo: user.photos[0] || null, // Lấy ảnh đầu tiên (nếu có)
      latitude: user.latitude,
      longitude: user.longitude,
      userInfo: user,
    }));

    return res.status(200).json(response);
  } catch (error) {
    console.error("Lỗi khi tìm kiếm user:", error);
    return res
      .status(500)
      .json({ error: "Lỗi máy chủ. Vui lòng thử lại sau." });
  }
});

const updateUserLocation = asyncHandler(async (req, res) => {
  try {
    const { _id } = req.user; // Lấy userId từ route params
    const { latitude, longitude } = req.body; // Lấy tọa độ từ body request

    // Kiểm tra đầu vào
    if (latitude === undefined || longitude === undefined) {
      return res
        .status(400)
        .json({ error: "Latitude và Longitude là bắt buộc." });
    }

    // Tìm và cập nhật vị trí của người dùng
    const user = await userModel.findByIdAndUpdate(
      _id,
      { latitude, longitude },
      { new: true, runValidators: true } // Trả về user sau khi cập nhật
    );

    // Nếu không tìm thấy user
    if (!user) {
      return res.status(404).json({ error: "Không tìm thấy người dùng." });
    }

    // Trả về thông tin người dùng đã cập nhật
    res.status(200).json({
      message: "Cập nhật vị trí thành công.",
      user: {
        id: user._id,
        latitude: user.latitude,
        longitude: user.longitude,
      },
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật vị trí:", error);
    res.status(500).json({ error: "Đã xảy ra lỗi máy chủ." });
  }
});

const getAllUsersFilter = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại
  const { gender, minAge, maxAge } = req.body; // Lấy điều kiện lọc từ query params

  // Kiểm tra bắt buộc các tham số
  if (!gender || !minAge || !maxAge) {
    return res.status(400).json({
      success: false,
      mes: "Missing required filters: gender, minAge, and maxAge",
    });
  }

  try {
    // Tìm thông tin người dùng hiện tại
    const user = await userModel.findById(_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Lọc danh sách users ngoại trừ những người có trong listLike, listDislike, và listMatch
    const excludedUsers = [
      _id,
      ...user.listLike,
      ...user.listDislike,
      ...user.listMatch,
    ];

    // Tính toán khoảng năm sinh dựa trên minAge và maxAge
    const currentYear = new Date().getFullYear();
    const minYearOfBirth = currentYear - maxAge; // Năm sinh nhỏ nhất
    const maxYearOfBirth = currentYear - minAge; // Năm sinh lớn nhất

    // Tìm tất cả users với điều kiện lọc
    const users = await userModel
      .find({
        _id: { $nin: excludedUsers }, // Loại bỏ các ID trong excludedUsers
        gender, // Lọc theo giới tính
        dateOfBirth: {
          // Lọc theo khoảng tuổi
          $gte: new Date(`${minYearOfBirth}-01-01`), // Sinh sau ngày 1/1 của năm nhỏ nhất
          $lte: new Date(`${maxYearOfBirth}-12-31`), // Sinh trước ngày 31/12 của năm lớn nhất
        },
      })
      .select("-password"); // Loại bỏ password khỏi kết quả trả về

    // Chuyển đổi dữ liệu người dùng thành định dạng mong muốn
    const transformUsers = (users) => {
      return users.map((user) => {
        const { _id, name, introduce, dateOfBirth, city, photos } = user;

        return {
          ...user,
          userID: _id, // Đổi `_id` thành `userID`
          name, // Tên người dùng
          introduce, // Lời giới thiệu
          age: currentYear - new Date(dateOfBirth).getFullYear(), // Tính tuổi
          address: city, // Thành phố
          listImages: photos, // Danh sách ảnh
        };
      });
    };

    const data = transformUsers(users.map((user) => user.decryptFields()));

    // Trả về kết quả
    res.status(200).json({
      success: true,
      mes: "Users fetched successfully!",
      data,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách người dùng:", error.message);

    res.status(500).json({
      success: false,
      mes: "Internal Server Error",
    });
  }
});

const getUserSessions = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại
  const { deviceId } = req.body;
  try {
    const sessions = await Session.find({ userId: _id });

    const filteredSessions = sessions.filter(
      (session) => session.deviceId !== deviceId
    );

    res.status(200).json(filteredSessions);
  } catch (error) {
    console.error("Error in /sessions:", error);
    res.status(500).json({ mes: "Internal server error." });
  }
});

const updateUserFilter = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của user hiện tại
  const { filter } = req.body; // Lấy thông tin filter từ body yêu cầu

  if (!filter) {
    return res.status(400).json({ mes: "Filter is required" });
  }

  try {
    // Cập nhật filter cho người dùng
    const updatedUser = await User.findByIdAndUpdate(
      _id,
      { filter: filter },
      { new: true } // Trả về bản ghi đã cập nhật
    );

    if (!updatedUser) {
      return res.status(404).json({ mes: "User not found" });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error in updating user filter:", error);
    res.status(500).json({ mes: "Internal server error." });
  }
});

const blockUser = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của người dùng hiện tại
  const { blockedUserId } = req.body; // ID của người dùng bị block

  if (!_id || !blockedUserId) {
    return res.status(400).json({
      success: false,
      mes: "User ID or blockedUserId is missing",
    });
  }

  try {
    // Tìm người dùng hiện tại
    const user = await userModel.findById(_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Kiểm tra xem người dùng đã bị block chưa
    if (user.listBlock.includes(blockedUserId)) {
      return res.status(400).json({
        success: false,
        mes: "User is already blocked",
      });
    }

    // Kiểm tra xem người dùng bị block có tồn tại không
    const blockedUser = await userModel.findById(blockedUserId);
    if (!blockedUser) {
      return res.status(404).json({
        success: false,
        mes: "Blocked user not found!",
      });
    }

    // Thêm người dùng vào danh sách block
    user.listBlock.push(blockedUserId);

    // Lưu người dùng sau khi cập nhật danh sách block
    await user.save();

    res.status(200).json({
      success: true,
      mes: "User blocked successfully!",
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({
      success: false,
      mes: "Internal server error",
    });
  }
});

const unblockUser = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của người dùng hiện tại
  const { blockedUserId } = req.body; // ID của người dùng bị bỏ block

  if (!_id || !blockedUserId) {
    return res.status(400).json({
      success: false,
      mes: "User ID or blockedUserId is missing",
    });
  }

  try {
    // Tìm người dùng hiện tại
    const user = await userModel.findById(_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        mes: "User not found!",
      });
    }

    // Kiểm tra xem người dùng có trong danh sách block không
    if (!user.listBlock.includes(blockedUserId)) {
      return res.status(400).json({
        success: false,
        mes: "User is not blocked",
      });
    }

    // Loại bỏ người dùng khỏi danh sách block
    user.listBlock = user.listBlock.filter(
      (id) => id.toString() !== blockedUserId
    );

    // Lưu người dùng sau khi cập nhật danh sách block
    await user.save();

    res.status(200).json({
      success: true,
      mes: "User unblocked successfully!",
    });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({
      success: false,
      mes: "Internal server error",
    });
  }
});

const uploadImages = asyncHandler(async (req, res) => {
  if (req.files && req.files.length > 0) {
    const newPhotos = req.files.map((el) => el.path);
    res.status(200).json({
      success: true,
      data: newPhotos,
    });
  } else {
    res.status(500).json({
      success: false,
      mes: "Upload error.",
    });
  }
});

const sendRsaDeviceInfo = asyncHandler(async (req, res) => {
  const { _id } = req.user; // ID của người dùng hiện tại

  const { rsaPublicKey, deviceId } = req.body; // Lấy thông tin RSA public key và device ID từ body request

  if (!rsaPublicKey || !deviceId) {
    return res.status(400).json({
      success: false,
      mes: "RSA public key and device ID are required",
    });
  }

  // kiểm tra xem đã có người dùng với thông tin device ID này chưa
  const existingRsaDeviceInfo = await RsaDeviceInfo.findOne({
    userId: _id,
    deviceId: deviceId,
  });

  if (existingRsaDeviceInfo) {
    console.log("RSA public key đã tồn tại");
    // Nếu đã tồn tại, cập nhật RSA public key mới
    existingRsaDeviceInfo.publicKey = rsaPublicKey;
    await existingRsaDeviceInfo.save();
    return res.status(200).json({
      success: true,
      mes: "RSA public key sent successfully!",
    });
  }

  // Nếu chưa tồn tại, tạo mới thông tin RSA public key
  const newRsaDeviceInfo = new RsaDeviceInfo({
    userId: _id,
    publicKey: rsaPublicKey,
    deviceId: deviceId,
  });

  await newRsaDeviceInfo.save();

  res.status(200).json({
    success: true,
    mes: "RSA public key sent successfully!",
  });
});

module.exports = {
  removeFromListLike,
  getUserInfo,
  getCurrentInfo,
  updateInfo,
  addToListLike,
  addToListDislike,
  removeFromListLike,
  removeFromListDislike,
  getAllUsersExcludingLists,
  getUsersInLikeList,
  getUsersInDislikeList,
  getUsersInMatchList,
  getUsersWhoLikedMe,
  getUserNearBy,
  updateUserLocation,
  getAllUsersFilter,
  getUserSessions,
  updateUserFilter,
  blockUser,
  unblockUser,
  uploadImages,
  sendRsaDeviceInfo,
};

var express = require("express");
var router = express.Router();
const {
  getUserInfo,
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
  getCurrentInfo,
  updateUserLocation,
  getUserNearBy,
  updateUserFilter,
  getUserSessions,
  blockUser,
  unblockUser,
  uploadImages,
  sendRsaDeviceInfo,
} = require("../controllers/user");
const { verifyAccessToken } = require("../middlewares/verifyToken");
const uploadImage = require("../config/cloudinary.config");

router.post("/get-current-info", verifyAccessToken, getCurrentInfo);
router.post("/get-user-info", verifyAccessToken, getUserInfo);
router.post(
  "/update-info",
  verifyAccessToken,
  uploadImage.array("images", 6),
  updateInfo
);
router.post("/remove-from-listlike", verifyAccessToken, removeFromListLike);
router.post(
  "/remove-from-listdislike",
  verifyAccessToken,
  removeFromListDislike
);
router.post("/add-to-listlike", verifyAccessToken, addToListLike);
router.post("/add-to-listdislike", verifyAccessToken, addToListDislike);
router.get("/all", verifyAccessToken, getAllUsersExcludingLists);
router.get("/all-user-in-listlike", verifyAccessToken, getUsersInLikeList);
router.get(
  "/all-user-in-listdislike",
  verifyAccessToken,
  getUsersInDislikeList
);
router.get("/all-user-in-listmatch", verifyAccessToken, getUsersInMatchList);
router.get("/all-user-like-me", verifyAccessToken, getUsersWhoLikedMe);
router.put("/location", verifyAccessToken, updateUserLocation);
router.post("/get-user-nearby", verifyAccessToken, getUserNearBy);
router.put("/update-user-filter", verifyAccessToken, updateUserFilter);
router.post("/get-user-sessions", verifyAccessToken, getUserSessions);
router.post("/block-user", verifyAccessToken, blockUser);
router.post("/unblock-user", verifyAccessToken, unblockUser);
router.post(
  "/upload-images",
  verifyAccessToken,
  uploadImage.array("images", 6),
  uploadImages
);
router.post("/send-rsa-device-info", verifyAccessToken, sendRsaDeviceInfo);
module.exports = router;

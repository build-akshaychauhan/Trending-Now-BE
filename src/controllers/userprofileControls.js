import jwt from "jsonwebtoken";
import {
  generateUniqueUsername,
  isUsernameAvailable,
} from "../utils/usernameGen.js";
import SocialAllDump from "../models/SocialAllDump.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import Article from "../models/ArticleStore.js";
import Creator from "../models/Creator.js";
import {
  normaliseInstagram,
  normaliseTwitter,
  normaliseYouTubeShorts,
} from "../utils/normalizer.js";

// REGISTER OR LOGIN
export const createOrLoginUser = async (req, res) => {
  try {
    const { firebaseUid, firstName, lastName, email, profileImage } = req.body;

    // REQUIRED CHECK
    if (!firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "Firebase UID is required",
      });
    }

    // FIND EXISTING USER
    let user = await User.findOne({
      firebaseUid,
    });

    let isNewUser = false;

    // CREATE NEW USER
    if (!user) {
      isNewUser = true;

      const usernamePicker = await generateUniqueUsername(email);
      console.log(usernamePicker);

      user = await User.create({
        firebaseUid,
        username: usernamePicker,
        firstName,
        lastName,
        email,
        profileImage,
      });
    }

    // CREATE APP JWT TOKENS
    const accessToken = jwt.sign(
      {
        userId: user._id,
        firebaseUid: user.firebaseUid,
      },
      process.env.JWT_SECRET_ACCESS,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRY_TIME,
      },
    );

    const refreshToken = jwt.sign(
      {
        userId: user._id,
        firebaseUid: user.firebaseUid,
      },
      process.env.JWT_SECRET_REFRESH,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRY_TIME,
      },
    );

    return res.status(200).json({
      success: true,
      message: isNewUser ? "User registered successfully" : "Login successful",
      tokens: { accessToken, refreshToken },
      data: user,
    });
  } catch (error) {
    console.log("User register/login failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET SINGLE USER
export const getUserById = async (req, res) => {
  try {
    const firebase_uid = req.auth_firebase_uid || "";

    const user = await User.findOne({ firebaseUid: firebase_uid }).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// UPDATE USER
export const updateUser = async (req, res) => {
  try {
    const firebase_uid = req.auth_firebase_uid || "";
    const updates = { ...req.body };

    const existingUser = await User.findOne({
      firebaseUid: firebase_uid,
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (updates.username) {
      const username = updates.username.trim().toLowerCase();

      const usernameChanged = username !== existingUser.username;

      if (usernameChanged) {
        const available = await isUsernameAvailable(username);

        if (!available) {
          return res.status(400).json({
            success: false,
            message: "Username taken",
          });
        }
      }

      updates.username = username.trim().toLowerCase();
    }

    // prevent firebaseUid update
    if (updates.firebaseUid) {
      delete updates.firebaseUid;
    }

    console.log(updates);
    const user = await User.findOneAndUpdate(
      { firebaseUid: firebase_uid },
      updates,
      {
        returnDocument: "after",
        runValidators: true,
      },
    ).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// DELETE USER
export const deleteUser = async (req, res) => {
  try {
    const firebase_uid = req.auth_firebase_uid || "";

    const user = await User.findOneAndDelete({
      firebaseUid: firebase_uid,
    }).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GENERATE NEW ACCESS TOKEN USING REFRESH TOKEN
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    // VERIFY REFRESH TOKEN
    jwt.verify(
      refreshToken,
      process.env.JWT_SECRET_REFRESH,
      async (err, decoded) => {
        if (err) {
          return res.status(403).json({
            success: false,
            message: "Invalid or expired refresh token",
          });
        }

        // CREATE NEW ACCESS TOKEN
        const accessToken = jwt.sign(
          {
            userId: decoded.userId,
            firebaseUid: decoded.firebaseUid,
          },
          process.env.JWT_SECRET_ACCESS,
          {
            expiresIn: process.env.JWT_ACCESS_EXPIRY_TIME,
          },
        );

        return res.status(200).json({
          success: true,
          accessToken,
        });
      },
    );
  } catch (e) {
    console.log("REFRESH TOKEN ERROR:", e);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// USER COMMENTS
export const createComment = async (req, res) => {
  try {
    const firebase_uid = req.auth_firebase_uid;
    const { source, headline, topic, postId, comment, stance } = req.body;

    let is_stack = false;

    if (!firebase_uid || !source || !postId || !comment) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    const allowedStances = ["support", "oppose"];

    if (stance && !allowedStances.includes(stance)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stance",
      });
    }

    const user = await User.findOne({ firebaseUid: firebase_uid }).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (source !== "feed") {
      const articleExists =
        source === "news" ? !!(await Article.findById(postId)) : null;

      if (source === "news" && !articleExists) {
        return res.status(404).json({
          success: false,
          message: "Article does not exist",
        });
      }

      if (source !== "news") {
        const postExists = await SocialAllDump.exists({
          $or: [
            { "instagram.postId": postId },
            { "twitter.tweetId": postId },
            { "youtubeShorts.shortId": postId },
          ],
        });

        if (!postExists) {
          return res.status(404).json({
            success: false,
            message: "Post does not exist",
          });
        }
      }
    }

    if (topic) {
      is_stack = true;
    }

    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      UserObject_id: user._id,
      user_id: user.firebaseUid,
      comment,
      eventDate: new Date(),
    };

    const data = await Comment.findOneAndUpdate(
      { postId },
      {
        $setOnInsert: {
          postId,
          source,
          headline,
          topic,
          is_stack,
        },
        ...(stance && {
          $inc: { [`stances.${stance}`]: 1 },
        }),
        $push: {
          comments: newComment,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
      },
    )
      .populate("comments.UserObject_id", "username profileImage")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Comment added successfully",
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getComments = async (req, res) => {
  try {
    const { postId } = req.params;

    const comments = await Comment.findOne({ postId })
      .populate("comments.UserObject_id", "username profileImage")
      .lean();

    if (!comments) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    return res.status(200).json({
      success: true,
      data: comments,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const firebase_uid = req.auth_firebase_uid;
    const { postId, commentId } = req.body;

    const user = await User.findOne({
      firebaseUid: firebase_uid,
    }).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const result = await Comment.findOneAndUpdate(
      {
        postId,
        comments: {
          $elemMatch: {
            _id: commentId,
            user_id: user.firebaseUid,
          },
        },
      },
      {
        $pull: {
          comments: {
            _id: commentId,
            user_id: user.firebaseUid,
          },
        },
      },
      {
        returnDocument: "after",
      },
    )
      .populate("comments.UserObject_id", "username profileImage")
      .lean();

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Comment not found or you are not authorized to delete it",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const addFavouriteCreator = async (req, res) => {
  try {
    const { creatorId } = req.body;
    const firebaseUid = req.auth_firebase_uid;

    if (!mongoose.Types.ObjectId.isValid(creatorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid creator id",
      });
    }

    const creatorExists = await Creator.exists({ _id: creatorId });

    if (!creatorExists) {
      return res.status(404).json({
        success: false,
        message: "Creator not found",
      });
    }

    const user = await User.findOneAndUpdate(
      { firebaseUid },
      {
        $addToSet: {
          favoriteCreators: creatorId,
        },
      },
      {
        returnDocument: "after",
      },
    ).populate("favoriteCreators");

    return res.json({
      success: true,
      message: "Creator added to favourites",
      data: user.favoriteCreators,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const removeFavouriteCreator = async (req, res) => {
  try {
    const { creatorId } = req.body;
    const firebaseUid = req.auth_firebase_uid;

    if (!mongoose.Types.ObjectId.isValid(creatorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid creator id",
      });
    }

    const user = await User.findOneAndUpdate(
      { firebaseUid },
      {
        $pull: {
          favoriteCreators: creatorId,
        },
      },
      {
        returnDocument: "after",
      },
    ).populate("favoriteCreators");

    return res.json({
      success: true,
      message: "Creator removed from favourites",
      data: user.favoriteCreators,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getFavouriteCreators = async (req, res) => {
  try {
    const firebaseUid = req.auth_firebase_uid;

    const user = await User.findOne({ firebaseUid }).populate(
      "favoriteCreators",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      count: user.favoriteCreators.length,
      data: user.favoriteCreators,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const addBookmarkPost = async (req, res) => {
  try {
    const { postId, platform } = req.body;
    const firebaseUid = req.auth_firebase_uid;

    if (!postId || !platform) {
      return res.status(400).json({
        success: false,
        message: "postId and model are required",
      });
    }
    const model = platform;

    if (!["news", "instagram", "twitter", "youtube_shorts"].includes(model)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post model",
      });
    }

    const postIdString = String(postId);

    let bookmarkData = {
      postId: postIdString,
      model,
    };

    // -----------------------------
    // ARTICLE
    // -----------------------------
    if (model === "news") {
      if (!mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Article id",
        });
      }

      const articleExists = await Article.exists({
        _id: postId,
      });

      if (!articleExists) {
        return res.status(404).json({
          success: false,
          message: "Article not found",
        });
      }
    }

    // -----------------------------
    // SOCIAL
    // -----------------------------
    else {
      let query;

      if (model === "instagram") {
        query = {
          "instagram.postId": String(postId),
        };
      }

      if (model === "youtube_shorts") {
        query = {
          "youtubeShorts.shortId": String(postId),
        };
      }

      if (model === "twitter") {
        query = {
          "twitter.tweetId": String(postId),
        };
      }

      const socialDump = await SocialAllDump.findOne(query, { _id: 1 }).lean();

      if (!socialDump) {
        return res.status(404).json({
          success: false,
          message: "Social post not found",
        });
      }

      bookmarkData.socialDumpId = socialDump._id;
    }

    // -----------------------------
    // ADD BOOKMARK
    // -----------------------------
    const user = await User.findOneAndUpdate(
      {
        firebaseUid,
        bookmarkPosts: {
          $not: {
            $elemMatch: {
              postId: postIdString,
              model,
            },
          },
        },
      },
      {
        $addToSet: {
          bookmarkPosts: bookmarkData,
        },
      },
      {
        returnDocument: "after",
      },
    );

    if (!user) {
      const existingUser = await User.findOne({
        firebaseUid,
      });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.json({
        success: true,
        message: "Post already bookmarked",
        data: existingUser.bookmarkPosts,
      });
    }

    return res.json({
      success: true,
      message: "Post bookmarked",
      data: user.bookmarkPosts,
    });
  } catch (err) {
    console.error("addBookmarkPost error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const removeBookmarkPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const firebaseUid = req.auth_firebase_uid;

    if (!postId || !postId.trim()) {
      return res.status(400).json({
        success: false,
        message: "postId is required",
      });
    }

    const user = await User.findOneAndUpdate(
      { firebaseUid },
      {
        $pull: {
          bookmarkPosts: {
            postId: String(postId),
          },
        },
      },
      {
        returnDocument: "after",
      },
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      message: "Post bookmark removed",
      data: user.bookmarkPosts,
    });
  } catch (err) {
    console.error("removeBookmarkPost error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getBookmarkPost = async (req, res) => {
  try {
    const firebaseUid = req.auth_firebase_uid;

    const user = await User.findOne({
      firebaseUid,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const bookmarks = user.bookmarkPosts || [];

    // -----------------------------------------
    // Separate bookmarks
    // -----------------------------------------

    const articleIds = [];
    const socialDumpIds = [];

    for (const bookmark of bookmarks) {
      if (bookmark.model === "news") {
        if (mongoose.Types.ObjectId.isValid(bookmark.postId)) {
          articleIds.push(bookmark.postId);
        }
      } else if (bookmark.socialDumpId) {
        socialDumpIds.push(bookmark.socialDumpId);
      }
    }

    // -----------------------------------------
    // Get actual documents
    // -----------------------------------------

    const [articles, socialDumps] = await Promise.all([
      articleIds.length
        ? Article.find({
            _id: {
              $in: articleIds,
            },
          }).lean()
        : [],

      socialDumpIds.length
        ? SocialAllDump.find({
            _id: {
              $in: socialDumpIds,
            },
          }).lean()
        : [],
    ]);

    // -----------------------------------------
    // Valid IDs
    // -----------------------------------------

    const validArticleIds = new Set(
      articles.map((article) => article._id.toString()),
    );

    const validSocialDumpIds = new Set(
      socialDumps.map((dump) => dump._id.toString()),
    );

    // -----------------------------------------
    // Remove deleted/stale bookmarks
    // -----------------------------------------

    const validBookmarks = bookmarks.filter((bookmark) => {
      if (bookmark.model === "news") {
        return validArticleIds.has(String(bookmark.postId));
      }

      if (["instagram", "twitter", "youtube_shorts"].includes(bookmark.model)) {
        return (
          bookmark.socialDumpId &&
          validSocialDumpIds.has(bookmark.socialDumpId.toString())
        );
      }

      return false;
    });

    // -----------------------------------------
    // Update DB ONLY if stale bookmarks exist
    // -----------------------------------------

    if (validBookmarks.length !== bookmarks.length) {
      user.bookmarkPosts = validBookmarks;

      await user.save();
    }

    // -----------------------------------------
    // Create social post collections
    // -----------------------------------------

    let merged = {
      instagram: [],
      twitter: [],
      youtubeShorts: [],
    };

    for (const n of articles) {
      n.platform = "news";
    }

    for (const dump of socialDumps) {
      merged.instagram.push(
        ...(Array.isArray(dump.instagram)
          ? dump.instagram.map((post) => ({
              ...post,
              creatorName: dump.creatorName,
            }))
          : []),
      );

      merged.twitter.push(
        ...(Array.isArray(dump.twitter)
          ? dump.twitter.map((post) => ({
              ...post,
              creatorName: dump.creatorName,
            }))
          : []),
      );

      merged.youtubeShorts.push(
        ...(Array.isArray(dump.youtubeShorts)
          ? dump.youtubeShorts.map((post) => ({
              ...post,
              creatorName: dump.creatorName,
            }))
          : []),
      );
    }

    // -----------------------------------------
    // Dedupe helper
    // -----------------------------------------

    const dedupeByKey = (arr, key) =>
      Object.values(
        Object.fromEntries(
          arr.map((item, index) => [item?.[key] || `fallback_${index}`, item]),
        ),
      );

    // -----------------------------------------
    // Normalize social data
    // -----------------------------------------

    const instagram = normaliseInstagram(
      dedupeByKey(merged.instagram, "postId"),
    );

    const twitter = normaliseTwitter(dedupeByKey(merged.twitter, "tweetId"));

    const youtubeShorts = normaliseYouTubeShorts(
      dedupeByKey(merged.youtubeShorts, "url"),
    );

    // -----------------------------------------
    // Create lookup maps
    // -----------------------------------------

    const instagramMap = new Map(
      instagram.map((post) => [String(post.postId), post]),
    );

    const twitterMap = new Map(
      twitter.map((post) => [String(post.tweetId), post]),
    );

    const youtubeMap = new Map(
      youtubeShorts.map((post) => [String(post.shortId), post]),
    );

    const articleMap = new Map(
      articles.map((article) => [article._id.toString(), article]),
    );

    // -----------------------------------------
    // Build response only
    // DB bookmarkPosts remains unchanged
    // -----------------------------------------

    const responseData = validBookmarks.map((bookmark) => {
      let postData = null;

      const postId = String(bookmark.postId);
      if (bookmark.model === "news") {
        postData = articleMap.get(postId) || null;
      }

      if (bookmark.model === "instagram") {
        postData = instagramMap.get(postId) || null;
      }

      if (bookmark.model === "twitter") {
        postData = twitterMap.get(postId) || null;
      }

      if (bookmark.model === "youtube_shorts") {
        postData = youtubeMap.get(postId) || null;
      }

      return postData;
    });

    // -----------------------------------------
    // Return
    // -----------------------------------------

    return res.json({
      success: true,
      count: responseData.length,
      data: responseData,
    });
  } catch (err) {
    console.error("getBookmarkPost error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

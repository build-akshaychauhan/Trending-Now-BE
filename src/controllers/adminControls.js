import { CACHING_KEYS } from "../cache/cacheKeys.js";
import cache from "../cache/caching.js";
import { creatorsRankData } from "../functions/creatorsRankData.js";
import {
  addCreatorsToGenre,
  addGenre,
  allGenre,
  deleteGenre,
  removeCreatorFromGenre,
  updateGenre,
} from "../functions/genrePageData.js";
import { scrapingConstantsCache } from "../functions/scrapingConstantsCache.js";
import Constants from "../models/Constants.js";
import AppLayout from "../models/AppLayout.js";
import AppCard from "../models/AppCard.js";

// Create
export const createConstant = async (req, res, next) => {
  try {
    const exists = await Constants.findOne();

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Constants document already exists",
      });
    }

    const constant = await Constants.create(req.body);

    await scrapingConstantsCache(CACHING_KEYS.ScrapingConstantsKey);

    res.status(201).json({
      success: true,
      data: constant,
    });
  } catch (err) {
    next(err);
  }
};

// Get
export const getConstant = async (req, res, next) => {
  try {
    const constant = await Constants.findOne();
    if (!constant) {
      return res.status(404).json({
        success: false,
        message: "Constants document not found",
      });
    }

    const scrapingConstants = cache.get(CACHING_KEYS.ScrapingConstantsKey);

    res.json({
      success: true,
      data: constant,
    });
  } catch (err) {
    next(err);
  }
};

// Update
export const updateConstant = async (req, res, next) => {
  try {
    const constant = await Constants.findOneAndUpdate(
      {},
      {
        $set: req.body,
      },
      {
        returnDocument: "after",
        runValidators: true,
        upsert: true,
      },
    );

    await scrapingConstantsCache(CACHING_KEYS.ScrapingConstantsKey);

    res.json({
      success: true,
      data: constant,
    });
  } catch (err) {
    next(err);
  }
};

// Delete
export const deleteConstant = async (req, res, next) => {
  try {
    await Constants.deleteMany({});

    await scrapingConstantsCache(CACHING_KEYS.ScrapingConstantsKey);

    res.json({
      success: true,
      message: "Constants document deleted",
    });
  } catch (err) {
    next(err);
  }
};

// Create Genre
export const createGenre = async (req, res) => {
  const response = await addGenre(req.body);

  if (!response.success) {
    return res.status(400).json(response);
  }

  return res.status(201).json(response);
};

// Update Genre
export const updateGenres = async (req, res) => {
  const response = await updateGenre(req.params.id, req.body);

  if (!response.success) {
    return res.status(400).json(response);
  }

  return res.status(200).json(response);
};

// Get All Genres
export const allGenres = async (req, res) => {
  const response = await allGenre();

  if (!response.success) {
    return res.status(500).json(response);
  }

  return res.status(200).json(response);
};

// Delete Genre
export const deleteGenres = async (req, res) => {
  const response = await deleteGenre(req.params.id);

  if (!response.success) {
    return res.status(404).json(response);
  }

  return res.status(200).json(response);
};

// Add creators to a genre
export const addCreatorsGenre = async (req, res) => {
  const { creatorIds } = req.body;

  const response = await addCreatorsToGenre(req.params.id, creatorIds);

  if (!response.success) {
    return res.status(400).json(response);
  }

  return res.status(200).json(response);
};

// Remove creator from a genre
export const removeCreatorsGenre = async (req, res) => {
  const response = await removeCreatorFromGenre(
    req.params.id,
    req.params.creatorId,
  );

  if (!response.success) {
    return res.status(400).json(response);
  }

  return res.status(200).json(response);
};

// Get Creators Rank
export const creatorList = async (req, res) => {
  const response = await creatorsRankData();

  if (!response.success) {
    return res.status(500).json(response);
  }

  return res.status(200).json(response);
};

// Create or Update app screen layout
export const upsertAppLayout = async (req, res) => {
  try {
    const { userType, appScreen, layoutData } = req.body;

    if (!userType) {
      return res.status(400).json({
        success: false,
        message: "userType is required",
      });
    }

    if (!["Guest", "User"].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "userType must be Guest or User",
      });
    }

    const layout = await AppLayout.findOneAndUpdate(
      { userType },
      {
        $set: {
          appScreen,
          layoutData,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: "App layout created/updated successfully",
      data: layout,
    });
  } catch (error) {
    console.error("Upsert App Layout Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create/update app layout",
      error: error.message,
    });
  }
};

// Get app screens layout
export const getAppLayout = async (req, res) => {
  try {
    const { appScreen } = req.params;

    if (!appScreen) {
      return res.status(404).json({
        success: false,
        message: "appScreen param missing",
      });
    }

    const layout = await AppLayout.find({ appScreen }).lean();

    if (!layout) {
      return res.status(404).json({
        success: false,
        message: `${appScreen} layout not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: layout,
    });
  } catch (error) {
    console.error("Get App Layout Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch app layout",
      error: error.message,
    });
  }
};

// Create or Update app card
export const upsertAppCard = async (req, res) => {
  try {
    const { userType, appCard, cardData } = req.body;

    if (!userType) {
      return res.status(400).json({
        success: false,
        message: "userType is required",
      });
    }

    if (!["Guest", "User"].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "userType must be Guest or User",
      });
    }

    const card = await AppCard.findOneAndUpdate(
      { userType },
      {
        $set: {
          appCard,
          cardData,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: "App Card created/updated successfully",
      data: card,
    });
  } catch (error) {
    console.error("Upsert App card Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create/update app card",
      error: error.message,
    });
  }
};

// Get app card
export const getAppCard = async (req, res) => {
  try {
    const { appCard } = req.params;

    if (!appCard) {
      return res.status(404).json({
        success: false,
        message: "appCard param missing",
      });
    }

    const cards = await AppCard.find({ appCard }).lean();

    if (!cards) {
      return res.status(404).json({
        success: false,
        message: `${appCard} layout not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: cards,
    });
  } catch (error) {
    console.error("Get App Card Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch app card",
      error: error.message,
    });
  }
};

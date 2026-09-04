import FeedbackReport from "../models/FeedbackReport.js";
import { addReportImage } from "../utils/cdnHelper.js";

// Create Feedback Report
export const createReport = async (req, res) => {
  try {
    const { feedbackMessage } = req.body;
    const headers = req.headers;

    const appMeta = {
      version: headers["x-app-version"] || "unknown",
      platform: headers["x-platform"] || "unknown",
    };

    if (!feedbackMessage) {
      throw new Error("Feedback message is required");
    }

    if (!req.file) {
      throw new Error("Feedback image is required");
    }

    const reportImage = await addReportImage(req.file);

    const baseUrl = `https://${req.get("host")}` || process.env.PUBLIC_URL;
    const imageUrl = baseUrl + reportImage.url;

    const report = await FeedbackReport.create({
      appMeta: appMeta,
      feedbackImage: imageUrl,
      feedbackMessage: feedbackMessage,
    });

    const populatedReport = await FeedbackReport.findById(report._id);

    return res.json({
      success: true,
      data: populatedReport,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get All Feedback Reports
export const allFeedbackReports = async (req, res) => {
  try {
    const reports = await FeedbackReport.find().lean();

    return res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      error: "Server Error",
    });
  }
};

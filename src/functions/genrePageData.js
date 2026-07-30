import Genre from "../models/Genre.js";
import Creator from "../models/Creator.js";
import SocialDumpStore from "../models/SocialDumpStore.js";

// Create Genre
export async function addGenre(body) {
  try {
    const genre = await Genre.create(body);

    const populatedGenre = await Genre.findById(genre._id).populate(
      "creatorsList",
    );

    return {
      success: true,
      data: populatedGenre,
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: error.message,
    };
  }
}

// Get All Genres
export async function allGenre() {
  try {
    const genres = await Genre.find().populate("creatorsList").lean();

    if (genres.length) {
      for (const genre of genres) {
        for (const creator of genre.creatorsList) {
          const stats = await SocialDumpStore.findOne(
            { creatorName: creator.name },
            {
              instaFCount: 1,
              youtubeFCount: 1,
              _id: 0,
            },
          ).lean();

          creator.stats = stats;
        }
      }
    }

    return {
      success: true,
      data: genres,
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: "Server Error",
    };
  }
}

// Update Genre
export async function updateGenre(id, body) {
  try {
    const genre = await Genre.findByIdAndUpdate(id, body, {
      returnDocument: "after",
      runValidators: true,
    }).populate("creatorsList");

    if (!genre) {
      return {
        success: false,
        error: "Genre not found",
      };
    }

    return {
      success: true,
      data: genre,
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: error.message,
    };
  }
}

// Delete Genre
export async function deleteGenre(id) {
  try {
    const genre = await Genre.findByIdAndDelete(id);

    if (!genre) {
      return {
        success: false,
        error: "Genre not found",
      };
    }

    return {
      success: true,
      message: "Genre deleted successfully",
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      error: "Server Error",
    };
  }
}

export async function addCreatorsToGenre(genreId, creatorIds) {
  if (
    !genreId ||
    genreId.length === 0 ||
    !Array.isArray(creatorIds) ||
    creatorIds.length === 0
  ) {
    return {
      success: false,
      error: "genreId and creatorIds are required",
    };
  }

  try {
    // Verify genre exists
    const genreExists = await Genre.exists({ _id: genreId });

    if (!genreExists) {
      return {
        success: false,
        error: "Genre not found",
      };
    }

    // Verify all creators exist
    const creators = await Creator.find(
      { _id: { $in: creatorIds } },
      { _id: 1 },
    );

    if (creators.length !== creatorIds.length) {
      return {
        success: false,
        error: "One or more creator IDs are invalid",
      };
    }

    // Add creators (duplicates automatically ignored)
    const genre = await Genre.findByIdAndUpdate(
      genreId,
      {
        $addToSet: {
          creatorsList: { $each: creatorIds },
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    )
      .populate("creatorsList")
      .lean();

    await Creator.updateMany(
      { _id: { $in: creatorIds } },
      {
        $addToSet: {
          genres: genreId,
        },
      },
    );

    if (genre?.creatorsList?.length) {
      for (const creator of genre.creatorsList) {
        const stats = await SocialDumpStore.findOne(
          { creatorName: creator.name },
          {
            instaFCount: 1,
            youtubeFCount: 1,
            _id: 0,
          },
        ).lean();
        console.log(stats);
        creator.stats = stats;
      }
    }

    return {
      success: true,
      data: genre,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function removeCreatorFromGenre(genreId, creatorId) {
  try {
    const genre = await Genre.findByIdAndUpdate(
      genreId,
      {
        $pull: {
          creatorsList: creatorId,
        },
      },
      { returnDocument: "after" },
    )
      .populate("creatorsList")
      .lean();

    await Creator.findByIdAndUpdate(creatorId, {
      $pull: {
        genres: genreId,
      },
    });
    if (genre?.creatorsList?.length) {
      for (const creator of genre.creatorsList) {
        console.log(creator);
        const stats = await SocialDumpStore.findOne(
          { creatorName: creator.name },
          {
            instaFCount: 1,
            youtubeFCount: 1,
            _id: 0,
          },
        ).lean();

        creator.stats = stats;
      }
    }
    return {
      success: true,
      data: genre,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

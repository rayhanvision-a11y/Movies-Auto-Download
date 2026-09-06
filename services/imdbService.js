const axios = require('axios');

// In-memory cache to avoid rate limits
const imdbCache = new Map();

// OMDb API key (Public key for demonstration / fallback scraping)
const OMDB_API_KEY = 'trilogy';

/**
 * Fetch IMDb details (Rating, Genres, Year, Plot) for a title
 */
async function getImdbDetails(rawTitle) {
  if (!rawTitle) return null;

  // Clean title for search (remove Season/Episode tags and brackets)
  const cleanSearchTitle = rawTitle
    .replace(/\bS\d{1,2}\s*(?:E|EP)?\s*\d{1,5}\b/gi, '')
    .replace(/\bEP\s*\d{1,5}\b/gi, '')
    .replace(/\(\d{4}\)/, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (imdbCache.has(cleanSearchTitle)) {
    return imdbCache.get(cleanSearchTitle);
  }

  try {
    const res = await axios.get(`https://www.omdbapi.com/`, {
      params: {
        apikey: OMDB_API_KEY,
        t: cleanSearchTitle
      },
      timeout: 5000
    });

    if (res.data && res.data.Response === 'True') {
      const info = {
        imdbRating: res.data.imdbRating && res.data.imdbRating !== 'N/A' ? res.data.imdbRating : null,
        imdbVotes: res.data.imdbVotes || null,
        genre: res.data.Genre && res.data.Genre !== 'N/A' ? res.data.Genre : null,
        year: res.data.Year || null,
        plot: res.data.Plot && res.data.Plot !== 'N/A' ? res.data.Plot : null,
        rated: res.data.Rated || null,
        actors: res.data.Actors || null
      };

      imdbCache.set(cleanSearchTitle, info);
      return info;
    }
  } catch (err) {
    // Ignore OMDb network failures gracefully
  }

  // Fallback default
  const fallback = { imdbRating: null, genre: null };
  imdbCache.set(cleanSearchTitle, fallback);
  return fallback;
}

module.exports = {
  getImdbDetails
};

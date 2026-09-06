const axios = require('axios');
const cheerio = require('cheerio');
const vm = require('vm');
const { getSiteByUrl, getAllSites } = require('./siteManager');

// Active working mirrors map for automatic DNS fallback
const DOMAIN_MIRRORS = {
  'movies4u.clinic': 'https://new5.movies4u.clinic',
  'www.movies4u.clinic': 'https://new5.movies4u.clinic',
  'hdhub4u.cl': 'https://new5.hdhub4u.cl',
  'www.hdhub4u.cl': 'https://new5.hdhub4u.cl',
  'movielinkbd.li': 'https://movielinkbd.pro',
  'h7jc2y.movielinkbd.li': 'https://movielinkbd.pro',
  'r5jewg.movielinkbd.li': 'https://movielinkbd.pro',
  'www.movielinkbd.li': 'https://movielinkbd.pro'
};

// Standard User-Agent to avoid bot blocking
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const defaultHeaders = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
  'Cache-Control': 'no-cache'
};

function makeAbsolute(urlStr, baseUrl) {
  try {
    return new URL(urlStr, baseUrl).href;
  } catch (e) {
    return urlStr;
  }
}

function parseSeasonEpisode(rawTitle) {
  if (!rawTitle) return { season: null, episode: null, tag: null };

  const str = rawTitle.trim();

  // 1. Check for S01E02 / S1 E2 / S01 E02 / S1 EP2 / S01 EP02
  const sEPattern = /\bS(\d{1,2})\s*(?:E|EP)\s*(\d{1,5})\b/i;
  let match = str.match(sEPattern);
  if (match) {
    const s = parseInt(match[1], 10);
    const e = parseInt(match[2], 10);
    const sPad = String(s).padStart(2, '0');
    const ePad = String(e).padStart(2, '0');
    return { season: s, episode: e, tag: `S${sPad} E${ePad}` };
  }

  // 2. Check for Season 1 Episode 2 / Season 1 EP 02
  const seasonEpPattern = /\bSeason\s*(\d{1,2})\s*(?:Episode|EP|E)\s*(\d{1,5})\b/i;
  match = str.match(seasonEpPattern);
  if (match) {
    const s = parseInt(match[1], 10);
    const e = parseInt(match[2], 10);
    const sPad = String(s).padStart(2, '0');
    const ePad = String(e).padStart(2, '0');
    return { season: s, episode: e, tag: `S${sPad} E${ePad}` };
  }

  // 3. Check for EP 02 ADDED / Episode 02 / EP 02 / E02
  const epOnlyPattern = /\b(?:EP|Episode|E)\s*(\d{1,5})\b/i;
  match = str.match(epOnlyPattern);
  if (match) {
    const e = parseInt(match[1], 10);
    const ePad = String(e).padStart(2, '0');

    const seasonOnly = str.match(/\bSeason\s*(\d{1,2})\b/i) || str.match(/\bS(\d{1,2})\b/i);
    if (seasonOnly) {
      const s = parseInt(seasonOnly[1], 10);
      const sPad = String(s).padStart(2, '0');
      return { season: s, episode: e, tag: `S${sPad} E${ePad}` };
    }
    return { season: 1, episode: e, tag: `EP ${ePad}` };
  }

  // 4. Check for Season 1 only
  const seasonOnlyPattern = /\b(?:Season|S)\s*(\d{1,2})\b/i;
  match = str.match(seasonOnlyPattern);
  if (match) {
    const s = parseInt(match[1], 10);
    const sPad = String(s).padStart(2, '0');
    return { season: s, episode: null, tag: `S${sPad}` };
  }

  return { season: null, episode: null, tag: null };
}

function cleanTitle(rawTitle) {
  if (!rawTitle) return '';

  let cleaned = rawTitle.trim();

  // 1. Extract Season / Episode info first from the original title
  const epInfo = parseSeasonEpisode(cleaned);

  // 2. Remove all emojis (🚀, 🎙, 📌, 🔥, ⭐, 🎬, ✨, ⚡, 🎉, 📢, 👉, ▶️, 💥, etc.)
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '').trim();

  // 3. Remove social media join / app promos
  cleaned = cleaned
    .replace(/\bjoin\s*(our)?\s*(facebook|fb|telegram|whatsapp)\s*(group|channel)?\s*!?/gi, '')
    .replace(/\b(download\s*our\s*app|official\s*android\s*app)\b/gi, '')
    .trim();

  // 4. Remove leading/standalone genre & category tags (SCI-FI, ACTION, etc.)
  cleaned = cleaned
    .replace(/\b(sci-fi|scifi|action|thriller|drama|romance|horror|comedy|adventure|crime|fantasy|animation|mystery|documentary|biography|history|war|family|sports|western)\b/gi, '')
    .replace(/\b(bangla\s*dub(bed)?|hindi\s*dub(bed)?|dual\s*audio|multi\s*audio|english|bengali|hindi|tamil|telugu|kannada|malayalam|chinese|korean|japanese)\b/gi, '')
    .trim();

  // 5. If title contains YYYY year in parentheses like "(2026)" or "(2025)"
  const yearParenMatch = cleaned.match(/^(.+?\((?:19|20)\d{2}\))/i);
  if (yearParenMatch && yearParenMatch[1]) {
    cleaned = yearParenMatch[1].trim();
  } else {
    // Check for standalone year like "2026" or "2025"
    const yearMatch = cleaned.match(/^(.+?\b(?:19|20)\d{2}\b)/i);
    if (yearMatch && yearMatch[1]) {
      const baseName = yearMatch[1].replace(/\b((?:19|20)\d{2})\b/, '').trim();
      const year = yearMatch[1].match(/\b((?:19|20)\d{2})\b/)[1];
      cleaned = `${baseName} (${year})`;
    }
  }

  // 6. Strip resolution, codec, quality & site noise tags
  cleaned = cleaned
    .replace(/\b(1080p|720p|480p|4k|2160p|web-dl|webrip|hdrip|bluray|hevc|x264|x265|aac|esub|esubs|hc-esub|hdtc|camrip|web-series|webseries|full movie|download)\b.*/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^\)]*(1080p|720p|480p|4k|dual audio|bangla|hindi|english|web-dl|bluray)[^\)]*\)/gi, '')
    .replace(/\s*[\-\|:\/]\s*(CineFreak|CINEFREAK|Movies4U|HDHub4U|MovieLinkBD|SouthFreak|SunPlex|GDrive|ESub).*$/gi, '')
    .trim();

  // 7. Remove residual leading/trailing symbols
  cleaned = cleaned
    .replace(/^[-\|:\s,\.\#]+/, '')
    .replace(/[-\|:\s,\.\#]+$/, '')
    .trim();

  // 8. Append clean episode tag if present (e.g., S01 E02)
  if (epInfo.tag) {
    cleaned = cleaned
      .replace(/\bS\d{1,2}\s*(?:E|EP)?\s*\d{1,5}\b/gi, '')
      .replace(/\bSeason\s*\d{1,2}\s*(?:Episode|EP|E)?\s*\d{1,5}\b/gi, '')
      .replace(/\bEpisode\s*\d{1,5}\b/gi, '')
      .replace(/\bEP\s*\d{1,5}\b/gi, '')
      .trim();

    cleaned = cleaned.replace(/[-\|:\s]+$/, '').trim();
    cleaned = `${cleaned} ${epInfo.tag}`;
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || rawTitle;
}

function detectQuality(text) {
  const t = text.toLowerCase();
  if (t.includes('2160p') || t.includes('4k')) return '4K / 2160p';
  if (t.includes('1080p') || t.includes('fhd') || t.includes('264')) return '1080p Full HD';
  if (t.includes('720p') || t.includes('hd')) return '720p HD';
  if (t.includes('480p') || t.includes('sd')) return '480p SD';
  if (t.includes('300mb') || t.includes('400mb') || t.includes('hevc')) return '720p HEVC / SD';
  return 'Direct Link / Multi-Quality';
}

function detectContentType(title, postUrl) {
  const text = `${title} ${postUrl}`.toLowerCase();
  if (
    text.includes('season') ||
    text.includes('series') ||
    text.includes('episode') ||
    /\bs0?\d+/i.test(text) ||
    /\be0?\d+/i.test(text) ||
    text.includes('k-drama') ||
    text.includes('kdrama') ||
    text.includes('j-drama') ||
    text.includes('c-drama') ||
    text.includes('drama') ||
    text.includes('show') ||
    text.includes('weekly')
  ) {
    return 'series';
  }
  return 'movie';
}

/**
 * Deep Multi-Step Bypass Engine
 * Resolves generate.php, shortlinks, CineCloud, HubCloud, DriveHub, PixelDrain, R2.dev direct file URLs (.mkv / .mp4)
 */
async function resolveDirectLink(rawUrl, depth = 0) {
  if (depth > 5 || !rawUrl) return rawUrl;

  if (rawUrl.startsWith('javascript:') || rawUrl === '#' || rawUrl.includes('telegram.org') || rawUrl.includes('whatsapp.com')) {
    return null;
  }

  // If already a direct video / CDN file link, return immediately without network overhead
  const cleanRaw = rawUrl.split('?')[0].toLowerCase();
  if (cleanRaw.endsWith('.mkv') || cleanRaw.endsWith('.mp4') || rawUrl.includes('b-cdn.net') || rawUrl.includes('r2.cloudflarestorage.com') || rawUrl.includes('pixeldrain.com/api/file/')) {
    return rawUrl;
  }

  try {
    let currentUrl = rawUrl;

    // 0. Extract direct URL from url= parameter if present (e.g. onlinekosh/shortlink wrappers)
    if (currentUrl.includes('url=')) {
      try {
        const uObj = new URL(currentUrl);
        const targetUrlParam = uObj.searchParams.get('url');
        if (targetUrlParam && (targetUrlParam.startsWith('http://') || targetUrlParam.startsWith('https://'))) {
          currentUrl = targetUrlParam;
        }
      } catch(e) {}
    }

    const cleanCurrent = currentUrl.split('?')[0].toLowerCase();
    if (cleanCurrent.endsWith('.mkv') || cleanCurrent.endsWith('.mp4') || currentUrl.includes('b-cdn.net') || currentUrl.includes('r2.cloudflarestorage.com') || currentUrl.includes('pixeldrain.com/api/file/')) {
      return currentUrl;
    }

    // 1. Handle generate.php redirects & unmasking
    if (currentUrl.includes('generate.php')) {
      try {
        const genRes = await axios.get(currentUrl, {
          headers: { ...defaultHeaders, Referer: 'https://cinefreak.net/' },
          timeout: 8000
        });

        const match = genRes.data.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
        if (match && match[1]) {
          currentUrl = match[1];
        } else {
          const urlObj = new URL(currentUrl);
          const b64 = urlObj.searchParams.get('id');
          if (b64) {
            const raw = Buffer.from(b64, 'base64').toString('utf8');
            currentUrl = raw.replace(/newgo\d+$/, '');
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // 2. Handle CineCloud intermediate download pages (/f/{id})
    if (currentUrl.includes('cinecloud.site')) {
      const dUrl = currentUrl.replace('/f/', '/d/');
      try {
        const dRes = await axios.get(dUrl, {
          headers: { ...defaultHeaders, Referer: currentUrl },
          timeout: 9000
        });

        const $ = cheerio.load(dRes.data);
        let directLink = null;
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href && (href.includes('r2.cloudflarestorage.com') || href.includes('googleusercontent.com') || href.endsWith('.mkv') || href.endsWith('.mp4'))) {
            directLink = href;
          }
        });

        if (!directLink) {
          const wUrl = currentUrl.replace('/f/', '/w/');
          const wRes = await axios.get(wUrl, {
            headers: { ...defaultHeaders, Referer: currentUrl },
            timeout: 9000
          });
          const $w = cheerio.load(wRes.data);
          $w('a').each((i, el) => {
            const href = $w(el).attr('href');
            if (href && (href.includes('googleusercontent.com') || href.includes('r2.cloudflarestorage.com') || href.endsWith('.mkv') || href.endsWith('.mp4'))) {
              directLink = href;
            }
          });
        }

        if (directLink) {
          return directLink;
        }
      } catch (e) {
        // ignore
      }
    }

    // 3. Handle PixelDrain API URLs
    if (currentUrl.includes('pixeldrain.com')) {
      const fileId = currentUrl.split('/u/')[1] || currentUrl.split('/file/')[1];
      if (fileId) return `https://pixeldrain.com/api/file/${fileId}?download`;
      return currentUrl;
    }

    // 4. Handle direct-dl.lol direct download generator
    if (currentUrl.includes('direct-dl')) {
      try {
        const dRes = await axios.get(currentUrl, { headers: { ...defaultHeaders, Referer: currentUrl }, timeout: 10000 });
        const $d = cheerio.load(dRes.data);
        let directFileUrl = null;
        $d('a').each((i, el) => {
          if (directFileUrl) return;
          const href = $d(el).attr('href');
          if (href && (href.includes('googleusercontent.com') || href.includes('r2.cloudflarestorage.com') || href.endsWith('.mkv') || href.endsWith('.mp4'))) {
            directFileUrl = href;
          }
        });
        if (directFileUrl) return directFileUrl;
      } catch (e) {}
    }

    // 5. Handle m4ulinks / techzed / bdplex / multicloudlinks intermediate multi-link page
    if (currentUrl.includes('m4ulinks') || currentUrl.includes('techzed') || currentUrl.includes('bdplex') || currentUrl.includes('multicloudlinks')) {
      try {
        const res = await axios.get(currentUrl, { headers: defaultHeaders, timeout: 10000 });
        const $ = cheerio.load(res.data);

        const candidateLinks = [];
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href && (href.includes('direct-dl') || href.includes('hubcloud') || href.includes('drivehub') || href.includes('pixeldrain') || href.includes('fast-dl') || href.includes('gdflix') || href.endsWith('.zip') || href.endsWith('.mkv'))) {
            const text = $(el).text().trim();
            const headingContext = $(el).closest('div, p, li').text().trim() + ' ' + $(el).parent().prevAll('h3, h4, h2, strong, div, p').first().text().trim();
            candidateLinks.push({
              url: makeAbsolute(href, currentUrl),
              text,
              context: headingContext
            });
          }
        });

        // Sort candidate links so 1080p x264 (non-HEVC) links come first!
        candidateLinks.sort((a, b) => {
          const aCtx = `${a.text} ${a.context}`.toLowerCase();
          const bCtx = `${b.text} ${b.context}`.toLowerCase();
          const aIs1080 = aCtx.includes('1080p') || aCtx.includes('1080');
          const bIs1080 = bCtx.includes('1080p') || bCtx.includes('1080');
          const aIsHevc = aCtx.includes('hevc') || aCtx.includes('x265') || aCtx.includes('h265') || aCtx.includes('10bit');
          const bIsHevc = bCtx.includes('hevc') || bCtx.includes('x265') || bCtx.includes('h265') || bCtx.includes('10bit');

          // Score: 1080p non-HEVC = 4, 1080p HEVC = 2, non-1080p non-HEVC = 1, non-1080p HEVC = 0
          const aScore = (aIs1080 ? 4 : 0) - (aIsHevc ? 2 : 0);
          const bScore = (bIs1080 ? 4 : 0) - (bIsHevc ? 2 : 0);
          return bScore - aScore;
        });

        let firstValidFallback = null;
        for (const item of candidateLinks) {
          const resolved = await resolveDirectLink(item.url, depth + 1);
          if (resolved && (resolved.includes('googleusercontent.com') || resolved.includes('r2.cloudflarestorage.com') || resolved.includes('.mkv') || resolved.includes('.mp4') || resolved.includes('pixeldrain') || resolved.includes('pongala.life'))) {
            const resLower = resolved.toLowerCase();
            const isExplicitNon1080 = (resLower.includes('480p') || resLower.includes('720p')) && !resLower.includes('1080p') && !resLower.includes('1080');
            if (!isExplicitNon1080) {
              return resolved;
            } else if (!firstValidFallback) {
              firstValidFallback = resolved;
            }
          }
        }

        if (firstValidFallback) return firstValidFallback;
        if (candidateLinks.length > 0) {
          return await resolveDirectLink(candidateLinks[0].url, depth + 1);
        }
      } catch (e) {}
    }

    // 5. Handle HubCloud / DriveHub / GamerXYT / Fast-DL intermediate pages
    if (currentUrl.includes('hubcloud') || currentUrl.includes('drivehub') || currentUrl.includes('gamerxyt') || currentUrl.includes('fast-dl') || currentUrl.includes('gdflix')) {
      try {
        const response = await axios.get(currentUrl, {
          headers: { ...defaultHeaders, Referer: currentUrl },
          timeout: 10000
        });
        const $ = cheerio.load(response.data);

        // Check for direct .zip / .mkv / R2 / Cocktail file download link
        let directFile = null;
        $('a').each((i, el) => {
          if (directFile) return;
          const href = $(el).attr('href');
          if (!href) return;
          const abs = makeAbsolute(href, currentUrl);
          if (abs.includes('.zip') || abs.includes('.mkv') || abs.includes('cocktail.beer') || abs.includes('r2.cloudflarestorage.com') || abs.includes('pixeldrain.com/api/file/')) {
            directFile = abs;
          }
        });

        if (directFile) return directFile;

        // Check for generator button (gamerxyt / hubcloud.php / download button)
        const genBtn = $('a[href*="hubcloud.php"], a[href*="host="], a[href*="download"], a.btn-primary, a#download').first();
        if (genBtn.length > 0) {
          const nextUrl = makeAbsolute(genBtn.attr('href'), currentUrl);
          if (nextUrl && nextUrl !== currentUrl) {
            return await resolveDirectLink(nextUrl, depth + 1);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // 5. Follow HTTP HEAD / GET redirects
    try {
      const headRes = await axios.get(currentUrl, {
        headers: { ...defaultHeaders, Referer: currentUrl },
        timeout: 5000,
        maxRedirects: 3,
        validateStatus: status => status >= 200 && status < 400
      });
      const finalUrl = headRes.request?.res?.responseUrl || headRes.config?.url || currentUrl;
      return finalUrl;
    } catch (err) {
      return currentUrl;
    }

  } catch (err) {
    return rawUrl;
  }
}

/**
 * Extract direct .mkv / .mp4 download links from a single post HTML page
 */
async function processSinglePostPage(postUrl, refererUrl) {
  try {
    const res = await axios.get(postUrl, {
      headers: { ...defaultHeaders, Referer: refererUrl },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    let postTitle = $('h1.entry-title, h1.post-title, h1.title, h1').first().text().trim().replace(/\s+/g, ' ');
    if (!postTitle || postTitle.toLowerCase().includes('movielinkbd')) {
      const candidateHeading = $('h1, h2').filter((i, el) => {
        const t = $(el).text().trim();
        return t.length > 5 && !t.toLowerCase().includes('movielinkbd');
      }).first().text().trim();
      if (candidateHeading) postTitle = candidateHeading;
    }

    const rawButtonLinks = [];

    const urlObj = new URL(postUrl);
    const siteHostname = urlObj.hostname;

    // Scope search to main post content element to avoid sidebar/footer/related-posts links
    let $postContainer = $('article, .entry-content, .post-content, .single-post, .post, main, #content, #primary').first();
    if (!$postContainer || $postContainer.length === 0) {
      $postContainer = $('body');
    }

    $postContainer.find('a, button').each((i, el) => {
      // Exclude widget, sidebar, related-posts, and footer links
      if ($(el).closest('.sidebar, #sidebar, .widget, .related-posts, .recent-posts, .yarpp-related, #comments, footer, .footer, .popular-posts, .trending-posts, .related-box, .related').length > 0) {
        return;
      }

      let href = $(el).attr('href') || '';
      const onclickVal = $(el).attr('onclick') || '';
      if (onclickVal) {
        const match = onclickVal.match(/url=([^'"\s&]+)/) || onclickVal.match(/this\.href=['"]([^'"]+)['"]/);
        if (match && match[1]) {
          href = match[1];
        }
      }

      if (!href || href === '#' || href.startsWith('javascript:')) return;

      const absoluteHref = makeAbsolute(href, postUrl);
      let linkUrlObj;
      try { linkUrlObj = new URL(absoluteHref); } catch(e) { return; }

      // Filter out same-domain related post links!
      if (linkUrlObj.hostname === siteHostname && !absoluteHref.includes('.mkv') && !absoluteHref.includes('.mp4') && !absoluteHref.includes('generate.php')) {
        return;
      }

      const text = $(el).text().trim() || $(el).attr('title') || '';
      const classNames = $(el).attr('class') || '';
      const hrefLower = absoluteHref.toLowerCase();
      const textLower = text.toLowerCase();

      // Check if link matches any site's download button signature
      const isDownloadBtn =
        hrefLower.includes('m4ulinks') ||
        hrefLower.includes('techzed') ||
        hrefLower.includes('techm') ||
        hrefLower.includes('hubcloud') ||
        hrefLower.includes('drivehub') ||
        hrefLower.includes('pixeldrain') ||
        hrefLower.includes('fast-dl') ||
        hrefLower.includes('cinecloud') ||
        hrefLower.includes('gdtot') ||
        hrefLower.includes('generate.php') ||
        hrefLower.includes('bdplex') ||
        hrefLower.includes('onlinekosh') ||
        hrefLower.includes('b-cdn.net') ||
        hrefLower.includes('/view/') ||
        hrefLower.includes('/number/') ||
        hrefLower.includes('.mkv') ||
        hrefLower.includes('.mp4') ||
        classNames.toLowerCase().includes('maxbutton') ||
        classNames.toLowerCase().includes('dlbtn') ||
        classNames.toLowerCase().includes('download') ||
        textLower.includes('download') ||
        textLower.includes('batch') ||
        textLower.includes('zip') ||
        textLower.includes('1080p') ||
        textLower.includes('720p') ||
        textLower.includes('480p');

      // Exclude generic navigation / social / app links
      const isNav =
        hrefLower.includes('how-to-download') ||
        hrefLower.includes('telegram') ||
        hrefLower.includes('whatsapp') ||
        hrefLower.includes('tinyurl.com') ||
        hrefLower.includes('/category/') ||
        hrefLower.includes('/tag/') ||
        hrefLower.includes('/page/');

      if (isDownloadBtn && !isNav) {
        const parentContext = $(el).closest('.dlbtn-container, p, div').text().trim().replace(/\s+/g, ' ');
        const headingContext = $(el).closest('div, p').prevAll('h2, h3, h4, p, strong').first().text().trim();
        const fullContext = `${text} ${headingContext} ${parentContext}`;
        const dedupKey = `${absoluteHref}_${text}`;

        if (!rawButtonLinks.some(item => item.dedupKey === dedupKey)) {
          rawButtonLinks.push({
            dedupKey,
            url: absoluteHref,
            text: text || 'Download 1080p File',
            context: fullContext
          });
        }
      }
    });

    // Unmask & resolve buttons in parallel
    const directFileItems = await Promise.all(
      rawButtonLinks.map(async (btn, idx) => {
        const resolved = await resolveDirectLink(btn.url);
        if (!resolved) return null;

        let filename = postTitle;
        let qualityContext = btn.context || btn.text || '';

        // Clean query string off URL to extract real raw filename
        const cleanUrl = resolved.split('?')[0];
        const urlParts = cleanUrl.split('/');
        let rawFileName = urlParts[urlParts.length - 1] || '';
        try { rawFileName = decodeURIComponent(rawFileName); } catch (e) {}

        if (rawFileName.includes('.mkv') || rawFileName.includes('.mp4')) {
          filename = rawFileName;
          qualityContext = rawFileName;
        } else {
          try {
            const decodedResolved = decodeURIComponent(resolved);
            const match = decodedResolved.match(/filename="([^"]+)"/) || decodedResolved.match(/filename=([^&]+)/);
            if (match && match[1]) {
              filename = match[1].replace(/["']/g, '');
              qualityContext = filename;
            }
          } catch (e) {}
        }

        const realFileQuality = detectQuality(`${filename} ${cleanUrl} ${qualityContext} ${btn.text}`);

        // Title match verification: Ensure filename is relevant to postTitle, otherwise fallback
        const cleanPost = cleanTitle(postTitle).toLowerCase();
        const firstWord = cleanPost.split(' ')[0];
        const cleanFn = filename.toLowerCase();
        
        if (filename === postTitle || (firstWord.length > 2 && !cleanFn.includes(firstWord))) {
          const isZip = (btn.text || '').toLowerCase().includes('zip') || (btn.text || '').toLowerCase().includes('batch');
          const zipTag = isZip ? ` [BATCH/ZIP File - ${btn.text}]` : ` [${realFileQuality}]`;
          filename = `${cleanTitle(postTitle)}${zipTag}`;
        }

        // HEVC Exclusion Filter (exclude hevc, x265, h265, 10bit)
        const textCtx = `${btn.text} ${qualityContext} ${filename} ${realFileQuality}`.toLowerCase();
        const isHevc = textCtx.includes('hevc') || textCtx.includes('x265') || textCtx.includes('h265') || textCtx.includes('10bit');
        if (isHevc) {
          return null;
        }

        return {
          id: `file_${idx}_${Date.now()}`,
          movieTitle: postTitle,
          label: filename,
          quality: realFileQuality,
          downloadUrl: resolved,
          originalUrl: btn.url,
          postUrl: postUrl,
          qualityContext: qualityContext
        };
      })
    );

    return directFileItems.filter(item => item !== null);

  } catch (err) {
    console.error(`Error processing post ${postUrl}:`, err.message);
    return [];
  }
}

function extractPosterFromElement($, el, cardContainer) {
  let imgEl = $(el).find('img').first();
  if (!imgEl || imgEl.length === 0) {
    if (cardContainer && cardContainer.length) {
      imgEl = cardContainer.find('img').first();
    }
  }
  if (!imgEl || imgEl.length === 0) {
    imgEl = $(el).parent().find('img').first();
  }
  if (!imgEl || imgEl.length === 0) {
    imgEl = $(el).closest('div, p, article').find('img').first();
  }

  if (imgEl && imgEl.length > 0) {
    let src = imgEl.attr('src') || 
              imgEl.attr('data-src') || 
              imgEl.attr('data-lazy-src') || 
              imgEl.attr('data-original') || 
              imgEl.attr('srcset');

    if (src && src.includes(' ')) {
      src = src.split(',')[0].trim().split(' ')[0];
    }

    if (src && !src.startsWith('data:image')) {
      return src;
    }
  }
  return null;
}

const IGNORED_CATEGORY_TITLES = new Set([
  'animation', 'bangla dubbed', 'bangla subtitle', 'bengali', 'dual audio', 'action',
  'adventure', 'anime', 'biography', 'bollywood', 'china', 'comedy', 'crime',
  'documentary', 'drama', 'family', 'fantasy', 'hindi', 'hindi dubbed', 'history',
  'hollywood', 'horror', 'imdb 250', 'japanese', 'kannada', 'korean', 'malayalam',
  'melodrama', 'mp3 songs', 'musical', 'mystery', 'natok', 'others', 'persian',
  'punjabi', 'reality show', 'romantic', 'sci-fi', 'show', 'spanish', 'sports',
  'tamil', 'telugu', 'thai', 'thriller', 'turkish', 'upcoming', 'war',
  'western', 'wrestling', 'dmca', 'disclaimer', 'contact us', 'how to download', 'home',
  'korean movie & drama', 'natok & telefilm', 'thai+indonesia', 'irani+israel+bahrain',
  'china+malaysia', 'anime ( jpn)', 'trending',
  'k-drama', 'kdrama', 'j-drama', 'jdrama', 'c-drama', 'cdrama', 'korean drama', 'chinese drama',
  'genres', 'genre', 'categories', 'category', 'all genres', 'all categories',
  'web-dl', 'all category', 'join our group !', 'join our group', 'download our official android app', 'bangla dub', 'telegram', 'whatsapp'
]);

async function extractBilibili(targetUrl, page = 1) {
  const isPlayPage = targetUrl.includes('/play/');

  if (!isPlayPage) {
    try {
      const res = await axios.get('https://api.bilibili.tv/intl/gateway/web/v2/ogv/timeline?s_locale=en_US', {
        headers: { ...defaultHeaders, Referer: 'https://www.bilibili.tv/en' },
        timeout: 10000
      });

      const posts = [];
      const seen = new Set();

      if (res.data && res.data.data && res.data.data.items) {
        res.data.data.items.forEach(day => {
          if (day.cards && day.cards.length) {
            day.cards.forEach(card => {
              const playUrl = `https://www.bilibili.tv/en/play/${card.season_id}`;
              if (!seen.has(playUrl)) {
                seen.add(playUrl);
                posts.push({
                  id: `bili_${card.season_id}_${Date.now()}`,
                  title: card.title,
                  poster: card.cover,
                  contentType: 'series',
                  episodeTag: card.index_show || 'Anime Series',
                  season: null,
                  episode: null,
                  postUrl: playUrl
                });
              }
            });
          }
        });
      }

      return {
        success: true,
        isListing: true,
        siteName: 'bilibili',
        targetUrl: 'https://www.bilibili.tv/en',
        currentPage: 1,
        totalPages: 1,
        postsPerPage: posts.length,
        title: 'Bilibili TV - Trending Anime & Series',
        poster: '',
        totalFound: posts.length,
        posts
      };

    } catch (err) {
      throw new Error(`Failed to fetch Bilibili timeline: ${err.message}`);
    }

  } else {
    try {
      const res = await axios.get(targetUrl, {
        headers: { ...defaultHeaders, Referer: 'https://www.bilibili.tv/en' },
        timeout: 12000
      });

      const $ = cheerio.load(res.data);
      let stateObj = null;

      $('script').each((i, el) => {
        const text = $(el).html() || '';
        if (text.includes('window.__initialState=')) {
          try {
            const sandbox = { window: {} };
            vm.createContext(sandbox);
            vm.runInContext(text, sandbox);
            stateObj = sandbox.window.__initialState;
          } catch (e) {}
        }
      });

      let title = $('h1').text().trim() || $('meta[property="og:title"]').attr('content') || 'Bilibili Anime';
      let poster = $('meta[property="og:image"]').attr('content') || '';
      const downloads = [];

      if (stateObj && stateObj.ogv) {
        const season = stateObj.ogv.season;
        if (season && season.title) title = season.title;
        if (season && season.cover) poster = season.cover;

        const seasonId = targetUrl.split('/play/')[1]?.split('/')[0] || '';
        const sections = stateObj.ogv.sectionsList || [];

        sections.forEach((sec) => {
          if (sec.episodes && sec.episodes.length) {
            sec.episodes.forEach((ep, eIdx) => {
              const epTitle = ep.title_display || ep.long_title_display || ep.short_title_display || `Episode ${eIdx + 1}`;
              const epUrl = `https://www.bilibili.tv/en/play/${seasonId}/${ep.episode_id}`;

              downloads.push({
                id: `bili_ep_${ep.episode_id}`,
                movieTitle: `${title} - ${epTitle}`,
                label: `${title} [${epTitle}] [1080p Full HD Web Stream]`,
                quality: '1080p Full HD',
                downloadUrl: epUrl,
                originalUrl: epUrl,
                postUrl: targetUrl,
                qualityContext: `Bilibili Anime Stream (${epTitle})`
              });
            });
          }
        });
      }

      return {
        success: true,
        isListing: false,
        siteName: 'bilibili',
        targetUrl,
        title,
        poster,
        totalFound: downloads.length,
        downloads
      };

    } catch (err) {
      throw new Error(`Failed to fetch Bilibili play page: ${err.message}`);
    }
  }
}

/**
 * Core extraction function
 */
async function extractMovie(targetUrl, page = 1) {
  if (!targetUrl) throw new Error('Target URL is required');

  if (typeof targetUrl !== 'string') {
    targetUrl = String(targetUrl);
  }

  let cleanBase = targetUrl.replace(/\/$/, '');
  if (!cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
    cleanBase = 'https://' + cleanBase;
  }

  if (cleanBase.includes('bilibili.tv')) {
    return await extractBilibili(cleanBase, page);
  }

  // Auto-resolve mirror if base domain fails DNS
  let fetchUrl = cleanBase;
  if (page > 1 && !cleanBase.includes('/page/')) {
    fetchUrl = `${cleanBase}/page/${page}/`;
  }

  const siteConfig = getSiteByUrl(fetchUrl);
  const siteName = siteConfig ? siteConfig.name : 'Web Extractor';

  console.log(`[Extractor] Fetching ${fetchUrl} (Page ${page}, Site: ${siteName})...`);

  let html = '';
  try {
    const res = await axios.get(fetchUrl, {
      headers: { ...defaultHeaders, Referer: targetUrl },
      timeout: 12000
    });
    html = res.data;
  } catch (err) {
    // Check for DNS failure / ENOTFOUND and retry with active working mirror
    let urlObj;
    try { urlObj = new URL(fetchUrl); } catch(e) {}
    const mirror = urlObj ? DOMAIN_MIRRORS[urlObj.hostname] : null;

    if (mirror) {
      const mirrorFetchUrl = fetchUrl.replace(urlObj.origin, mirror.replace(/\/$/, ''));
      console.log(`[Extractor] Primary domain ${urlObj.hostname} failed. Auto-retrying working mirror: ${mirrorFetchUrl}`);

      try {
        const mirrorRes = await axios.get(mirrorFetchUrl, {
          headers: { ...defaultHeaders, Referer: mirrorFetchUrl },
          timeout: 12000
        });
        html = mirrorRes.data;
        cleanBase = mirror.replace(/\/$/, '');
      } catch (mErr) {
        throw new Error(`Failed to fetch webpage from mirror (${mirrorFetchUrl}): ${mErr.message}`);
      }
    } else {
      throw new Error(`Failed to fetch webpage: ${err.message}`);
    }
  }

  const $ = cheerio.load(html);

  // Check if targetUrl is a single movie post URL
  let targetPath = '';
  try {
    const targetUrlObj = new URL(cleanBase);
    targetPath = targetUrlObj.pathname.toLowerCase();
  } catch (e) {}

  const isHomepage = targetPath === '' || targetPath === '/';
  const isCategoryOrNavPath = 
    targetPath.includes('/category/') ||
    targetPath.includes('/language/') ||
    targetPath.includes('/genre/') ||
    targetPath.includes('/tag/') ||
    targetPath.includes('/page/') ||
    targetPath.includes('/year/') ||
    targetPath.startsWith('/category') ||
    targetPath.startsWith('/language') ||
    targetPath.startsWith('/genre') ||
    targetPath.startsWith('/tag') ||
    targetPath.startsWith('/page');

  const isSinglePostUrl = !isHomepage && !isCategoryOrNavPath && (
    targetPath.includes('/movie/') ||
    targetPath.includes('/series/') ||
    targetPath.includes('/anime/') ||
    targetPath.includes('-full-movie') || 
    targetPath.includes('-full-series') || 
    targetPath.includes('-movie-download') || 
    targetPath.includes('-series-download') || 
    targetPath.includes('-web-dl') || 
    targetPath.includes('-bluray') ||
    targetPath.includes('-webrip') ||
    targetPath.includes('-hdrip') ||
    targetPath.includes('-download') ||
    targetPath.includes('watch.php') ||
    (targetPath.split('-').length >= 3 && targetPath.length > 8) ||
    /\d{4}/.test(targetPath)
  );

  if (!isSinglePostUrl) {
    // Collect movie post cards from site listing page
    const posts = [];
    const seenPostUrls = new Set();

    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const absPostUrl = makeAbsolute(href, cleanBase);
      let urlObj;
      try {
        urlObj = new URL(absPostUrl);
      } catch (e) {
        return;
      }
      const path = urlObj.pathname.toLowerCase();

      // Check if this link is a navigation or category link
      const isNavOrCategory = absPostUrl === cleanBase ||
                              absPostUrl === cleanBase + '/' ||
                              path === '/' ||
                              path.includes('/category/') ||
                              path.includes('/language/') ||
                              path.includes('/genre/') ||
                              path.includes('/tag/') ||
                              path.includes('/page/') ||
                              path.includes('/year/') ||
                              path.includes('/disclaimer') ||
                              path.includes('/dmca') ||
                              path.includes('/how-to') ||
                              path.includes('/request') ||
                              path.includes('/contact') ||
                              path.endsWith('-movies/') ||
                              path.endsWith('-series/') ||
                              path.includes('how2unzip') ||
                              path.includes('mostwatch') ||
                              path.includes('upcoming') ||
                              path.includes('download18plus') ||
                              absPostUrl.includes('facebook.com') ||
                              absPostUrl.includes('telegram') ||
                              absPostUrl.includes('whatsapp') ||
                              absPostUrl.includes('t.me');

      if (isNavOrCategory) return;

      // Extract title & episode details
      let rawTitle = $(el).attr('title') || $(el).text().trim() || $(el).find('img').attr('alt') || '';
      
      const cardContainer = $(el).closest('article, .post, .thumb, .k-item, .item, .card-grid-small, header, figure, .movie-card, .cine-slide, .entry-card, .movie-card-image, .cine-slide-img-box, div[class*="card"], div[class*="post"], div[class*="item"], div[class*="slide"]');
      if (cardContainer.length > 0) {
        const containerTitle = cardContainer.find('h1, h2, h3, h4, .entry-title, .title, figcaption').first().text().trim();
        if (containerTitle && containerTitle.length > 5) {
          rawTitle = containerTitle;
        }
      }

      const epInfo = parseSeasonEpisode(rawTitle);
      const title = cleanTitle(rawTitle);
      const normTitle = title.toLowerCase().trim();

      // Filter out empty, generic, or category menu titles (e.g. Animation, Bangla Dubbed, Dual Audio)
      if (title.length < 5 || 
          normTitle.includes('home') || 
          normTitle === 'download' || 
          IGNORED_CATEGORY_TITLES.has(normTitle) ||
          IGNORED_CATEGORY_TITLES.has(normTitle.replace(/\s+/g, ' '))) return;

      // Ensure path is not a single word category URL slug (e.g. /animation/, /bangla-dubbed/)
      const slugParts = path.replace(/^\/|\/$/g, '').split('-');
      const isWatchPhpPost = path.includes('watch.php') && urlObj.searchParams.has('id');
      if (slugParts.length === 1 && !/\d{4}/.test(path) && !isWatchPhpPost) return;

      // Extract poster using robust helper
      let poster = extractPosterFromElement($, el, cardContainer);
      if (poster) poster = makeAbsolute(poster, cleanBase);

      const existingIndex = posts.findIndex(p => p.postUrl === absPostUrl);
      if (existingIndex !== -1) {
        if (!posts[existingIndex].poster && poster) {
          posts[existingIndex].poster = poster;
        }
        return;
      }

      const contentType = detectContentType(`${rawTitle} ${$(el).text()} ${$(el).attr('title')}`, absPostUrl);

      seenPostUrls.add(absPostUrl);
      posts.push({
        id: `post_${posts.length}_${Date.now()}`,
        title,
        poster,
        contentType,
        episodeTag: epInfo.tag,
        season: epInfo.season,
        episode: epInfo.episode,
        postUrl: absPostUrl
      });
    });

    console.log(`[Extractor] Site Listing Mode (${siteName}): Found ${posts.length} movie posts (Page ${page}).`);

    return {
      success: true,
      isListing: true,
      siteName,
      targetUrl: cleanBase,
      currentPage: Number(page) || 1,
      totalPages: 10,
      postsPerPage: 32,
      title: `${siteName} - Movie & Series Posts (Page ${page})`,
      poster: '',
      totalFound: posts.length,
      posts: posts.slice(0, 32)
    };
  }

  // Single Movie Post Mode: Extract & Unmask 1080p/x264 direct file links
  console.log(`[Extractor] Single Movie Post Mode (${siteName}): ${targetUrl}`);
  let poster = $('.entry-content img, article img, .post-thumbnail img').first().attr('src') ||
               $('.entry-content img, article img, .post-thumbnail img').first().attr('data-src') || '';
  if (poster) poster = makeAbsolute(poster, cleanBase);

  const finalDirectFiles = await processSinglePostPage(targetUrl, targetUrl);

  // Keep all quality direct files (4K, 1080p, 720p, 480p) while excluding HEVC
  const validDownloads = [];
  const seen = new Set();

  for (const item of finalDirectFiles) {
    if (!item || !item.downloadUrl || seen.has(item.downloadUrl)) continue;

    const urlLower = item.downloadUrl.toLowerCase();
    const qualityLower = (item.quality || '').toLowerCase();
    const contextLower = (item.qualityContext || '').toLowerCase();
    const labelLower = (item.label || '').toLowerCase();
    const fullTextCtx = `${urlLower} ${qualityLower} ${contextLower} ${labelLower}`;

    // Check if file is HEVC / x265 / 10-bit
    const isHevc = fullTextCtx.includes('hevc') || 
                   fullTextCtx.includes('x265') || 
                   fullTextCtx.includes('h265') || 
                   fullTextCtx.includes('h.265') || 
                   fullTextCtx.includes('10bit') || 
                   fullTextCtx.includes('10-bit');

    if (!isHevc) {
      seen.add(item.downloadUrl);
      validDownloads.push(item);
    }
  }

  console.log(`[Extractor] Single Post Extraction Complete! Total Direct Files: ${validDownloads.length}`);

  return {
    success: true,
    isListing: false,
    siteName,
    targetUrl,
    title: $('h1.entry-title, h1.post-title, h1, title').first().text().trim().replace(/\s+/g, ' '),
    poster,
    totalFound: validDownloads.length,
    downloads: validDownloads
  };
}

/**
 * Fetch & aggregate Home Feed posts across all enabled sites
 */
async function getHomeFeed() {
  const sites = getAllSites().filter(s => s.enabled);
  console.log(`[Home Feed] Aggregating home feed from ${sites.length} active sites...`);

  const results = await Promise.allSettled(
    sites.map(site => extractMovie(`https://${site.domain}`, 1))
  );

  const sitePostLists = [];
  results.forEach((res, idx) => {
    if (res.status === 'fulfilled' && res.value && res.value.posts && res.value.posts.length) {
      const siteObj = sites[idx];
      const postsWithSite = res.value.posts.map(p => ({
        ...p,
        siteName: siteObj.name || p.siteName
      }));
      sitePostLists.push(postsWithSite);
    }
  });

  const aggregatedPosts = [];
  const seenTitles = new Set();
  let maxLen = 0;
  sitePostLists.forEach(list => {
    if (list.length > maxLen) maxLen = list.length;
  });

  // Interleave rank-by-rank so the newest releases across all sites stay on top!
  for (let i = 0; i < maxLen; i++) {
    for (const list of sitePostLists) {
      if (i < list.length) {
        const post = list[i];
        const normKey = (post.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normKey && !seenTitles.has(normKey)) {
          seenTitles.add(normKey);
          aggregatedPosts.push(post);
        }
      }
    }
  }

  return {
    success: true,
    posts: aggregatedPosts,
    totalPosts: aggregatedPosts.length
  };
}

/**
 * Fetch movies/series missing on Sunplex.net compared to other sites
 */
async function getSunplexMissing() {
  console.log('[Sunplex Missing] Comparing Sunplex.net catalog with other active sites...');

  let sunplexTitles = new Set();
  try {
    const sunplexRes = await extractMovie('https://sunplex.net/', 1);
    if (sunplexRes && sunplexRes.posts) {
      sunplexRes.posts.forEach(p => {
        const key = (p.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (key) sunplexTitles.add(key);
      });
    }
  } catch (err) {
    console.error('[Sunplex Missing] Failed to fetch Sunplex.net:', err.message);
  }

  const homeFeed = await getHomeFeed();
  const missingPosts = (homeFeed.posts || []).filter(post => {
    const key = (post.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return key && !sunplexTitles.has(key);
  });

  return {
    success: true,
    posts: missingPosts
  };
}

/**
 * Search across all enabled sites using ?s={query}
 */
async function searchAllSites(query) {
  if (!query || !query.trim()) {
    return { success: false, error: 'Query parameter is required' };
  }

  const sites = getAllSites().filter(s => s.enabled);
  console.log(`[Global Search] Searching "${query}" across ${sites.length} active sites...`);

  const results = await Promise.allSettled(
    sites.map(site => {
      const searchUrl = `https://${site.domain}/?s=${encodeURIComponent(query.trim())}`;
      return extractMovie(searchUrl, 1);
    })
  );

  const aggregatedPosts = [];
  const seenUrls = new Set();

  results.forEach((res, idx) => {
    if (res.status === 'fulfilled' && res.value && res.value.posts) {
      const siteObj = sites[idx];
      res.value.posts.forEach(post => {
        if (post.postUrl && !seenUrls.has(post.postUrl)) {
          seenUrls.add(post.postUrl);
          aggregatedPosts.push({
            ...post,
            siteName: siteObj.name || post.siteName
          });
        }
      });
    }
  });

  return {
    success: true,
    isListing: true,
    isSearch: true,
    siteName: 'Global Multi-Site Search',
    title: `Search Results for "${query}" (${aggregatedPosts.length} items)`,
    posts: aggregatedPosts,
    totalFound: aggregatedPosts.length
  };
}

module.exports = {
  extractMovie,
  resolveDirectLink,
  processSinglePostPage,
  cleanTitle,
  detectContentType,
  makeAbsolute,
  getHomeFeed,
  getSunplexMissing,
  searchAllSites
};


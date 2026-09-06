const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const axios = require('axios');
const { getAllSites, addSite, updateSite, deleteSite } = require('./services/siteManager');
const { extractMovie, getHomeFeed, getSunplexMissing, searchAllSites } = require('./services/extractor');
const { discoverFTPServers } = require('./services/ftpScanner');
const { getImdbDetails } = require('./services/imdbService');

const { recordVisit, getStats } = require('./services/analytics');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Hardening
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Record visitor analytics
  if (!req.path.includes('.') || req.path === '/' || req.path === '/index.html') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    recordVisit(ip);
  }
  next();
});

app.use(cors());
app.use(express.json());

// Google Search Verification & SEO Routes (Must be before express.static to avoid CDN caching)
app.get('/googlei9oZs_iDLKiy_tCnXNpWFc_8RwKChuzYvBGaAgc6f0A.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.type('text/html').send('google-site-verification: googlei9oZs_iDLKiy_tCnXNpWFc_8RwKChuzYvBGaAgc6f0A.html');
});

app.get('/robots.txt', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.type('text/plain').send('User-agent: *\nAllow: /\n\nSitemap: https://moviesflix-a5bi.onrender.com/sitemap.xml');
});

app.get('/sitemap.xml', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">
  <url>
    <loc>https://moviesflix-a5bi.onrender.com/</loc>
    <lastmod>2026-09-06</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
});

app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Analytics API Route
app.get('/api/analytics', (req, res) => {
  try {
    const stats = getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1. Site Management APIs
app.get('/api/sites', (req, res) => {
  try {
    const sites = getAllSites();
    res.json({ success: true, sites });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sites', (req, res) => {
  try {
    const newSite = addSite(req.body);
    res.json({ success: true, site: newSite });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/sites/:id', (req, res) => {
  try {
    const updated = updateSite(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/sites/:id', (req, res) => {
  try {
    const deleted = deleteSite(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Extraction API
app.post('/api/extract', async (req, res) => {
  try {
    const { url, page } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const data = await extractMovie(url, page || 1);
    res.json(data);
  } catch (err) {
    console.error('[API /extract Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Feeds & Search APIs
app.get('/api/feed/home', async (req, res) => {
  try {
    const feed = await getHomeFeed();
    res.json(feed);
  } catch (err) {
    console.error('[API /feed/home Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/feed/sunplex-missing', async (req, res) => {
  try {
    const data = await getSunplexMissing();
    res.json(data);
  } catch (err) {
    console.error('[API /feed/sunplex-missing Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    const searchResults = await searchAllSites(query);
    res.json(searchResults);
  } catch (err) {
    console.error('[API /search Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/imdb', async (req, res) => {
  try {
    const title = req.query.title;
    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const details = await getImdbDetails(title);
    res.json({ success: true, details });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. FTP Server Scanner APIs
app.get('/api/ftp/discover', async (req, res) => {
  try {
    const scanData = await discoverFTPServers();
    res.json({ success: true, ...scanData });
  } catch (err) {
    console.error('[API /ftp/discover Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ftp/add', (req, res) => {
  try {
    const { name, domain } = req.body;
    if (!name || !domain) {
      return res.status(400).json({ success: false, error: 'Name and domain are required' });
    }

    const newSite = addSite({
      name,
      domain,
      enabled: true,
      selectors: {
        title: 'h1, h2, .entry-title, title',
        poster: 'img',
        links: 'a[href*=".mkv"], a[href*=".mp4"], a[href*="download"], a',
        container: 'body'
      },
      bypassPatterns: ['hubcloud', 'drivehub', 'pixeldrain']
    });

    res.json({ success: true, site: newSite });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Proxy Download for Browser / IDM Interception (Streamed with Referer Bypass)
app.get(['/api/proxy-download', '/api/download/:filename'], async (req, res) => {
  try {
    const fileUrl = req.query.url;
    let filename = req.params.filename || req.query.filename || 'movie.mkv';

    if (!fileUrl) {
      return res.status(400).send('Download URL is required');
    }

    if (!filename.toLowerCase().endsWith('.mkv') && !filename.toLowerCase().endsWith('.mp4') && !filename.toLowerCase().endsWith('.zip')) {
      filename += '.mkv';
    }

    let refererHeader = fileUrl;
    try {
      const u = new URL(fileUrl);
      refererHeader = `${u.protocol}//${u.hostname}/`;
    } catch (e) {}

    const response = await axios({
      method: 'get',
      url: fileUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': refererHeader
      },
      timeout: 30000
    });

    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const contentLength = response.headers['content-length'];

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    return response.data.pipe(res);
  } catch (err) {
    console.error('[Download Proxy Error]:', err.message);
    if (req.query.url) {
      return res.redirect(req.query.url);
    }
    res.status(500).send('Download Stream Error: ' + err.message);
  }
});

function getIDMPath() {
  const paths = [
    'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe',
    'C:\\Program Files\\Internet Download Manager\\IDMan.exe'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 6. Direct Windows IDM Launcher API
app.post('/api/idm/download', (req, res) => {
  try {
    const { url, filename, addToQueue } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const idmPath = getIDMPath();
    if (!idmPath) {
      return res.status(404).json({ success: false, error: 'IDM executable (IDMan.exe) not found on Windows' });
    }

    const safeName = (filename || 'movie.mkv').replace(/[^a-zA-Z0-9\.\-\_\(\)\[\]\s]/g, '_').trim();
    const args = ['/d', url, '/f', safeName];
    if (addToQueue) {
      args.push('/a');
    }

    execFile(idmPath, args, (err) => {
      if (err && err.code !== 0) {
        console.error('[IDM Exec Error]:', err.message);
      }
    });

    res.json({ success: true, message: '🚀 Direct link sent to IDM successfully!', filename: safeName });
  } catch (err) {
    console.error('[API /idm/download Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Image Proxy for Movie Posters (Bypasses Hotlink Protection & CORS)
app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).send('Image URL is required');
    }

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': imageUrl
      },
      timeout: 10000
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(response.data);
  } catch (err) {
    console.error('[Image Proxy Error]:', err.message);
    res.status(404).send('Image proxy failed');
  }
});

// 8. Contact Form API Endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email, and message are required.' });
    }

    const recipientEmail = 'rayhanvision@gmail.com';

    const contactsFile = path.join(__dirname, 'data', 'contacts.json');
    let contacts = [];
    if (fs.existsSync(contactsFile)) {
      try {
        contacts = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
      } catch(e) { contacts = []; }
    } else {
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    }

    const newContact = {
      id: 'msg_' + Date.now(),
      name: name.trim(),
      email: email.trim(),
      subject: subject || 'General Inquiry',
      message: message.trim(),
      recipient: recipientEmail,
      timestamp: new Date().toISOString()
    };

    contacts.unshift(newContact);
    fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2), 'utf8');

    // 1. Send direct email to rayhanvision@gmail.com via free FormSubmit relay
    try {
      await axios.post('https://formsubmit.co/ajax/rayhanvision@gmail.com', {
        name: name.trim(),
        email: email.trim(),
        _subject: `[MOVIESFLIX Contact] ${subject || 'General Inquiry'} from ${name.trim()}`,
        subject: subject,
        message: message.trim()
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      console.log(`[Contact API] Message dispatched to rayhanvision@gmail.com via FormSubmit service.`);
    } catch (relayErr) {
      console.error('[Contact API Relay Error]:', relayErr.message);
    }

    // 2. Attempt sending email via Nodemailer if SMTP credentials exist
    if (process.env.GMAIL_PASS || (process.env.SMTP_USER && process.env.SMTP_PASS)) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER || 'rayhanvision@gmail.com',
            pass: process.env.GMAIL_PASS || process.env.SMTP_PASS
          }
        });

        await transporter.sendMail({
          from: `"${name.trim()}" <${email.trim()}>`,
          to: recipientEmail,
          subject: `[MOVIESFLIX] ${subject || 'Contact Message'}: ${name}`,
          text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>New Contact Message from MOVIESFLIX</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p><strong>Subject:</strong> ${subject}</p>
            <hr />
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap; background: #f4f4f4; padding: 15px; border-radius: 5px;">${message}</p>
          </div>`
        });
        console.log(`[Contact API] Direct Gmail SMTP email sent to ${recipientEmail}`);
      } catch (mailErr) {
        console.error('[Contact API Direct Gmail SMTP Error]:', mailErr.message);
      }
    }

    res.json({ success: true, message: 'Your message has been sent successfully!' });
  } catch (err) {
    console.error('[API /contact Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve frontend index.html for all other fallback routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎬 Movies Auto-Downloader Engine running on http://localhost:${PORT}`);
  console.log(`====================================================`);
});

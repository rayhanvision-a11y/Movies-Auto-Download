const axios = require('axios');
const { getAllSites, addSite } = require('./siteManager');

// List of popular BD & Open Public FTP / HTTP Movie Servers
const FTP_CANDIDATES = [
  { name: 'Circle FTP', domain: 'ftp.circleftp.net', type: 'Public / BDIX FTP' },
  { name: 'SamOnline FTP', domain: 'samonline.co', type: 'Public / BDIX FTP' },
  { name: 'NaturalBD Movie FTP', domain: 'naturalbd.com', type: 'Public FTP' },
  { name: 'Nagordola FTP', domain: 'nagordola.com', type: 'BD Movie FTP' },
  { name: 'CTG FTP Server', domain: 'ctgftp.com', type: 'Regional FTP' },
  { name: 'ShowTime BD FTP', domain: 'showtimebd.com', type: 'BD Movie FTP' },
  { name: 'MoJalla BD FTP', domain: 'mojallabd.com', type: 'Public FTP' },
  { name: 'Discovery FTP', domain: 'discoveryftp.com', type: 'Movie FTP' },
  { name: 'SpeedNet BD FTP', domain: 'speednetbd.com', type: 'BDIX SpeedNet' },
  { name: 'NetKop FTP', domain: 'netkop.com', type: 'Netkop FTP' },
  { name: 'Elaach FTP', domain: 'elaach.com', type: 'Elaach BD Media' },
  { name: 'DFN Media Server', domain: 'dfn.com.bd', type: 'DFN BDIX FTP' },
  { name: 'CrazyHD Media', domain: 'crazyhd.com', type: 'Torrents & FTP' },
  { name: 'FunTime BD FTP', domain: 'funtimebd.com', type: 'BD Media Server' },
  { name: 'Roar Media FTP', domain: 'roarmedia.com.bd', type: 'BD Media Server' }
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Live test a single FTP candidate server
 */
async function testFTPCandidate(candidate, existingDomainsSet) {
  const targetUrl = candidate.domain.startsWith('http') ? candidate.domain : `http://${candidate.domain}`;
  const startTime = Date.now();

  try {
    const res = await axios.get(targetUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 4500,
      maxRedirects: 3,
      validateStatus: status => status >= 200 && status < 400
    });

    const ping = Date.now() - startTime;
    const isAlreadyAdded = existingDomainsSet.has(candidate.domain.toLowerCase());

    return {
      id: `ftp_${candidate.domain.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name: candidate.name,
      domain: candidate.domain,
      url: targetUrl,
      status: 'Online',
      statusCode: res.status,
      pingMs: ping,
      type: candidate.type,
      isAdded: isAlreadyAdded
    };
  } catch (err) {
    const isAlreadyAdded = existingDomainsSet.has(candidate.domain.toLowerCase());
    return {
      id: `ftp_${candidate.domain.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name: candidate.name,
      domain: candidate.domain,
      url: targetUrl,
      status: 'Offline / ISP Restricted',
      statusCode: err.response ? err.response.status : 0,
      pingMs: 0,
      type: candidate.type,
      isAdded: isAlreadyAdded,
      error: err.message
    };
  }
}

/**
 * Discover and test all candidate FTP servers in parallel
 */
async function discoverFTPServers() {
  const existingSites = getAllSites();
  const existingDomainsSet = new Set(existingSites.map(s => s.domain.toLowerCase()));

  console.log(`[FTP Scanner] Starting discovery scan across ${FTP_CANDIDATES.length} FTP candidates...`);

  const results = await Promise.all(
    FTP_CANDIDATES.map(candidate => testFTPCandidate(candidate, existingDomainsSet))
  );

  const onlineCount = results.filter(r => r.status === 'Online').length;
  console.log(`[FTP Scanner] Scan complete! Online Servers: ${onlineCount} / ${results.length}`);

  return {
    totalScanned: results.length,
    onlineCount,
    servers: results
  };
}

module.exports = {
  discoverFTPServers,
  FTP_CANDIDATES
};

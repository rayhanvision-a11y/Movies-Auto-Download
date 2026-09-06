const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'sites.json');

function ensureDataDirectory() {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify([], null, 2), 'utf8');
  }
}

function getAllSites() {
  ensureDataDirectory();
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading sites:', err);
    return [];
  }
}

function saveSites(sites) {
  ensureDataDirectory();
  fs.writeFileSync(dataPath, JSON.stringify(sites, null, 2), 'utf8');
}

function getSiteByUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    const sites = getAllSites();
    return sites.find(s => s.enabled && hostname.includes(s.domain.toLowerCase()));
  } catch (e) {
    return null;
  }
}

function addSite(siteData) {
  const sites = getAllSites();
  const newSite = {
    id: siteData.id || `site_${Date.now()}`,
    name: siteData.name || 'Custom Site',
    domain: siteData.domain ? siteData.domain.replace(/https?:\/\//, '').replace(/\/.*$/, '').toLowerCase() : '',
    enabled: siteData.enabled !== undefined ? siteData.enabled : true,
    selectors: {
      title: siteData.selectors?.title || 'h1',
      poster: siteData.selectors?.poster || 'img',
      links: siteData.selectors?.links || 'a',
      container: siteData.selectors?.container || 'body'
    },
    bypassPatterns: siteData.bypassPatterns || ['hubcloud', 'drivehub', 'pixeldrain']
  };

  sites.push(newSite);
  saveSites(sites);
  return newSite;
}

function updateSite(id, updateData) {
  const sites = getAllSites();
  const index = sites.findIndex(s => s.id === id);
  if (index === -1) return null;

  sites[index] = {
    ...sites[index],
    ...updateData,
    domain: updateData.domain ? updateData.domain.replace(/https?:\/\//, '').replace(/\/.*$/, '').toLowerCase() : sites[index].domain
  };

  saveSites(sites);
  return sites[index];
}

function deleteSite(id) {
  const sites = getAllSites();
  const filtered = sites.filter(s => s.id !== id);
  if (sites.length === filtered.length) return false;

  saveSites(filtered);
  return true;
}

module.exports = {
  getAllSites,
  getSiteByUrl,
  addSite,
  updateSite,
  deleteSite
};

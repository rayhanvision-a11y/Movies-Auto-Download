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
    isDefault: false,
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
    isDefault: sites[index].isDefault || false,
    domain: updateData.domain ? updateData.domain.replace(/https?:\/\//, '').replace(/\/.*$/, '').toLowerCase() : sites[index].domain
  };

  saveSites(sites);
  return sites[index];
}

function deleteSite(id) {
  const sites = getAllSites();
  const siteToDelete = sites.find(s => s.id === id);
  if (!siteToDelete) return false;
  
  // Protect core default sites (CineFreak, Movies4U, HDHub4U, MovieLinkBD, southfreak)
  const defaultIds = ['cinefreak', 'movies4u', 'hdhub4u', 'movielinkbd', 'southfreak'];
  if (siteToDelete.isDefault || defaultIds.includes(siteToDelete.id)) {
    throw new Error('Core default sites cannot be deleted.');
  }

  const filtered = sites.filter(s => s.id !== id);
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

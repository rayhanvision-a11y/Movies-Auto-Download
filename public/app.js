const { createApp } = Vue;

createApp({
  data() {
    return {
      activeFilter: 'all',
      filterSearchQuery: '',
      watchlist: JSON.parse(localStorage.getItem('user_watchlist') || '[]'),
      watchedEpisodes: JSON.parse(localStorage.getItem('user_watched_episodes') || '{}'),
      inputUrl: '',
      loading: false,
      searchLoading: false,
      extractLoading: false,
      feedLoading: false,
      error: null,
      movieData: null,
      sites: [],
      showSiteModal: false,
      settingsTab: 'sites',
      backupRestoring: false,
      backupStatusMsg: null,
      showFTPModal: false,
      showFAQModal: false,
      showGuideModal: false,
      showContactModal: false,
      showDMCAModal: false,
      showPrivacyModal: false,
      showMobileMenu: false,
      showBackToTop: false,
      visitorStats: {
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        total: 0
      },
      contactLoading: false,
      contactSuccess: false,
      contactError: null,
      contactForm: {
        name: '',
        email: '',
        subject: 'General Inquiry',
        message: ''
      },
      loadingFTP: false,
      ftpServers: [],
      editingSiteId: null,
      searchQuery: '',
      manuallyIgnoredSunplex: JSON.parse(localStorage.getItem('sunplex_manually_ignored') || '[]'),
      currentPage: 1,
      itemsPerPage: 20,
      downloadViewMode: 'grid',
      siteForm: {
        name: '',
        domain: '',
        selectors: {
          title: 'h1.entry-title, h1',
          poster: '.entry-content img, article img',
          links: 'a[href*="download"], a[href*="drive"], a[href*="link"]',
          container: '.entry-content'
        }
      }
    };
  },

  computed: {
    totalPostsCount() {
      return (this.movieData && this.movieData.posts) ? this.movieData.posts.length : 0;
    },
    moviesCount() {
      if (!this.movieData || !this.movieData.posts) return 0;
      return this.movieData.posts.filter(p => p.contentType === 'movie').length;
    },
    seriesCount() {
      if (!this.movieData || !this.movieData.posts) return 0;
      return this.movieData.posts.filter(p => p.contentType === 'series').length;
    },
    onlineFtpCount() {
      return this.ftpServers.filter(s => s.status === 'Online').length;
    },
    fastestFtpServer() {
      const online = this.ftpServers.filter(s => s.status === 'Online' && s.pingMs > 0);
      if (!online.length) return null;
      return online.reduce((min, s) => s.pingMs < min.pingMs ? s : min, online[0]);
    },
    totalPages() {
      if (!this.movieData) return 1;
      if (this.movieData.isHomeFeed || this.movieData.isSunplexMissing || this.movieData.isSearch || this.movieData.isWatchlist) {
        return Math.max(1, Math.ceil(this.totalPostsCount / this.itemsPerPage));
      }
      return this.movieData.totalPages || 10;
    },
    paginatedPosts() {
      if (!this.movieData || !this.movieData.posts) return [];
      let posts = this.movieData.posts;

      if (this.activeFilter === 'movie') {
        posts = posts.filter(p => p.contentType === 'movie');
      } else if (this.activeFilter === 'series') {
        posts = posts.filter(p => p.contentType === 'series');
      }

      if (this.filterSearchQuery.trim()) {
        const q = this.filterSearchQuery.toLowerCase().trim();
        posts = posts.filter(p => (p.title || '').toLowerCase().includes(q));
      }

      if (this.movieData.isHomeFeed || this.movieData.isSunplexMissing || this.movieData.isSearch || this.movieData.isWatchlist) {
        const start = (this.currentPage - 1) * this.itemsPerPage;
        return posts.slice(start, start + this.itemsPerPage);
      }
      return posts;
    },
    pageNumbers() {
      const total = this.totalPages;
      const current = this.currentPage;
      if (total <= 10) {
        return Array.from({ length: total }, (_, i) => i + 1);
      }
      let start = Math.max(1, current - 4);
      let end = Math.min(total, start + 9);
      if (end - start < 9) {
        start = Math.max(1, end - 9);
      }
      const pages = [];
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      return pages;
    },
    filteredDownloads() {
      if (!this.movieData || !this.movieData.downloads || !this.movieData.downloads.length) return [];
      
      // 1. Filter out 480p, 720p, 360p, 4k
      const initial = this.movieData.downloads.filter(dl => {
        const q = (dl.quality || '').toLowerCase();
        const label = (dl.label || '').toLowerCase();
        const ctx = (dl.qualityContext || '').toLowerCase();
        const full = `${q} ${label} ${ctx}`;

        if (full.includes('480p') || full.includes('360p') || full.includes('720p') || full.includes('2160p') || full.includes('4k')) {
          if (!full.includes('1080p')) return false;
        }
        return true;
      });

      // 2. Deduplicate multiple link mirrors per episode
      const parseEpNum = (dl) => {
        const text = `${dl.label || ''} ${dl.movieTitle || ''} ${dl.qualityContext || ''}`;
        const m = text.match(/\bS\d{1,2}\s*(?:E|EP)\s*(\d{1,3})\b/i) || 
                  text.match(/\bSeason\s*\d{1,2}\s*(?:Episode|EP|E)\s*(\d{1,3})\b/i) ||
                  text.match(/\b(?:Episode|EP)\s*(\d{1,3})\b/i) ||
                  text.match(/\[S\d{1,2}E(\d{1,3})\]/i);
        if (m) return parseInt(m[1], 10);
        return null;
      };

      const episodeMap = new Map();
      const unassigned = [];

      initial.forEach(dl => {
        const epNum = parseEpNum(dl);
        const urlLower = (dl.downloadUrl || '').toLowerCase();
        const isDirectVideo = urlLower.includes('.mkv') || urlLower.includes('.mp4') || urlLower.includes('cloudflarestorage.com') || urlLower.includes('r2.dev') || urlLower.includes('b-cdn.net') || urlLower.includes('pixeldrain.com');

        if (epNum !== null) {
          if (!episodeMap.has(epNum)) {
            episodeMap.set(epNum, dl);
          } else {
            const existing = episodeMap.get(epNum);
            const existingUrl = (existing.downloadUrl || '').toLowerCase();
            const existingIsDirect = existingUrl.includes('.mkv') || existingUrl.includes('.mp4') || existingUrl.includes('cloudflarestorage.com') || existingUrl.includes('r2.dev') || existingUrl.includes('b-cdn.net') || existingUrl.includes('pixeldrain.com');
            
            if (isDirectVideo && !existingIsDirect) {
              episodeMap.set(epNum, dl);
            }
          }
        } else {
          const cleanUrl = dl.downloadUrl.split('?')[0];
          if (!unassigned.some(item => item.downloadUrl.split('?')[0] === cleanUrl)) {
            unassigned.push(dl);
          }
        }
      });

      if (episodeMap.size > 0) {
        const sortedEpNums = Array.from(episodeMap.keys()).sort((a, b) => a - b);
        return sortedEpNums.map(num => episodeMap.get(num));
      }

      return unassigned;
    }
  },

  async mounted() {
    window.addEventListener('scroll', () => {
      this.showBackToTop = window.scrollY > 400;
    });
    await this.fetchSites();
    await this.fetchAnalytics();
    await this.loadHomeFeed();
  },

  methods: {
    scrollToTop() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    changePage(pageNum) {
      if (pageNum < 1 || pageNum > this.totalPages) return;
      this.currentPage = pageNum;
      
      if (this.movieData && !this.movieData.isHomeFeed && !this.movieData.isSunplexMissing && !this.movieData.isSearch && this.movieData.targetUrl) {
        this.fetchPage(pageNum);
      } else {
        const el = document.getElementById('posts-grid-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 350, behavior: 'smooth' });
        }
      }
    },
    async fetchSites() {
      try {
        const res = await fetch('/api/sites');
        const data = await res.json();
        if (data.success) {
          this.sites = data.sites;
        }
      } catch (err) {
        console.error('Failed to load sites:', err);
      }
    },
    async fetchAnalytics() {
      try {
        const res = await fetch('/api/analytics');
        const data = await res.json();
        if (data.success && data.stats) {
          this.visitorStats = data.stats;
        }
      } catch (err) {
        console.error('Failed to load visitor stats:', err);
      }
    },

    async handleExtract(urlToExtract) {
      const target = (typeof urlToExtract === 'string' && urlToExtract) ? urlToExtract : this.inputUrl;
      if (!target || typeof target !== 'string') return;

      this.inputUrl = target;
      this.extractLoading = true;
      this.loading = true;
      this.error = null;
      this.currentPage = 1;

      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: target })
        });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to extract movie details');
        }

        if (data.isListing) {
          this.lastListingData = data;
        }
        this.movieData = data;
      } catch (err) {
        this.error = err.message;
      } finally {
        this.extractLoading = false;
        this.loading = false;
      }
    },

    extractSpecificPost(postUrl) {
      this.handleExtract(postUrl);
    },

    goBackToListing() {
      if (this.lastListingData) {
        this.movieData = this.lastListingData;
        this.inputUrl = this.lastListingData.targetUrl;
      } else {
        const siteConfig = this.sites.find(s => this.movieData && this.movieData.targetUrl && s.domain && this.movieData.targetUrl.includes(s.domain));
        if (siteConfig) {
          this.handleExtract(`https://${siteConfig.domain}`);
        }
      }
    },

    async fetchPage(pageNum) {
      if (!this.movieData || !this.movieData.targetUrl) return;
      this.loading = true;
      this.error = null;
      this.currentPage = pageNum;

      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: this.movieData.targetUrl, page: pageNum })
        });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch page');
        }

        if (data.isListing) {
          this.lastListingData = data;
        }
        this.movieData = data;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },

    async loadSunplexMissing() {
      this.loading = true;
      this.error = null;
      this.movieData = null;
      this.currentPage = 1;

      try {
        const res = await fetch('/api/feed/sunplex-missing');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to compare with Sunplex.net');

        const activePosts = (data.posts || []).filter(p => {
          const key = (p.title || '').toLowerCase().trim();
          return !this.manuallyIgnoredSunplex.includes(key);
        });

        this.movieData = {
          success: true,
          isListing: true,
          isHomeFeed: false,
          isSunplexMissing: true,
          siteName: 'Missing on Sunplex.net',
          targetUrl: 'http://sunplex.net/',
          title: `Movies & Series Missing on Sunplex.net (${activePosts.length} items)`,
          posts: activePosts,
          totalFound: activePosts.length
        };
        this.lastListingData = this.movieData;
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },

    markAsPresent(post) {
      const key = (post.title || '').toLowerCase().trim();
      if (key && !this.manuallyIgnoredSunplex.includes(key)) {
        this.manuallyIgnoredSunplex.push(key);
        localStorage.setItem('sunplex_manually_ignored', JSON.stringify(this.manuallyIgnoredSunplex));
      }
      if (this.movieData && this.movieData.posts) {
        this.movieData.posts = this.movieData.posts.filter(p => (p.title || '').toLowerCase().trim() !== key);
        this.movieData.totalFound = this.movieData.posts.length;
        this.movieData.title = `Movies & Series Missing on Sunplex.net (${this.movieData.posts.length} items)`;
      }
    },

    resetIgnoredSunplex() {
      this.manuallyIgnoredSunplex = [];
      localStorage.removeItem('sunplex_manually_ignored');
      this.loadSunplexMissing();
    },

    async loadHomeFeed() {
      this.loading = true;
      this.error = null;
      this.movieData = null;
      this.currentPage = 1;

      try {
        const res = await fetch('/api/feed/home');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load Home Feed');

        this.movieData = {
          success: true,
          isListing: true,
          isHomeFeed: true,
          siteName: 'All Sites Home Feed',
          targetUrl: '',
          title: 'All Sites Aggregated Home Feed (CineFreak, Movies4U, HDHub4U, MovieLinkBD)',
          posts: data.posts,
          totalFound: data.totalPosts
        };
        this.lastListingData = this.movieData;
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },

    async performGlobalSearch(q) {
      const query = (typeof q === 'string' && q) ? q : this.searchQuery;
      if (!query || !query.trim()) return;

      this.searchLoading = true;
      this.loading = true;
      this.error = null;
      this.movieData = null;
      this.currentPage = 1;

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Global Search Failed');
        }
        this.movieData = data;
        this.lastListingData = this.movieData;
      } catch (err) {
        this.error = err.message;
      } finally {
        this.searchLoading = false;
        this.loading = false;
      }
    },

    exportIDMList() {
      if (!this.movieData || !this.movieData.downloads || !this.movieData.downloads.length) return;

      const downloads = this.movieData.downloads;
      let ef2Content = '';
      let txtContent = '';

      downloads.forEach((dl) => {
        if (dl.downloadUrl) {
          ef2Content += `<\r\n${dl.downloadUrl}\r\nfile=${dl.label || 'video.mkv'}\r\n>\r\n`;
          txtContent += `${dl.downloadUrl}\r\n`;
        }
      });

      // Download .ef2 file for IDM Batch Import
      const blob = new Blob([ef2Content], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      const safeTitle = (this.movieData.title || 'idm_download_list').replace(/[^a-zA-Z0-9]/g, '_');
      link.href = URL.createObjectURL(blob);
      link.download = `${safeTitle}_IDM_Batch.ef2`;
      link.click();
      URL.revokeObjectURL(link.href);

      // Copy plain text URLs to clipboard as well
      navigator.clipboard.writeText(txtContent).then(() => {
        alert('✅ IDM Batch Import (.ef2) file downloaded!\n📋 Direct 1080p links also copied to your clipboard for IDM!');
      }).catch(() => {});
    },

    getDownloadHref(dl) {
      if (!dl || !dl.downloadUrl) return '#';
      
      let safeName = (dl.label || 'video.mkv').replace(/[^a-zA-Z0-9\.\-\_\(\)\[\]\s]/g, '_').trim();
      if (!safeName.toLowerCase().endsWith('.mkv') && !safeName.toLowerCase().endsWith('.mp4') && !safeName.toLowerCase().endsWith('.zip')) {
        safeName += '.mkv';
      }
      return `/api/download/${encodeURIComponent(safeName)}?url=${encodeURIComponent(dl.downloadUrl)}`;
    },

    async sendDirectToIDM(dl) {
      if (!dl || !dl.downloadUrl) return;
      try {
        const proxyUrl = window.location.origin + this.getDownloadHref(dl);
        const res = await fetch('/api/idm/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: proxyUrl,
            filename: dl.label
          })
        });
        
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          this.triggerDirectDownload(dl);
          return;
        }

        const data = await res.json();
        if (data && data.success) {
          console.log('🚀 Sent directly to IDM:', data.filename);
        } else {
          this.triggerDirectDownload(dl);
        }
      } catch (err) {
        this.triggerDirectDownload(dl);
      }
    },

    triggerDirectDownload(dl) {
      if (!dl || !dl.downloadUrl) return;
      navigator.clipboard.writeText(dl.downloadUrl).catch(() => {});
      const proxyUrl = this.getDownloadHref(dl);
      const a = document.createElement('a');
      a.href = proxyUrl;
      a.setAttribute('download', (dl.label || 'video.mkv'));
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
      }, 200);
    },

    async sendAllToIDM() {
      if (!this.movieData || !this.movieData.downloads || !this.movieData.downloads.length) return;
      const downloads = this.filteredDownloads.length ? this.filteredDownloads : this.movieData.downloads;
      for (const dl of downloads) {
        if (!dl.downloadUrl) continue;
        const proxyUrl = window.location.origin + this.getDownloadHref(dl);
        try {
          await fetch('/api/idm/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: proxyUrl,
              filename: dl.label,
              addToQueue: true
            })
          });
        } catch (e) {}
      }
    },

    downloadAll() {
      const downloads = this.filteredDownloads.length ? this.filteredDownloads : (this.movieData ? this.movieData.downloads : []);
      if (!downloads || !downloads.length) return;

      downloads.forEach((dl, i) => {
        setTimeout(() => {
          const proxyUrl = this.getDownloadHref(dl);
          const a = document.createElement('a');
          a.href = proxyUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, i * 800); // 800ms spacing between triggers for IDM interception
      });
    },

    copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        alert('📋 Direct Download URL copied to clipboard!\nOpen IDM and press "Add URL" or Ctrl+V if IDM does not pop up automatically.');
      }).catch(err => {
        console.error('Copy failed:', err);
      });
    },

    getDownloadCardInfo(dl, idx) {
      if (!dl) return { title: '', season: 'S01', episode: 'Episode 01', audioBadge: 'Bengali ORG', specs: { format: 'WEB-DL', audio: 'AAC 2.0', video: 'H264', sub: 'SoftSub' } };

      const mainTitle = (this.movieData && this.movieData.title) ? this.movieData.title : (dl.movieTitle || dl.label || 'Movie');
      
      // Exclude raw downloadUrl from regex parsing to prevent hex hashes (e.g. e86, e65) from matching as episode numbers!
      const readableText = `${mainTitle} ${dl.movieTitle || ''} ${dl.label || ''} ${dl.qualityContext || ''}`;

      // 1. Clean Title: Keep clean name with year like "Sultan Salahuddin Ayyubi (2026)"
      let cleanTitle = mainTitle;
      cleanTitle = cleanTitle
        .replace(/bengali\s*dubbed.*/gi, '')
        .replace(/bangla\s*dubbed.*/gi, '')
        .replace(/bongobd\s*original.*/gi, '')
        .replace(/web\s*series.*/gi, '')
        .replace(/season\s*\d+.*/gi, '')
        .replace(/s0?\d+.*/gi, '')
        .replace(/download\s*&.*/gi, '')
        .replace(/\[.*\]/g, '')
        .replace(/-\s*(cinefreak|movies4u|hdhub4u|movielinkbd|southfreak|sunplex).*/gi, '')
        .trim();

      const yearMatch = readableText.match(/\((19|20)\d{2}\)|\b(19|20)\d{2}\b/);
      if (yearMatch && !cleanTitle.includes(yearMatch[0])) {
        const yr = yearMatch[0].startsWith('(') ? yearMatch[0] : `(${yearMatch[0]})`;
        cleanTitle = `${cleanTitle} ${yr}`;
      }
      if (!cleanTitle) cleanTitle = dl.movieTitle || 'Movie Title';

      // 2. Detect Content Type: Movie vs Series
      const textLower = readableText.toLowerCase();
      let isSeries = false;

      if (
        textLower.includes('season') ||
        textLower.includes('series') ||
        textLower.includes('episode') ||
        /\bs0?\d+/i.test(textLower) ||
        /\be0?\d+/i.test(textLower) ||
        textLower.includes('k-drama') ||
        textLower.includes('kdrama') ||
        textLower.includes('j-drama') ||
        textLower.includes('c-drama') ||
        textLower.includes('weekly')
      ) {
        if (textLower.includes('full movie') && !textLower.includes('season') && !textLower.includes('episode') && !textLower.includes('series')) {
          isSeries = false;
        } else {
          isSeries = true;
        }
      } else {
        isSeries = false;
      }

      // 3. Season (S01, S02) - Only if series
      let season = 'S01';
      const sMatch = readableText.match(/\bS(\d{1,2})\b/i) || readableText.match(/\bSeason\s*(\d{1,2})\b/i);
      if (sMatch) {
        season = `S${String(parseInt(sMatch[1], 10)).padStart(2, '0')}`;
      }

      // 4. Episode Extraction - Only if series
      let episode = '';
      if (isSeries) {
        const sEpMatch = readableText.match(/\bS\d{1,2}\s*(?:E|EP)\s*(\d{1,3})\b/i) || readableText.match(/\bSeason\s*\d{1,2}\s*(?:Episode|EP|E)\s*(\d{1,3})\b/i);
        const epMatch = readableText.match(/\b(?:Episode|EP)\s*(\d{1,3})\b/i) || readableText.match(/(?:^|[^\w])E(\d{1,3})(?:[^\w]|$)/i);

        if (sEpMatch) {
          episode = `Episode ${String(parseInt(sEpMatch[1], 10)).padStart(2, '0')}`;
        } else if (epMatch) {
          episode = `Episode ${String(parseInt(epMatch[1], 10)).padStart(2, '0')}`;
        } else {
          episode = `Episode ${String((idx !== undefined ? idx : 0) + 1).padStart(2, '0')}`;
        }
      }

      // 5. Audio / Language Badge
      let audioBadge = 'Bengali ORG';
      if (/bengali\s*sub|bangla\s*sub|esub/i.test(readableText)) {
        audioBadge = 'Bengali Sub';
      } else if (/bengali\s*org|bangla\s*org/i.test(readableText)) {
        audioBadge = 'Bengali ORG';
      } else if (/bongobd\s*original|bongobd/i.test(readableText)) {
        audioBadge = 'Bengali ORG';
      } else if (/dual\s*audio/i.test(readableText)) {
        audioBadge = 'Dual Audio';
      } else if (/hindi\s*dubbed|hindi\s*org|hindi/i.test(readableText)) {
        audioBadge = 'Hindi ORG';
      } else if (/english/i.test(readableText)) {
        audioBadge = 'English';
      } else if (/bengali|bangla/i.test(readableText)) {
        audioBadge = 'Bengali ORG';
      }

      // 6. Tech Specs
      let format = 'WEB-DL';
      if (/bluray/i.test(readableText)) format = 'BluRay';
      else if (/webrip/i.test(readableText)) format = 'WEBRip';
      else if (/hdrip/i.test(readableText)) format = 'HDRip';
      else if (/hdts|hd-ts|ts/i.test(readableText)) format = 'HDTS';
      else if (/hdtv/i.test(readableText)) format = 'HDTV';

      let audio = 'AAC 2.0';
      if (/aac\s*5\.1/i.test(readableText)) audio = 'AAC 5.1';
      else if (/dd\+?\s*5\.1|eac3/i.test(readableText)) audio = 'DD+ 5.1';
      else if (/dts/i.test(readableText)) audio = 'DTS';

      let video = 'H264';
      if (/x264|h264|avc/i.test(readableText)) video = 'H264';
      else if (/hevc|x265|h265/i.test(readableText)) video = 'HEVC';

      let sub = 'SoftSub';
      if (/hardsub|hc-esub/i.test(readableText)) sub = 'HardSub';
      else if (/esub|esubs/i.test(readableText)) sub = 'ESub';
      else if (/nosub/i.test(readableText)) sub = 'NoSub';

      return {
        title: cleanTitle,
        isSeries,
        season,
        episode,
        audioBadge,
        specs: { format, audio, video, sub }
      };
    },

    openFTPModal() {
      this.showFTPModal = true;
      if (this.ftpServers.length === 0) {
        this.scanFTPServers();
      }
    },

    async scanFTPServers() {
      this.loadingFTP = true;
      try {
        const res = await fetch('/api/ftp/discover');
        const data = await res.json();
        if (data.success) {
          this.ftpServers = data.servers;
        } else {
          alert('FTP Scan Failed: ' + data.error);
        }
      } catch (err) {
        alert('FTP Scan Error: ' + err.message);
      } finally {
        this.loadingFTP = false;
      }
    },

    async addFTPServer(server) {
      try {
        const res = await fetch('/api/ftp/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: server.name, domain: server.domain })
        });
        const data = await res.json();
        if (data.success) {
          server.isAdded = true;
          await this.fetchSites();
          await this.loadHomeFeed();
          alert(`✅ ${server.name} (${server.domain}) successfully added to your sites!`);
        } else {
          alert('Failed to add FTP server: ' + data.error);
        }
      } catch (err) {
        alert('Error adding FTP server: ' + err.message);
      }
    },

    openSiteModal() {
      this.resetSiteForm();
      this.showSiteModal = true;
    },

    resetSiteForm() {
      this.editingSiteId = null;
      this.siteForm = {
        name: '',
        domain: ''
      };
    },

    editSite(site) {
      this.editingSiteId = site.id;
      this.siteForm = JSON.parse(JSON.stringify(site));
    },

    async saveSite() {
      try {
        const method = this.editingSiteId ? 'PUT' : 'POST';
        const url = this.editingSiteId ? `/api/sites/${this.editingSiteId}` : '/api/sites';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.siteForm)
        });

        const data = await res.json();
        if (data.success) {
          await this.fetchSites();
          this.resetSiteForm();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (err) {
        alert('Failed to save site: ' + err.message);
      }
    },

    async removeSite(id) {
      if (!confirm('Are you sure you want to delete this site configuration?')) return;
      try {
        const res = await fetch(`/api/sites/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          await this.fetchSites();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (err) {
        alert('Failed to delete site: ' + err.message);
      }
    },

    async exportDatabaseBackup() {
      try {
        const res = await fetch('/api/backup/export');
        if (!res.ok) throw new Error('Failed to export backup');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `adfree_movies_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        alert('Failed to export backup: ' + err.message);
      }
    },

    async triggerRestoreUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      if (!confirm(`Are you sure you want to restore database from "${file.name}"? This will overwrite site configurations and settings.`)) {
        event.target.value = '';
        return;
      }

      this.backupRestoring = true;
      this.backupStatusMsg = 'Restoring database from backup file...';

      try {
        const text = await file.text();
        const backupData = JSON.parse(text);

        const res = await fetch('/api/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backupData)
        });
        const data = await res.json();
        if (data.success) {
          this.backupStatusMsg = '✅ Database successfully restored! Reloading configuration...';
          await this.fetchSites();
          await this.fetchAnalytics();
          setTimeout(() => {
            this.backupStatusMsg = null;
          }, 3500);
        } else {
          throw new Error(data.error || 'Restore failed');
        }
      } catch (err) {
        this.backupStatusMsg = '❌ Error: ' + err.message;
        alert('Backup restore failed: ' + err.message);
      } finally {
        this.backupRestoring = false;
        event.target.value = '';
      }
    },

    setFilter(filterType) {
      this.activeFilter = filterType;
      this.currentPage = 1;
    },

    toggleWatchlist(post) {
      const idx = this.watchlist.findIndex(item => item.url === post.url || item.title === post.title);
      if (idx > -1) {
        this.watchlist.splice(idx, 1);
      } else {
        this.watchlist.unshift(post);
      }
      localStorage.setItem('user_watchlist', JSON.stringify(this.watchlist));
    },

    isWatchlisted(post) {
      if (!post) return false;
      return this.watchlist.some(item => item.url === post.url || item.title === post.title);
    },

    loadWatchlistFeed() {
      this.currentPage = 1;
      this.activeFilter = 'all';
      this.movieData = {
        title: '⭐ My Bookmarked Watchlist',
        posts: this.watchlist,
        isWatchlist: true
      };
    },

    toggleWatched(post) {
      if (!post || !post.title) return;
      const cleanKey = post.title.replace(/\s*S\d{1,2}\s*(?:E|EP)?\s*\d{1,5}\b/gi, '').trim();

      if (this.isWatched(post)) {
        delete this.watchedEpisodes[cleanKey];
      } else {
        this.watchedEpisodes[cleanKey] = {
          title: cleanKey,
          tag: post.episodeTag || 'Watched',
          season: post.season || 1,
          episode: post.episode || 1,
          watchedAt: new Date().toISOString()
        };
      }
      this.watchedEpisodes = { ...this.watchedEpisodes };
      localStorage.setItem('user_watched_episodes', JSON.stringify(this.watchedEpisodes));
    },

    isWatched(post) {
      if (!post || !post.title) return false;
      const cleanKey = post.title.replace(/\s*S\d{1,2}\s*(?:E|EP)?\s*\d{1,5}\b/gi, '').trim();
      const watched = this.watchedEpisodes[cleanKey];
      if (!watched) return false;

      // If it's a TV series with episode tags, check if current post episode <= watched episode
      if (post.episode && watched.episode) {
        return post.episode <= watched.episode;
      }
      return true;
    },

    hasNewEpisode(post) {
      if (!post || post.contentType !== 'series' || !post.episodeTag) return false;
      const cleanKey = post.title.replace(/\s*S\d{1,2}\s*(?:E|EP)?\s*\d{1,5}\b/gi, '').trim();
      const watched = this.watchedEpisodes[cleanKey];
      if (!watched) return false; // If not watched at all, it's fresh

      if (post.episode && watched.episode && post.episode > watched.episode) {
        return true; // Brand new episode released after last watched!
      }
      return false;
    },

    async fetchImdbRating(post) {
      if (!post || post.imdbRating !== undefined) return;
      try {
        const res = await fetch(`/api/imdb?title=${encodeURIComponent(post.title)}`);
        const data = await res.json();
        if (data.success && data.details) {
          post.imdbRating = data.details.imdbRating;
          post.genre = data.details.genre;
          post.plot = data.details.plot;
        } else {
          post.imdbRating = null;
        }
      } catch (e) {
        post.imdbRating = null;
      }
    },

    openContactModal() {
      this.showContactModal = true;
      this.contactSuccess = false;
      this.contactError = null;
    },
    closeContactModal() {
      this.showContactModal = false;
    },
    openFAQModal() {
      this.showFAQModal = true;
    },
    closeFAQModal() {
      this.showFAQModal = false;
    },
    openGuideModal() {
      this.showGuideModal = true;
    },
    closeGuideModal() {
      this.showGuideModal = false;
    },
    openDMCAModal() {
      this.showDMCAModal = true;
    },
    closeDMCAModal() {
      this.showDMCAModal = false;
    },
    openPrivacyModal() {
      this.showPrivacyModal = true;
    },
    closePrivacyModal() {
      this.showPrivacyModal = false;
    },
    async submitContactForm() {
      if (!this.contactForm.name || !this.contactForm.email || !this.contactForm.message) {
        this.contactError = 'Please fill out all required fields (Name, Email, and Message).';
        return;
      }
      this.contactLoading = true;
      this.contactError = null;
      this.contactSuccess = false;
      try {
        // 1. Direct browser client dispatch to FormSubmit (FormSubmit relays directly to rayhanvision@gmail.com)
        const formData = new FormData();
        formData.append('name', this.contactForm.name);
        formData.append('email', this.contactForm.email);
        formData.append('_subject', `[AdFreeMovies Contact] ${this.contactForm.subject || 'General Inquiry'} from ${this.contactForm.name}`);
        formData.append('subject', this.contactForm.subject || 'General Inquiry');
        formData.append('message', this.contactForm.message);
        formData.append('_captcha', 'false');
        formData.append('_template', 'table');

        await fetch('https://formsubmit.co/ajax/rayhanvision@gmail.com', {
          method: 'POST',
          body: formData
        });

        // 2. Save locally on Node server
        await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.contactForm)
        });

        this.contactSuccess = true;
        this.contactForm = { name: '', email: '', subject: 'General Inquiry', message: '' };
      } catch (err) {
        try {
          await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.contactForm)
          });
          this.contactSuccess = true;
          this.contactForm = { name: '', email: '', subject: 'General Inquiry', message: '' };
        } catch(e) {
          this.contactError = 'Error submitting message: ' + err.message;
        }
      } finally {
        this.contactLoading = false;
      }
    },
    getPosterUrl(poster) {
      if (!poster || typeof poster !== 'string' || !poster.trim()) {
        return '/default-poster.jpg';
      }
      if (poster.startsWith('/') || poster.startsWith('data:')) {
        return poster;
      }
      return '/api/image-proxy?url=' + encodeURIComponent(poster);
    },
    handlePosterError(event) {
      if (event && event.target) {
        event.target.src = '/default-poster.jpg';
      }
    }
  }
}).mount('#app');

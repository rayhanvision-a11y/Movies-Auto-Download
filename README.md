# 🎬 AdFreeMovies — Direct 1080p Auto-Downloader & Meta-Indexing Engine

![License](https://img.shields.io/badge/License-MIT-brightgreen.svg)
![NodeJS](https://img.shields.io/badge/Node.js-18.x-emerald.svg)
![VueJS](https://img.shields.io/badge/Vue.js-3.x-4FC08D.svg)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.x-38BDF8.svg)
![Status](https://img.shields.io/badge/Deploy-Render-online.svg)
![DMCA](https://img.shields.io/badge/DMCA-Protected%20%26%20Compliant-orange.svg)

**AdFreeMovies** (formerly MOVIESFLIX Engine) is a modern, high-speed, zero-ad media link extraction and live meta-indexing engine. It automatically bypasses shortlinks, aggressive popup redirects, and timer locks across active movie indexing sites (such as CineFreak, Movies4U, HDHub4U, MovieLinkBD, and SouthFreak), extracting clean direct `.MKV` / `.MP4` 4K, 1080p, and 720p video download links in real-time.

🌐 **Live Production URL:** [https://moviesflix-a5bi.onrender.com/](https://moviesflix-a5bi.onrender.com/)

---

## ✨ Key Features

- **⚡ Real-Time Popup & Shortlink Bypasser:** Unmasks direct Cloudflare R2, Google Drive, HubCloud, and PixelDrain download links in under 3 seconds with zero ads.
- **🎬 Aggregated Multi-Site Home Feed:** Live indexes and merges trending movie posts across multiple streaming sources into one unified, searchable grid.
- **📥 Direct Windows IDM Integration:**
  - `Send to IDM`: Communicates directly with `IDMan.exe` on Windows to enqueue batch files automatically.
  - `Export IDM List (.ef2)`: Generates downloadable IDM export files for one-click batch importing.
- **🇧🇩 BDIX FTP Server Auto-Scanner:** Auto-detects and scans active BDIX FTP servers in Bangladesh for ultra-fast local network download speeds.
- **🎯 Smart Resolution & Quality Filtering:** Labeled 4K Ultra HD, 1080p Full HD, 720p HD, and 480p SD links. Automatically filters out unplayable HEVC / x265 encoded files.
- **📱 100% Mobile Responsive UI:** Built with Vue 3, Tailwind CSS glassmorphism, responsive hamburger menu drawers, and smooth back-to-top controls.
- **🛡️ Legal & DMCA Protected:** Operates strictly as a client-side link parser and meta-indexing engine. Hosts zero copyrighted files on its servers.

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Backend Core** | Node.js, Express.js, Axios, Cheerio, VM (Virtual Machine Sandbox) |
| **Frontend Framework** | Vue 3 (Zero-Latency Engine), Tailwind CSS v3, FontAwesome 6 |
| **Parsing & Scraping** | Custom Regex Parsers, Headless AST Evaluation, Reverse Proxy |
| **Deployment** | Render Cloud Web Service, GitHub Version Control |

---

## ⚙️ How It Works (System Architecture)

```
[ User Input / Home Feed ]
           │
           ▼
[ Node.js Express Engine ] ───▶ [ Live Web Extractor (Axios + Cheerio) ]
           │                                       │
           │                                       ▼
           │                         [ Unmask Shortlinks & Popups ]
           │                                       │
           ▼                                       ▼
[ Vue 3 Client UI ] ◀─────── [ Direct 1080p .MKV / .MP4 Video URLs ]
           │
           ▼
[ 1-Click IDM Auto-Downloader / BDIX FTP Acceleration ]
```

1. **Live Meta-Indexing:** The engine fetches public RSS/HTML feeds from configured movie sites.
2. **Shortlink Unmasking:** Bypasses intermediate redirect pages (HubCloud, DriveHub, PixelDrain, CineCloud) inside a sandboxed VM.
3. **Quality Parsing:** Parses video resolution tags (1080p, 720p, 480p) and purges HEVC files.
4. **Direct Delivery:** Delivers direct video links straight to your browser or directly into your Windows Internet Download Manager (IDM).

---

## 🚀 Local Installation & Quick Start

Follow these steps to run **AdFreeMovies Engine** locally on your computer:

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.0 or higher)
- [Git](https://git-scm.com/)

### Step 1: Clone Repository
```bash
git clone https://github.com/rayhanvision-a11y/Movies-Auto-Download.git
cd Movies-Auto-Download
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Start Local Server
```bash
npm start
# or on Windows:
start.bat
```

### Step 4: Open in Browser
Navigate to `http://localhost:5000` in your web browser.

---

## ⚖️ Legal & DMCA Disclaimer

> **IMPORTANT NOTICE:**  
> **AdFreeMovies** operates strictly as an automated link indexing and client-side URL parsing tool.  
> **WE DO NOT HOST, STORE, STREAM, UPLOAD, OR DISTRIBUTE ANY MEDIA FILES, VIDEOS, OR COPYRIGHTED CONTENT ON OUR SERVERS.**  
> All movie titles, posters, metadata, and download links are extracted in real-time from publicly accessible third-party indexing sites.

For valid DMCA takedown requests or inquiry, please contact: `rayhanvision@gmail.com`

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

Developed with ❤️ by [Rayhan Vision](https://github.com/rayhanvision-a11y)

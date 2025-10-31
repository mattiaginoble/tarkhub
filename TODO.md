# 🚀 TarkHub Roadmap

This list tracks the main activities and necessary changes.

## 💻 Backend (C# API)

- [x] Implement Mod downloader system.
- [x] Implement Mod versioning check.
- [x] Retrieve new Mod version.
- [x] Check installed Mod in the list.
- [x] Update button to download new mod version and update JSON.
- [x] Notify when SPT has a new release.
- [x] **[New Feature]** Auto download and install new SPT version.
- [x] Notify when Fika has a new release.
- [x] **[New Feature]** Auto download and install new Fika version.
- [x] **[Bugfix/Feature]** Implement **Delete** button for automatic deletion of a mod's files.
- [x] **[Bugfix/Feature]** Limit API calls to updates services.

## 🎨 Frontend (Vite)

- [x] Add button to check for new Mod/SPT version.
- [x] Add name list to path URL with React Router.
- [x] **[UI/UX]** Develop a modern and clean layout for the main dashboard.
- [x] **[UI/UX]** Adjust color scheme.

## 📦 Infrastructure (Docker & NGINX)

- [x] Cleanup temp zip/7z files.
- [x] Finalize the `.gitignore` and `.dockerignore` rules.
- [x] **[Containerization]** Configure **NGINX** to serve the Frontend and act as a reverse proxy for the C# API Backend.
- [x] **[Deployment]** Create startup script for the Docker Compose environment.
- [x] **[Optimization]** Optimize the **Dockerfile** for faster builds.
- [ ] **[Optimization]** Cleanup code

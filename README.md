# TarkHub

TarkHub is a lightweight modlist manager and deployment tool for SPT (Single Player Tarkov).
Designed to simplify how you organize, build, and share your mod setups, TarkHub helps you keep your Tarkov experience clean, consistent, and raid-ready.

- 🧩 Manage mods with ease
- ⚙️ Create and deploy custom modlists
- 🚀 Run inside Docker for a clean, isolated setup
- 💾 Export and share mod configurations effortlessly

Whether you’re tweaking your loadout or testing new mod builds, TarkHub keeps your SPT experience tactical, tidy, and under control.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
  - [Build Locally](#build-locally)
  - [Use Prebuilt Image from ghcr.io](#use-prebuilt-image-from-ghcrio)
- [Usage](#usage)
- [Docker](#docker)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)
- [Support & Questions](#support--questions)

---

## Features

- **Modlist Management:** Create, rename, delete, export, and import modlists.
- **Mod Installation:** Add mods via URLs, download, update, and remove mods.
- **SPT/Fika Versioning:** Manage SPT and Fika server versions and update notifications.
- **Status Tracking:** Track installed mods and clear installation cache.
- **Export/Import:** Export modlists to JSON and import them back for easy sharing.
- **Runs in Docker:** Easy deployment and isolated environment with Nginx as reverse proxy.
- **C# Backend:** Fast and robust backend built with C# (.NET).
- **Frontend:** Modern React/TypeScript SPA.
- **Nginx:** Used as reverse proxy and static file server.
- **Easy persistent volumes:** For SPT server and user data.

---

## Installation

### Build Locally (Recommended for development)

1. **Clone the repository:**

   ```bash
   git clone https://github.com/mattiaginoble/tarkhub.git
   cd tarkhub
   ```

2. **Build and start with Docker Compose:**

   ```bash
   docker compose up --build
   ```

   This will build the multi-stage Docker image as described in `Dockerfile`:

   - Frontend built with Node and Vite
   - Backend built with .NET (C#)
   - Nginx serves frontend and proxies to backend

3. **Access the web UI:**
   - Open your browser at [https://localhost:6969/mod](https://localhost:6969/mod)

---

### Use Prebuilt Image from ghcr.io

You can pull the latest image from GitHub Container Registry and use it directly in your `docker-compose.yml`.

```yaml
services:
  tarkhub:
    image: ghcr.io/mattiaginoble/tarkhub:latest
    container_name: tarkhub
    ports:
      - 6969:6969
    environment:
      - FORGE_API_KEY=${FORGE_API_KEY}
      - SPT_VERSION=${SPT_VERSION}
      - FIKA_VERSION=${FIKA_VERSION}
    volumes:
      - server:/app/spt-server
      - user:/app/user
    restart: unless-stopped

volumes:
  server: null
  user: null
```

**To pull and run:**

```bash
docker compose up
```

You can also specify a version/tag published on [ghcr.io](https://github.com/users/mattiaginoble/packages/container/package/tarkhub).

---

## Usage

- Access the web interface at [https://localhost:6969/mod](https://localhost:6969/mod)
- Access the SPT server at [https://127.0.0.1:6969](https://127.0.0.1:6969)
- Create your modlist, add mods, export or import lists
- Manage SPT and Fika versions, update mods, and more!

---

## Docker

- **Multi-stage build:** See `Dockerfile` for details.

  - Stage 1: Builds the frontend (React/TypeScript)
  - Stage 2: Builds the backend (.NET/C#)
  - Stage 3: Combines everything, serves with Nginx and runs the backend

- **Nginx:** Configured via `nginx.conf`, serves the SPA and proxies API requests to backend.

- **Volumes:**

  - `/app/spt-server`: Persistent storage for SPT server files
  - `/app/user`: Persistent storage for user data and configs

- **Environment variables:**
  - `FORGE_API_KEY`: API key for Forge
  - `SPT_VERSION`, `FIKA_VERSION`: Used for mod compatibility/versioning

---

## Project Structure

```
backend/           # Backend API (C#, ASP.NET Core)
frontend/          # Frontend React app (TSX, Vite)
  └── src/         # Source code for frontend
nginx.conf         # Nginx reverse proxy configuration
docker-compose.yml # Multi-container orchestration
Dockerfile         # Multi-stage build for frontend/backend/Nginx
README.md
...
```

---

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

### How to contribute

1. Fork this repo
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a pull request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support & Questions

For help or questions, open an [issue](https://github.com/mattiaginoble/tarkhub/issues).

---

## Credits

- [SPT](https://github.com/sp-tarkov) and modding community
- [React](https://react.dev/)
- [.NET](https://dotnet.microsoft.com/)
- [Nginx](https://nginx.org/)
- [Docker](https://docker.com/)

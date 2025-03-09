# 🎬 Twitch VOD Downloader 🤖

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

This project downloads Twitch VODs (Video On Demand), converts them to audio, and generates transcripts using Whisper. It's designed to be run within a [Visual Studio Code Dev Container](https://code.visualstudio.com/docs/devcontainers/containers) for easy setup and consistent environment, but can also be run directly using Docker.

## ✨ Features

- ⬇️ Downloads Twitch VODs
- 🎵 Extracts audio from downloaded videos
- 📝 Generates transcripts using OpenAI's Whisper
- 🗄️ Stores video metadata and transcripts in an SQLite database
- 🔄 Retries failed downloads and transcript generation
- 🧹 Cleans up temporary files
- 🐳 Runs in a Dev Container for easy setup
- 🐳 Can be built and run directly using docker on host
- 🚀 Uses Deno for a modern runtime

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop)
- [Visual Studio Code (VS Code)](https://code.visualstudio.com/)
- [Remote - Containers extension for VS Code](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Setup (Using VS Code Dev Container - Recommended)

1. **Clone the Repository:**

   ```bash
   git clone <repository_url>
   cd twitch-vod-downloader
   ```

2. **Open in VS Code:**

   Open the project folder in VS Code.

3. **Reopen in Container:**

   VS Code should prompt you to "Reopen in Container". Click this button. If not, open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P) and run `Dev Containers: Reopen in Container`. This will build the Dev Container (the first time will take a bit longer) and open the project inside it. All the necessary dependencies (Deno, yt-dlp, ffmpeg, Whisper) are already installed within the container.

4. **Create a `.env` file:**

   Create a file named `.env` in the project root (next to this README.md). Add the following line, replacing `<your_channel_name>` with the Twitch channel name you want to download VODs from:

   ```
   CHANNEL_NAME=<your_channel_name>   
   #Filter criteria: latest or first
   FILTER_CRITERIA=
   # Comma separated VOD IDs to download specific videos (takes precedence over filtering)
   SPECIFIC_VODS=
   # Set to false if you want to use CPU
   USE_GPU=true
   CONCURRENT_CHUNK_PROCESS=1
   WHISPER_MODEL=large-v2
   ```
   
   For example:
   ```
   CHANNEL_NAME=twitch
   ```

5. **Run the Script:**

   Open a terminal *within the VS Code Dev Container* (Terminal > New Terminal) and run:

   ```bash
   deno run --allow-net --allow-run --allow-read --allow-write --allow-env --allow-ffi src/main.ts
   ```

   Permissions explanation:
   - `--allow-net`: Allows network access (to download videos and interact with Twitch's API)
   - `--allow-run`: Allows running subprocesses (like `yt-dlp`, `ffmpeg`, and `whisper`)
   - `--allow-read`: Allows reading files (like the `.env` file and downloaded video/audio files)
   - `--allow-write`: Allows writing files (to save downloaded videos, audio, transcripts, and the database)
   - `--allow-env`: Allows loading of environment variables
   - `--allow-ffi`: Allows Deno to use foreign function interface, which is required for sqlite

5.1 **Running Beta YouTube summary generation**

   ```bash
   deno run --allow-read --allow-write --allow-net --allow-env --allow-ffi src/chapterProcessor.ts VIDEO_ID
   ```
   this script will generate a series of chapters based off the transcriptions generated earlier using the Whisper LLM defined in your .env file.


### Setup (Using Docker Directly - Alternative)

If you don't want to use the VS Code Dev Container, you can run the script directly using Docker, provided you have Docker installed on your host machine.

1. **Clone the Repository:**
   ```bash
   git clone <repository_url>
   cd twitch-vod-downloader
   ```

2. **Create a `.env` file:**
   Create a file named `.env` in the project root (next to this README.md). Add the following line, replacing `<your_channel_name>` with the Twitch channel name you want to download VODs from:
   ```
   CHANNEL_NAME=<your_channel_name>
   ```
   For example:
   ```
   CHANNEL_NAME=twitch
   ```

3. **Build and Run the Docker Image:**
   ```bash
   docker compose up --build
   ```

   This command does the following:
   - `docker compose up`: Starts the services defined in `docker-compose.yml`
   - `--build`: Forces a rebuild of the Docker image, ensuring you have the latest code and dependencies

   To run the container in detached mode (in the background), use:
   ```bash
   docker compose up -d --build
   ```

   To stop the container:
   ```bash
   docker compose down
   ```

   To view logs of the running container:
   ```bash
   docker compose logs -f
   ```

## 📁 Project Structure

```
├── data
│   ├── audio            # Stores extracted audio files (.wav)
│   ├── db               # Stores the SQLite database file (sqlite.db)
│   ├── temp             # Stores temporary files during processing
│   ├── videos           # Stores downloaded video files (.mp4)
│   └── transcripts      # Stores generated transcripts
├── src
│   ├── db               # Database-related code
│   ├── download.ts      # Handles video downloading
│   ├── main.ts          # Main application logic
│   ├── scraper.ts       # Fetches video IDs from Twitch
│   ├── transcript.ts    # Generates transcripts from audio
│   ├── types.ts         # Type definitions
│   └── utils.ts         # Utility functions
├── .devcontainer        # Configuration of devcontainer
├── deno.json            # Deno configuration file
├── deno.lock            # Deno lock file for dependencies
├── docker-compose.yml   # Docker compose config
├── LICENSE              # MIT License
└── README.md            # This file
```

## 🗂️ Accessing Downloaded Data

This project saves data in several locations within the `data` directory:

- **Videos (`data/videos`):** Downloaded Twitch VODs are stored as `.mp4` files. Filenames follow the pattern `vod_<video_id>.mp4`.

- **Audio (`data/audio`):** Extracted audio files are stored as `.wav` files. Filenames follow the pattern `audio_<video_id>.wav`.

- **Transcripts (`data/transcripts`):** Generated transcripts are stored as `.json` files in a structured JSON format. Filenames follow the pattern `transcript_<video_id>.json`.

- **Database (`data/db/sqlite.db`):** An SQLite database with two tables:
  - `videos`: Stores metadata about downloaded videos
  - `transcripts`: Stores generated transcripts

### Accessing the Database

You can interact with the SQLite database using various tools:

- **DB Browser for SQLite:** A free, user-friendly GUI tool ([https://sqlitebrowser.org/](https://sqlitebrowser.org/))
- **`sqlite3` command-line tool:** A command-line interface for SQLite databases
- **Deno's `sqlite3` module:** Write additional Deno scripts to query the data
- **Other language libraries:** Use SQLite libraries in languages like Python

**Example (using `sqlite3` command-line tool within the Dev Container):**

1. Open a terminal within the VS Code Dev Container
2. Navigate to the `data/db` directory:
   ```bash
   cd data/db
   ```
3. Open the database:
   ```bash
   sqlite3 sqlite.db
   ```
4. Run SQL queries:
   ```sql
   -- List all videos
   SELECT * FROM videos;

   -- Get the transcript for a specific video ID
   SELECT content FROM transcripts WHERE video_id = 'your_video_id';

   -- List videos and their creation date, ordered by most recent
   SELECT * FROM videos ORDER BY created_at DESC;
   ```
   Exit with `.quit`

## ⚠️ Important Notes

- **Permissions:** The Deno script runs with extensive permissions. Be cautious and only run trusted code.
- **Twitch API:** Adhere to Twitch's API usage guidelines and rate limits.
- **Storage:** Downloading VODs and generating transcripts can consume significant disk space.
- **Whisper Model:** The script uses the base Whisper model. You can modify this in `transcript.ts` for different accuracy levels.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

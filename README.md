# 🎵 BeatBox

BeatBox is a modern, single-page web application for streaming and discovering royalty-free music from the Jamendo API. It features a sleek glassmorphic UI, robust playlist management, a conversational AI chatbot for music recommendations, and a dedicated admin panel for role-based access control.

## 🚀 Features

- **Discover**: Browse top tracks, filter by genre, and search for specific songs.
- **Playlists**: Create custom playlists, select multiple songs, and manage your library.
- **AI Chatbot**: Get personalized music recommendations powered by Gemini/Mistral/Groq/NIM LLMs.
- **Admin Panel**: Manage database user roles (Owner, Admin, User), view system statistics, and manipulate database records directly.
- **Audio Player**: Fully featured persistent audio player with playback controls and a progress bar.
- **Role-Based Access Control (RBAC)**: Enforced via Express session variables and separate MySQL connection pools based on user roles (`beatbox_owner`, `beatbox_admin`, `beatbox_user`).

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla JavaScript, Vanilla CSS (Glassmorphism design system)
- **Backend**: Node.js, Express.js
- **Database**: MySQL 8.0+
- **Integrations**: Jamendo API (Music), Multiple LLM APIs via `@google/generative-ai` and `openai` SDK.

## 📦 Prerequisites

1. **Node.js** (v18 or higher recommended)
2. **MySQL Server** (Running locally on port 3306)
3. API Keys for:
   - Google Gemini
   - Groq / Mistral / NVIDIA NIM (Optional, used as fallbacks)

## 🔧 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd BeatBox
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory based on `.env.example` (if provided), or add the following keys:
   ```env
   SESSION_SECRET=your_secret_key
   DB_PASSWORD=your_mysql_root_password
   GEMINI_API_KEY=your_gemini_key
   OPENAI_API_KEY=your_openai_key
   ```

4. **Initialize Database:**
   The backend automatically connects using the `root` MySQL user on initial boot to build the database schema from `database/schema.sql`. It will also populate initial sample data.
   *Ensure your `root` password is correct in the `.env` or passed via command line.*

5. **Start the Server:**
   ```bash
   npm start
   # Or using node directly:
   # node server.js
   ```

6. **Open in Browser:**
   Navigate to `http://localhost:3000` to access the login page.
   *Note: The first registered user (or any user with "adit" in their email/name) is automatically granted the `owner` role.*

## 📂 Project Structure

- `/public`: Static frontend assets (HTML, CSS, JS).
- `/routes`: Express backend API routers.
- `/database`: MySQL schemas, user initialization scripts, and mock data.
- `server.js`: Application entry point and middleware configuration.
- `db.js`: Database connection pool management.

## 🔐 Database Roles

BeatBox utilizes strict database-level roles for security:
- `beatbox_owner`: Full DBA privileges (`GRANT ALL`).
- `beatbox_admin`: Read/Write access across the application tables.
- `beatbox_user`: Read-only access to songs, restricted write access to their own playlists/likes.

---
*Built with ❤️ for modern music streaming.*

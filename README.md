# BeatBox: Full-Stack Music Streaming Platform

BeatBox is a robust, fully functional music streaming platform built to demonstrate advanced software engineering fundamentals. Unlike simple CRUD applications, BeatBox actually streams real, playable music by dynamically interfacing with the Jamendo API. 

The project relies on a clean, monolithic architecture focusing on data integrity, clear separations of concern, and strict security boundaries. We chose to build this without heavy front-end frameworks to highlight native browser capabilities and raw DOM manipulation, paired with a highly optimized relational database backend.

---

## 🚀 Quick Start

### Prerequisites
* **Node.js** (v18 or higher recommended)
* **MySQL** (v8.0 or higher) running locally on the default port (3306)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd BeatBox
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Database Configuration:**
   BeatBox automatically creates its own database (`beatbox`), schema, and seeds data on startup. However, it needs your local MySQL root password to do this.
   Create a file named `db.config.json` in the root directory:
   ```json
   {
       "password": "your_mysql_root_password"
   }
   ```
   *Alternatively, you can pass it via CLI argument: `node server.js --db-pass=your_password`*

4. **Environment Variables (Optional):**
   Create a `.env` file in the root directory for optional integrations:
   ```env
   # Secure session secret (auto-generated randomly if omitted)
   SESSION_SECRET=your_secure_secret
   # Google Gemini API key for the AI chatbot companion
   GEMINI_API_KEY=your_gemini_api_key
   ```

5. **Start the server:**
   ```bash
   npm start
   ```

The server will automatically bootstrap the database, fetch real royalty-free music from the Jamendo API if the catalog is empty, and start running at `http://localhost:3000`.

---

## 🎵 How It Works: The Core Mechanism

BeatBox is a living, breathing music streaming application. Here is the thorough, step-by-step procedure of how the platform actually operates.

### 1. The Jamendo API Integration & Auto-Seeding
One of the most powerful features of BeatBox is its ability to self-populate with real, royalty-free music. 
When the Node.js server starts, it checks the MySQL database catalog. If the database is empty, the backend initiates an automated, highly concurrent data ingestion pipeline connecting to the **public Jamendo API**.

It fetches thousands of real tracks, pulling down critical metadata including:
- Song titles, durations, and release dates
- Artist and Album names
- High-quality cover art URLs
- **Direct MP3 Audio Streaming URLs**

This data is meticulously normalized and inserted into our `artists`, `albums`, `genres`, and `songs` SQL tables. This means within seconds of starting the server, you have a massive, real-world music catalog ready to stream natively.

### 2. Music Playback Engine (HTML5 Audio)
BeatBox actually plays music natively right in your browser. We don't rely on heavy third-party media players or iframe embeds.
- When a user logs in and clicks the "Play" button on a track in the discovery dashboard, the frontend JavaScript intercepts the click event.
- It extracts the `audio_url` (the direct Jamendo streaming link) associated with that specific track from the DOM.
- This URL is dynamically injected into a native HTML5 `<audio>` element anchored to the UI.
- The browser handles the buffering and streaming of the audio data natively via the audio API, ensuring high performance, zero external dependencies, and minimal memory overhead.

### 3. Event-Driven Analytics & Play Counts
When a song begins playing, the platform tracks its popularity in real-time.
- The frontend silently dispatches an asynchronous `POST /api/songs/:id/listen` request to the backend API.
- The Express server validates the user's secure session and inserts a record into the `listens` table.
- At the database level, a strict **SQL Trigger** (`after_listen_insert`) intercepts this insertion and atomically increments the `play_count` integer on the parent `songs` table. 
This ensures our "Most Played" data is always perfectly accurate in real-time, pushing the calculation burden down to the database engine rather than relying on expensive application-level computation.

### 4. Playlist Architecture & Batch Operations
Users can curate their own personalized music libraries.
- Creating a playlist creates a record in the `playlists` table linked via a foreign key to the `users` table.
- Adding a song to a playlist creates a structural relationship in the `playlist_songs` junction table.
- **Batch Deletions:** If a user selects 50 songs to remove from a playlist at once, the frontend stores these selected IDs in a highly efficient Javascript `Set` object (which guarantees `O(1)` constant-time lookup). When they click delete, the IDs are serialized into a single JSON payload. The backend then maps these IDs into a dynamically sized SQL `IN (?, ?, ?)` clause, securely deleting all 50 records in a single, lightning-fast database transaction.

### 5. Intelligent AI Chatbot
BeatBox integrates directly with the **Google Gemini API** to provide an intelligent music discovery chatbot right in the application interface. 
- Users can ask the chatbot for recommendations based on mood, genre, or their existing playlists.
- The Node.js backend acts as a secure proxy. It securely attaches the API keys stored locally in your `.env` file before forwarding the user's prompt to Google. This architecture ensures your sensitive credentials are never exposed to the client-side browser or malicious actors.

---

## 🛠️ Technical Architecture & Security

### Database Layer and Data Integrity

The persistence layer was designed with a strong focus on data integrity and performance.

* **Normalized Schema and Referential Integrity:** The database adheres strictly to Third Normal Form. Many-to-many relationships are managed through junction tables. We rely heavily on foreign key constraints with cascading deletes (`ON DELETE CASCADE`). If an admin removes a song from the catalog, the database engine guarantees it is safely purged from all user playlists and histories, ensuring no orphaned records exist.
* **SQL Views for Query Optimization:** To simplify read-heavy operations, we use a materialized-style SQL View called `song_details`. This view pre-joins the songs table with artists, albums, and genres. When the application needs to render the dashboard, it simply queries this single view, shifting the complex SQL join logic to the query planner.
* **Database-Level Role Permissions:** Application roles (owner, admin, user) map directly to native MySQL database users. The standard user role is granted only `SELECT` permissions on the core catalog, with `INSERT` and `DELETE` explicitly restricted to user-specific tables. This provides a fortress of security at the lowest level, enforcing the principle of least privilege.

### Backend Engineering and Security

The Express backend serves as a secure gateway for the application logic.

* **SQL Injection Prevention:** All database interactions use the `mysql2` library with strictly parameterized queries, separating the query structure from the user input.
* **Rate Limiting:** We use `express-rate-limit` to implement endpoint-specific throttling. While there is a global limit for general traffic, sensitive routes like authentication and batch operations have stricter limits to mathematically prevent brute-force attempts.
* **HTTP Headers:** The `helmet` middleware is used to inject secure HTTP headers, mitigating common vulnerabilities like clickjacking.
* **Session Management:** User sessions are managed with `express-session`, using secure, HTTP-only, and SameSite cookies to protect against Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF). 

### Frontend Implementation

The frontend is a lightweight Single Page Application (SPA).

* **Design System:** The UI is styled using a robust system of CSS custom properties (variables). This token-based approach ensures visual consistency across the platform and makes theme switching seamless. The layout relies entirely on native CSS Grid and Flexbox for a responsive, modern interface.
* **Client-Side Routing:** We achieve an SPA feel by intelligently toggling the visibility of major DOM containers (`view-dashboard`, `view-playlists`), ensuring instant navigation without page reloads.

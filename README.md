# BeatBox

BeatBox is a robust, full-stack music streaming platform built to demonstrate solid software engineering fundamentals. The project relies on a clean, monolithic architecture focusing on data integrity, clear separations of concern, and strict security boundaries. 

Instead of relying on heavy frontend frameworks, BeatBox utilizes native browser capabilities and raw DOM manipulation, paired with a highly optimized relational database backend.

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
   # Google Gemini API key for the AI companion feature
   GEMINI_API_KEY=your_gemini_api_key
   ```

5. **Start the server:**
   ```bash
   npm start
   ```

The server will automatically bootstrap the database, fetch real royalty-free music from the Jamendo API if the catalog is empty, and start running at `http://localhost:3000`.

## 🛠️ Technical Architecture

The system is built on a classic, well-proven technology stack:
* **Backend:** Node.js and Express
* **Frontend:** Native HTML5, CSS3, and JavaScript (Single Page Application architecture)
* **Database:** MySQL with a highly normalized schema

### Database Layer and Data Integrity

The persistence layer was designed with a strong focus on data integrity and performance.

* **Normalized Schema and Referential Integrity:** The database adheres strictly to Third Normal Form. Entities like users, songs, artists, albums, genres, and playlists are separated. Many-to-many relationships are managed through junction tables. We rely heavily on foreign key constraints with cascading deletes. If a song is removed from the catalog, the database engine guarantees it is safely removed from all user playlists and histories, ensuring no orphaned records exist.
* **SQL Views for Query Optimization:** To simplify read-heavy operations, we use a materialized-style SQL View called `song_details`. This view pre-joins the songs table with artists, albums, and genres. When the application needs to render a list of tracks, it simply queries this single view, shifting the complex join logic and optimization burden to the MySQL query planner.
* **Event-Driven Triggers:** Tracking song popularity requires updating play counts whenever a user listens to a track. Instead of relying on the application to run sequential update queries, we use a database-level trigger (`after_listen_insert`). When a listen record is inserted, the trigger automatically and atomically increments the play count on the song record.
* **Database-Level Role Permissions:** Application roles (owner, admin, user) map directly to native MySQL database users. The standard user role is granted only `SELECT` permissions on the core catalog, with `INSERT` and `DELETE` explicitly restricted to user-specific tables like playlists and likes.

### Backend Engineering and Security

The Express backend serves as a secure gateway for the application logic and data fetching.

* **SQL Injection Prevention:** All database interactions use the `mysql2` library with strictly parameterized queries, separating the query structure from the user input.
* **Rate Limiting:** We use `express-rate-limit` to implement endpoint-specific throttling. While there is a global limit for general traffic, sensitive routes like authentication and batch operations have stricter limits to prevent brute-force attempts.
* **HTTP Headers:** The `helmet` middleware is used to inject secure HTTP headers, mitigating common vulnerabilities like clickjacking.
* **Session Management:** User sessions are managed with `express-session`, using secure, HTTP-only, and SameSite cookies. The cryptographic secrets are generated securely on startup.
* **Data Ingestion:** When the server initializes, it runs a self-healing bootstrap sequence that verifies the schema and applies triggers. If it detects an empty catalog, it automatically connects to the Jamendo API to seed the database with thousands of real tracks.

### Frontend Implementation

The frontend is a lightweight Single Page Application built entirely with native web technologies.

* **State Management and Performance:** We manage client-side state using modern Javascript data structures. For example, when selecting multiple songs for batch removal, the application stores the selected IDs in a native `Set` rather than an array. This ensures that membership checks during re-renders remain a constant-time operation, avoiding performance bottlenecks.
* **Batch Operations:** Network efficiency is a priority. When executing a batch removal, the frontend serializes the `Set` and sends a single payload to the backend. The Express API then maps the input to a dynamically sized SQL `IN (...)` clause, allowing the database to delete multiple records in a single round-trip.
* **Design System:** The UI is styled using a robust system of CSS custom properties. This token-based approach ensures visual consistency across the platform and makes theme switching seamless. The layout relies on native CSS Grid and Flexbox for a responsive, modern interface.

### AI Integration

The platform includes a dedicated `/api/ai` endpoint integrated with the Google Gemini API. This provides users with an intelligent assistant capable of analyzing playlists and suggesting recommendations. The backend proxies these requests, ensuring API keys and sensitive credentials remain secure and are never exposed to the client.

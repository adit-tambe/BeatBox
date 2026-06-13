-- BeatBox Database Schema
-- Creates all tables as per ER diagram

CREATE DATABASE IF NOT EXISTS beatbox;
USE beatbox;

-- GENRE table
CREATE TABLE IF NOT EXISTS genres (
    genre_id INT PRIMARY KEY AUTO_INCREMENT,
    genre_name VARCHAR(50) NOT NULL UNIQUE
);

-- ARTIST table
CREATE TABLE IF NOT EXISTS artists (
    artist_id INT PRIMARY KEY AUTO_INCREMENT,
    artist_name VARCHAR(100) NOT NULL,
    country VARCHAR(50),
    debut_year INT
);

-- ALBUM table
CREATE TABLE IF NOT EXISTS albums (
    album_id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(150) NOT NULL,
    artist_id INT,
    release_year INT,
    FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE SET NULL
);

-- SONG table
CREATE TABLE IF NOT EXISTS songs (
    song_id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(150) NOT NULL,
    duration INT NOT NULL DEFAULT 0, -- in seconds
    release_date DATE,
    album_id INT,
    genre_id INT,
    artist_id INT,
    play_count INT DEFAULT 0,
    image_url VARCHAR(500) DEFAULT NULL,
    jamendo_id INT DEFAULT NULL UNIQUE,
    FOREIGN KEY (album_id) REFERENCES albums(album_id) ON DELETE SET NULL,
    FOREIGN KEY (genre_id) REFERENCES genres(genre_id) ON DELETE SET NULL,
    FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE SET NULL
);

-- USER table
CREATE TABLE IF NOT EXISTS users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    subscription_type ENUM('free', 'premium') DEFAULT 'free',
    join_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    role ENUM('owner', 'admin', 'user') DEFAULT 'user'
);

-- PLAYLIST table
CREATE TABLE IF NOT EXISTS playlists (
    playlist_id INT PRIMARY KEY AUTO_INCREMENT,
    playlist_name VARCHAR(100) NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- PLAYLIST_SONGS junction table (Many-to-Many)
CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id INT NOT NULL,
    song_id INT NOT NULL,
    added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, song_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(playlist_id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(song_id) ON DELETE CASCADE
);

-- LIKES table (Many-to-Many: User <-> Song)
CREATE TABLE IF NOT EXISTS likes (
    user_id INT NOT NULL,
    song_id INT NOT NULL,
    liked_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, song_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(song_id) ON DELETE CASCADE
);

-- LISTENS table (User listens to Song)
CREATE TABLE IF NOT EXISTS listens (
    listen_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    song_id INT NOT NULL,
    listen_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(song_id) ON DELETE CASCADE
);

-- PLAY_HISTORY table
CREATE TABLE IF NOT EXISTS play_history (
    play_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    song_id INT NOT NULL,
    play_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(song_id) ON DELETE CASCADE
);

-- PAYMENT table
CREATE TABLE IF NOT EXISTS payments (
    payment_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    payment_mode VARCHAR(50) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_songs_artist ON songs(artist_id);
CREATE INDEX idx_songs_album ON songs(album_id);
CREATE INDEX idx_songs_genre ON songs(genre_id);
CREATE INDEX idx_playlists_user ON playlists(user_id);
CREATE INDEX idx_listens_user ON listens(user_id);
CREATE INDEX idx_listens_song ON listens(song_id);

-- VIEWS
CREATE OR REPLACE VIEW song_details AS
SELECT 
    s.song_id, s.title AS song_title, s.duration, s.release_date, s.play_count,
    s.image_url, s.jamendo_id,
    a.artist_name, a.artist_id,
    al.title AS album_title, al.album_id,
    g.genre_name, g.genre_id
FROM songs s
LEFT JOIN artists a ON s.artist_id = a.artist_id
LEFT JOIN albums al ON s.album_id = al.album_id
LEFT JOIN genres g ON s.genre_id = g.genre_id;

-- STORED PROCEDURE: Get top songs by play count
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS GetTopSongs(IN limit_count INT)
BEGIN
    SELECT s.song_id, s.title, s.play_count, a.artist_name
    FROM songs s
    LEFT JOIN artists a ON s.artist_id = a.artist_id
    ORDER BY s.play_count DESC
    LIMIT limit_count;
END //
DELIMITER ;

-- TRIGGER: Update play_count when a listen is recorded
DELIMITER //
CREATE TRIGGER after_listen_insert
AFTER INSERT ON listens
FOR EACH ROW
BEGIN
    UPDATE songs SET play_count = play_count + 1 WHERE song_id = NEW.song_id;
END //
DELIMITER ;

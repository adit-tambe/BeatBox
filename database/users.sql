-- Database Users Setup for BeatBox
-- Run this as MySQL root user

-- 1. OWNER - Full privileges (DBA)
CREATE USER IF NOT EXISTS 'beatbox_owner'@'localhost' IDENTIFIED BY 'owner123';
GRANT ALL PRIVILEGES ON beatbox.* TO 'beatbox_owner'@'localhost' WITH GRANT OPTION;

-- 2. ADMIN - Read/Write privileges
CREATE USER IF NOT EXISTS 'beatbox_admin'@'localhost' IDENTIFIED BY 'admin123';
GRANT SELECT, INSERT, UPDATE, DELETE ON beatbox.* TO 'beatbox_admin'@'localhost';

-- 3. USER - Standard app privileges
CREATE USER IF NOT EXISTS 'beatbox_user'@'localhost' IDENTIFIED BY 'user123';
GRANT SELECT ON beatbox.* TO 'beatbox_user'@'localhost';
GRANT INSERT, UPDATE, DELETE ON beatbox.likes TO 'beatbox_user'@'localhost';
GRANT INSERT, UPDATE, DELETE ON beatbox.playlists TO 'beatbox_user'@'localhost';
GRANT INSERT, UPDATE, DELETE ON beatbox.playlist_songs TO 'beatbox_user'@'localhost';
GRANT INSERT, UPDATE, DELETE ON beatbox.listens TO 'beatbox_user'@'localhost';
GRANT INSERT, UPDATE, DELETE ON beatbox.play_history TO 'beatbox_user'@'localhost';
GRANT UPDATE ON beatbox.users TO 'beatbox_user'@'localhost';

FLUSH PRIVILEGES;

SHOW GRANTS FOR 'beatbox_owner'@'localhost';
SHOW GRANTS FOR 'beatbox_admin'@'localhost';
SHOW GRANTS FOR 'beatbox_user'@'localhost';

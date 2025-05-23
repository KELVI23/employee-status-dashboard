const sqlite3 = require('sqlite3').verbose();

// Initialize the database connection
const db = new sqlite3.Database('./database.db');
const bcrypt = require('bcrypt');

const { DateTime } = require('luxon');

// Function to get the current timestamp in Vancouver time (PST/PDT)
function getPSTTimestamp() {
  const nowInVancouver = DateTime.now().setZone('America/Vancouver');
  return nowInVancouver.toFormat('yyyy-MM-dd HH:mm:ss');
}


db.serialize(() => {
  // Create users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      phone TEXT,
      password TEXT,
      role TEXT CHECK( role IN ('admin', 'employee') ) DEFAULT 'employee',
      status TEXT,
      location TEXT, 
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error("Error creating users table:", err.message);
    } else {
      console.log("Users table created or already exists");
    }
  });

  // Create statuses table
  db.run(`
    CREATE TABLE IF NOT EXISTS statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      status TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error("Error creating statuses table:", err.message);
    } else {
      console.log("Statuses table created or already exists");
    }
  });

   // Create schedules table
   db.run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL,
      time TEXT NOT NULL
    )
  `, (err) => {
    if (err) console.error("Error creating schedules table:", err.message);
    else console.log("Schedules table created or already exists");
  });

  // Add default admin user if it doesn't exist
  db.get(`SELECT * FROM users WHERE name = 'admin'`, async (err, row) => {
    if (err) {
      console.error("Error checking for admin user:", err.message);
      return;
    }

    // If no admin user exists, create one
    if (!row) {
      const hashedPassword = await bcrypt.hash('gs', 10);
      db.run(
        `INSERT INTO users (name, phone, password, role, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
        ['admin', null, hashedPassword, 'admin', 'In-Office', getPSTTimestamp()],
        (err) => {
          if (err) {
            console.error("Error inserting admin user:", err.message);
          } else {
            console.log("Admin user created with PST timestamp");
          }
        }
      );
    } else {
      console.log("Admin user already exists");
    }
  });
});

module.exports = db;

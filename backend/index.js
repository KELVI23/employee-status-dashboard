/**
 * Employee Status Dashboard
 * (c) 2025 Kelvin Musodza
 * Licensed under CC BY-NC 4.0:
 * https://creativecommons.org/licenses/by-nc/4.0/
 * You may not use this software for commercial purposes.
 */


const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const schedule = require('node-schedule');
const db = require('./db');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Secret key for JWT
const JWT_SECRET = 'XXXXXXXXXXXXXXXXXXXXXX-your-generated-key-XXXXXXXXXXxxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

const { DateTime } = require('luxon');

// Function to get the current timestamp in Vancouver time (PST/PDT)
function getPSTTimestamp() {
  const nowInVancouver = DateTime.now().setZone('America/Vancouver');
  return nowInVancouver.toFormat('yyyy-MM-dd HH:mm:ss');
}


// Register a new user (Admin only)
app.post('/register', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const { name, phone, password, role, location } = req.body;
  
  // Set default status as "In-Office"
  const status = 'In-Office';  // Default status for new users
  
  try {
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    db.run(
      `INSERT INTO users (name, phone, password, role, status, location, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, hashedPassword, role, status, location,  getPSTTimestamp()],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User registered successfully!' });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Error registering user' });
  }
});



// Login
app.post('/login', (req, res) => {
  const { name, password } = req.body;
  db.get(`SELECT * FROM users WHERE name = ?`, [name], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'User not found' });

    // If no password is required (for users with null passwords)
    if (!user.password) {
      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
      return res.json({ token, role: user.role });
    }

    // Check the password if it's set
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Incorrect password' });

    // Generate JWT token
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
    res.json({ token, role: user.role });
  });
});

// Middleware to authenticate user
function authenticate(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  try {
    const user = jwt.verify(token.split(' ')[1], JWT_SECRET);
    req.user = user;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
}


// Get users (Admin: all users, Employee: users filtered by location)
app.get('/users', authenticate, (req, res) => {
  const location = req.query.location ? decodeURIComponent(req.query.location) : null;

  // Admins can view all users, employees can only view users filtered by location
  let query = 'SELECT id, name, phone, role, status, location, updated_at FROM users';
  let params = [];

  if (req.user.role === 'employee') {
    // Employees can only view users filtered by location
    query += ' WHERE role != "admin"';
    if (location) {
      query += ' AND location = ?';
      params.push(location);
    }
  } else if (req.user.role === 'admin') {
    // Admins can view all users
    if (location) {
      query += ' WHERE location = ?';
      params.push(location);
    }
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});



// Update user status (Authenticated users)
app.post('/status', authenticate, (req, res) => {
  const { status } = req.body;
  const userId = req.user.id; // Retrieve the user ID from the token

  db.run(
    `UPDATE users SET status = ?, updated_at = ? WHERE id = ?`,
    [status,  getPSTTimestamp(), userId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Status updated successfully!' });
    }
  );
});

// Update user details (Admin only)
app.put('/users/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

  const { id } = req.params;
  const { name, phone, role, status, location } = req.body;

  // Check if the user exists before updating
  db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, user) => {
    if (err) return res.status(500).json({ error: 'Error fetching user' });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update the user with new values
    db.run(
      `UPDATE users SET name = ?, phone = ?, role = ?, status = ?, location = ? WHERE id = ?`,
      [name, phone || user.phone, role, status || user.status, location, id],
      function (err) {
        if (err) {
          console.error('Error updating user:', err.message);
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'User updated successfully!' });
      }
    );
  });
});

// Fetch all statuses for employees (Authenticated users)
app.get('/status', authenticate, (req, res) => {
  db.all('SELECT name, status, phone, location, updated_at, id FROM users WHERE role = "employee"', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);  // Return only employees with their status
  });
});


// Fetch all distinct locations (Authenticated users)
app.get('/locations', authenticate, (req, res) => {
  db.all('SELECT DISTINCT location FROM users WHERE location IS NOT NULL', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Filter duplicates by making the comparison case-insensitive in the background
    const uniqueLocations = [];
    const lowerCaseLocations = new Set();

    rows.forEach(row => {
      const lowerCaseLocation = row.location.toLowerCase();
      if (!lowerCaseLocations.has(lowerCaseLocation)) {
        lowerCaseLocations.add(lowerCaseLocation);
        uniqueLocations.push(row.location); // Keep the original casing
      }
    });

    res.json(uniqueLocations); // Return the locations with original casing
  });
});

// Load distinct locations for dropdown
async function loadLocations() {
  const response = await fetch('http://localhost:3003/locations', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const locations = await response.json();

  const locationSelect = document.getElementById('locationSelect');
  locationSelect.innerHTML = '<option value="">Select Location</option>'; // Reset dropdown before adding options

  // Populate distinct locations into the dropdown
  locations.forEach(location => {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location; // Use the original casing
    locationSelect.appendChild(option);
  });
}


// Delete user (Admin only)
app.delete('/users/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

  const { id } = req.params;

  db.run(`DELETE FROM users WHERE id = ?`, [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete user' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully!' });
  });
});


// Fetch all schedules
app.get('/schedules', (req, res) => {
  db.all('SELECT * FROM schedules', [], (err, rows) => {
    if (err) {
      console.error('Error fetching schedules:', err.message);
      return res.status(500).send({ error: 'Failed to load schedules' });
    }
    res.send(rows);
  });
});

// Add a new schedule
app.post('/schedules', (req, res) => {
  const { location, time } = req.body;

  db.run('INSERT INTO schedules (location, time) VALUES (?, ?)', [location, time], (err) => {
    if (err) {
      console.error('Error adding schedule:', err.message);
      return res.status(500).send({ error: 'Failed to add schedule' });
    }

    // Re-setup schedules after adding a new one
    setupSchedules();
    res.send({ message: 'Schedule added successfully' });
  });
});

// Delete a schedule
app.delete('/schedules/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM schedules WHERE id = ?', [id], (err) => {
    if (err) {
      console.error('Error deleting schedule:', err.message);
      return res.status(500).send({ error: 'Failed to delete schedule' });
    }

    // Re-setup schedules after deleting
    setupSchedules();
    res.send({ message: 'Schedule deleted successfully' });
  });
});




const PORT = 3003;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


// Load schedules from the database and set jobs dynamically
function setupSchedules() {
  db.all('SELECT * FROM schedules', (err, schedules) => {
    if (err) {
      console.error('Error fetching schedules:', err.message);
      return;
    }

    schedules.forEach(({ location, time }) => {
      const [hours, minutes] = time.split(':');
      const cronTime = `${minutes} ${hours} * * *`; // Convert time to cron format

      schedule.scheduleJob(cronTime, () => {
        setOutOfOffice(location);
      });

      console.log(`Scheduled "Out of Office" for ${location} at ${time}`);
    });
  });
}

// Function to set users to "Out of Office"
function setOutOfOffice(location) {
  db.all(
    'SELECT * FROM users WHERE location = ? AND (status IS NULL OR status != "custom")',
    [location],
    (err, users) => {
      if (err) {
        console.error(`Error fetching users for location ${location}:`, err.message);
        return;
      }

      users.forEach((user) => {
        db.run(
          'UPDATE users SET status = ? WHERE id = ?',
          ['Out of Office', user.id],
          (err) => {
            if (err) console.error(`Error updating user ${user.id} to "Out of Office":`, err.message);
          }
        );
      });

      console.log(`All users in ${location} set to "Out of Office"`);
    }
  );
}

// Call setupSchedules on backend start
setupSchedules();

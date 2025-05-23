/**
 * Employee Status Dashboard
 * (c) 2025 Kelvin Musodza
 * Licensed under CC BY-NC 4.0:
 * https://creativecommons.org/licenses/by-nc/4.0/
 * You may not use this software for commercial purposes.
 */


const { app, BrowserWindow, Menu, Tray, ipcMain } = require('electron');
const path = require('path');
const log = require('electron-log');
const axios = require('axios');
const fs = require('fs');
const userDataPath = path.join(app.getPath('userData'), 'userSession.json');
const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

//remove in production
// const { spawn } = require('child_process'); 
// const process = require('process'); // Required for the PATH


// Set logging for autoUpdater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// const server = 'https://your-server.com';
// const feed = `${server}/update/${process.platform}/${app.getVersion()}`;
// autoUpdater.setFeedURL({ url: feed });

let tray = null;
let mainWindow = null;
let loginWindow = null;
let userToken = null; // store the user's token
//let backendProcess; // Reference to the backend process //remove in production

autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new version of the app is available. Downloading now...'
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version of the app has been downloaded. Restart now to install the update.',
    buttons: ['Restart', 'Later']
  }).then(result => {
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
}); 


function saveUserData(userData) {
  fs.writeFileSync(userDataPath, JSON.stringify(userData));
}

function clearUserData() {
  if (fs.existsSync(userDataPath)) {
    fs.unlinkSync(userDataPath); // Remove the session file
  }
}

app.disableHardwareAcceleration();

//remove in production
// Function to start the backend server
/*
function startBackend() {
  const nodePath = process.execPath; // Path to the Node.js runtime bundled with Electron
  const backendPath = path.join(__dirname, 'backend', 'index.js');

  backendProcess = spawn(nodePath, [backendPath], {
    cwd: path.join(__dirname, 'backend'),
    shell: true
  });

  backendProcess.stdout.on('data', (data) => {
    log.info(`Backend: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    log.error(`Backend Error: ${data}`);
  });

  backendProcess.on('close', (code) => {
    log.info(`Backend exited with code ${code}`);
  });
  
  backendProcess.on('error', (err) => {
    log.error(`Failed to start backend process: ${err.message}`);
  });
}

// Function to stop the backend server when the app exits
function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// Event to handle app exit
app.on('before-quit', () => {
  stopBackend();
});
*/

app.on('ready', () => {
  autoUpdater.checkForUpdatesAndNotify(); // Check for updates on app launch

  //remove in production
 // startBackend(); // Start backend when app starts  
  
  // Enable auto-launch on system startup
  app.setLoginItemSettings({
    openAtLogin: true,
  });

  // Check if there is saved user data
  let lastUserSession = null;
  if (fs.existsSync(userDataPath)) {
    lastUserSession = JSON.parse(fs.readFileSync(userDataPath, 'utf-8'));
  }

  if (lastUserSession && lastUserSession.token) {
    // If user session is found, auto-login and open the dashboard
    userToken = lastUserSession.token;
    openDashboard(lastUserSession);
    createTray(lastUserSession);
    createAppMenu(lastUserSession.role);

   } else {
        // Create login window on application launch
        loginWindow = new BrowserWindow({
          width: 350,
          height: 300,
          icon: path.join(__dirname, 'favicon.ico'), // Set the application icon
          webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          enableRemoteModule: false,
        }
      });
    
      loginWindow.loadFile('login.html'); // Open login page
   }


  // Listen for successful login from the login window
  ipcMain.on('login-success', (event, userData) => {
    console.log('Received login-success event in main process');
    userToken = userData.token; // Store the user's token
    saveUserData(userData); // Save user session data to persist login
    loginWindow.close();
    openDashboard(userData); // Redirect based on role
    createTray(userData);    // Create the system tray
    createAppMenu(userData.role); // Create the application menu after login

    // If the logged-in user is an employee, load statuses immediately
    if (userData.role === 'employee') {
      mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('load-statuses-immediately');
      });
    }
  });
});

// Create custom menu with "Actions" and "Options"
function createAppMenu(role) {
  if (!userToken) {
    console.error('User token is missing. Cannot create menu.');
    return;
  }

  axios.get('http://localhost:3003/locations', {
    headers: { 'Authorization': `Bearer ${userToken}` }
  })
  .then(response => {
    const locations = response.data;

    // Build location submenu dynamically
    const locationSubmenu = locations.map(location => ({
      label: location,
      click: () => {
        mainWindow.webContents.send('view-by-location', location); // Send the location to renderer
        filterUsersByLocation(location, role); // Filter users by the selected location
      }
    }));

    const menu = Menu.buildFromTemplate([
      {
        label: 'Actions',
        submenu: [
          { label: 'Logout', click: () => {
            clearUserData(); // Clear session data
            app.relaunch();
            app.exit(0);
          }
        }
      ]
      },
      {
        label: 'View',
        submenu: [
          { 
            label: 'All Users', 
            click: () => {
              mainWindow.webContents.send('view-all-users', role);  // Send message to renderer
              loadAllUsers(role);  // Call the existing function to load users
            } 
          },  // Option to load all users
          { type: 'separator' },
          ...locationSubmenu // Dynamically add the locations
          ]
      },
      {
        label: 'Options',
        submenu: [
          { role: 'togglefullscreen' },
          { role: 'minimize' }
        ]
      }
    ]);
    Menu.setApplicationMenu(menu);
  })
  .catch(error => {
    console.error('Error fetching locations:', error);
  });
}

function filterUsersByLocation(location, role) {
  // Fetch users from the backend by location and display them in the user list
  axios.get(`http://localhost:3003/users?location=${encodeURIComponent(location)}`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  })
  .then(response => {
    const users = response.data;
    updateUserListBasedOnRole(users, role); // Call a function to update the user list in the UI
  })
  .catch(error => {
    console.error('Error fetching users by location:', error);
  });
}

// Function to load all users (for "All Users" option)
function loadAllUsers(role) {
  axios.get('http://localhost:3003/users', {
    headers: { 'Authorization': `Bearer ${userToken}` }
  })
  .then(response => {
    const users = response.data;
    updateUserListBasedOnRole(users, role); // Pass role to updateUserList
  })
  .catch(error => {
    console.error('Error fetching all users:', error);
  });
}

//Function to update the user list in the main window
function updateUserList(users, role) {
  const usersData = JSON.stringify(users); // Serialize user data to pass to the renderer

  mainWindow.webContents.executeJavaScript(`
    (function() {
      const users = ${usersData}; // Parse the users array
      const userTableBody = document.querySelector('#userTable tbody');
      if (userTableBody) {
        userTableBody.innerHTML = ''; // Clear the table

        users.forEach(user => {
          const row = document.createElement('tr');
          row.innerHTML = \`
            <td>\${user.name}</td>
            <td>\${user.phone || ''}</td>
            <td>\${user.role}</td>
            <td>\${user.status || 'In-Office'}</td>
            <td>\${user.location || ''}</td>
            <button onclick="editUser(\${user.id}, '\${user.name}', '\${user.phone || ''}', '\${user.role}', '\${user.status || 'In-Office'}', '\${user.location || ''}')">Edit</button>
            <button class="delete-button" onclick="deleteUser(\${user.id})">Delete</button>
            \`;
          
          userTableBody.appendChild(row);
        });
      }
    })()
  `).catch(error => console.error('Error updating user list:', error));
}

function updateEmployeeList(users) {
  const usersData = JSON.stringify(users); // Serialize user data to pass to the renderer

  mainWindow.webContents.executeJavaScript(`
    (function() {
      const users = ${usersData}; // Parse the users array
      const userTableBody = document.querySelector('#statusTable tbody');
      if (userTableBody) {
        userTableBody.innerHTML = ''; // Clear the table

        users.forEach(user => {
          const row = document.createElement('tr');
          row.innerHTML = \`
            <td>\${user.name}</td>
            <td style="background-color: \${user.status === 'In-Office' ? 'green' : 'red'}; color: white;">\${user.status}</td>
            <td><a href="tel:\${user.phone}">\${user.phone || ''}</a></td>
            <td>\${user.location || 'N/A'}</td>
            <td>\${new Date(user.updated_at).toLocaleString()}</td>
          \`;
          userTableBody.appendChild(row);
        });
      }
    })()
  `).catch(error => console.error('Error updating employee list:', error));
}

function updateUserListBasedOnRole(users, role) {
  if (role === 'admin') {
    updateUserList(users, role);
  } else {
    updateEmployeeList(users); // Call the employee-specific function for loading statuses
  }
}


// Function to open the appropriate dashboard based on role
function openDashboard(userData) {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'favicon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  //mainWindow.webContents.openDevTools(); // Open DevTools in the main window
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (userData.role === 'admin') {
    mainWindow.loadFile('admin.html');
  } else {
    mainWindow.loadFile('employee.html');
  }
  // Send 'load-statuses-immediately' when dashboard loads
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('load-statuses-immediately');
  });
}

// Create tray after login
function createTray(userData) {
  tray = new Tray(path.join(__dirname, 'favicon.ico')); // Use the app icon as tray icon
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'In-Office',
      type: 'radio',
      click: () => updateStatus('In-Office', userData)
    },
    {
      label: 'Working from Home',
      type: 'radio',
      click: () => updateStatus('Working from Home', userData)
    },
    {
      label: 'Out of Office',
      type: 'radio',
      click: () => updateStatus('Out of Office', userData)
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Status Update');
  tray.setContextMenu(contextMenu);
  
  tray.displayBalloon({
    title: 'Status update',
    content: 'Please update your status!',
  });
  
  // Handle balloon click to show the status update window
  tray.on('balloon-click', () => {
     // Open the modal to update status
  });
}

// Function to update the status with Axios API call
function updateStatus(status, userData) {
  axios.post('http://localhost:3003/status', {
    status,
    userId: userData.id
  }, {
    headers: {
      'Authorization': `Bearer ${userToken}`, // Include the authorization token
      'Content-Type': 'application/json'
    }
  })
  .then(() => console.log(`Status updated to: ${status}`))
  .catch((error) => console.error('Error updating status:', error));
}

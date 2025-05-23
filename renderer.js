// renderer.js
const axios = require('axios');

function loadStatuses() {
  axios.get('http://localhost:3003/status')
    .then(response => {
      const tableBody = document.querySelector('#statusTable tbody');
      tableBody.innerHTML = ''; // Clear previous data

      response.data.forEach(user => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
          <td>${user.name}</td>
          <td style="background-color: ${user.status === 'In-Office' ? 'green' : 'red'}; color: white;">
            ${user.status}
          </td>
          <td>${user.location}</td>
          <td><a href="tel:${user.phone}">${user.phone}</a></td>
          <td>${new Date(user.updated_at).toLocaleString()}</td>
        `;
        
        tableBody.appendChild(row);
      });
    })
    .catch(error => console.error('Error fetching statuses:', error));
}

// Load statuses when the app starts
loadStatuses();

// Refresh the data every 0.1 seconds
setInterval(loadStatuses, 100); 

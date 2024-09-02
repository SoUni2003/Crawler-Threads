const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const port = 3000;

app.use(cors());

app.use('/images', express.static(path.join(__dirname, 'images')));

const readJSONFile = (filename) => {
  const filePath = path.join(__dirname, filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return [];
};

app.get('/api/images', (req, res) => {
  const imagesDir = path.join(__dirname, 'images');
  fs.readdir(imagesDir, (err, files) => {
    if (err) {
      return res.status(500).send('error images.');
    }
    const imageFiles = files.map(file => `/images/${file}`);
    res.json(imageFiles);
  });
});

app.get('/api/users', (req, res) => {
  try {
    const users = readJSONFile('all_user_search.json');
    res.json(users);
  } catch (error) {
    res.status(500).send('Error user.');
  }
});

app.get('/api/posts', (req, res) => {
  try {
    const posts = readJSONFile('all_post_user_search.json');
    res.json(posts);
  } catch (error) {
    res.status(500).send('Error post.');
  }
});


const renderHtml = () => `
  <html>
      <head>
          <title>API Data Viewer</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  margin: 0;
                  padding: 0;
                  background-color: #f4f4f4;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  text-align: center;
              }
              .container {
                  background-color: #ffffff;
                  padding: 20px;
                  border-radius: 8px;
                  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                  width: 80%;
                  max-width: 600px;
              }
              h1 {
                  color: #333;
                  margin-bottom: 20px;
              }
              ul {
                  list-style: none;
                  padding: 0;
              }
              li {
                  margin: 10px 0;
              }
              a {
                  text-decoration: none;
                  color: #007BFF;
                  font-size: 1.2em;
              }
              a:hover {
                  text-decoration: underline;
              }
              .image-gallery img {
                  max-width: 100%;
                  height: auto;
                  margin: 10px 0;
                  border-radius: 50%; /* Bo tròn hình ảnh */
              }
              .container img {
                  border-radius: 50%; /* Bo tròn hình ảnh */
                  display: block;
                  margin: 0 auto 20px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <img width="100" height="100" src="https://i.pinimg.com/236x/5c/47/fe/5c47fe3453feb793887a2c1285f7de30.jpg" alt="api bee">
              <h1>Welcome to API Data Viewer</h1>
              <ul>
                  <li><a href="/api/users" target="_blank">View Users Data</a></li>
                  <li><a href="/api/posts" target="_blank">View Posts Data</a></li>
                  <li><a href="/api/images" target="_blank">View Images</a></li>
              </ul>
              <div class="image-gallery" id="imageGallery"></div>
          </div>
      </body>
  </html>
`;


app.get(['/', '/api'], (req, res) => {
  res.send(renderHtml());
});

// Khởi động server
app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});

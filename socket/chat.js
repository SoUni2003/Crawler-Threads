const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://localhost:3071", 
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

const cookieFilePath = path.join(__dirname, 'instagram_cookies.json');
const chatUrlsFile = path.join(__dirname, 'chat_urls.json');

const MAX_DRIVERS = 5;
let driverPool = [];
let activeChats = {};
const userSockets = {};


io.on('connection', (socket) => {
  console.log('New client connected');
  io.emit('allconect', {message: 'succees connetc'})
  let currentChatId = null;

  socket.on('registerUser', (userId) => {
    userSockets[userId] = socket.id;
    console.log(`Registered userId: ${userId} with socket ID: ${socket.id}`)
  })

  socket.on('startChat', async ({ userId }) => {
    console.log(`Client requested to start chat with userId: ${userId}`);
    try {
      if (currentChatId && currentChatId !== userId) {
        console.log(`Releasing previous chat for userId: ${currentChatId}`);
        releaseChat(currentChatId);
      }
      currentChatId = userId;
      console.log(`Getting chat URL for userId: ${userId}`);  
      const chatUrl = await getChatUrlForUser(userId);
      console.log(`Chat URL obtained: ${chatUrl}`);
      console.log(`Initializing driver for userId: ${userId}`);
      const driver = await getOrCreateDriverForChat(userId, chatUrl, socket);
      console.log(`Driver initialized for userId: ${userId}`);
      console.log(`Emitting 'chatReady' event to client for userId: ${userId}`);
      socket.emit('chatReady', { chatUrl });
    } catch (error) {
      console.error(`Error in startChat for userId ${userId}:`, error.message);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('sendMessage', async ({ userId, message }) => {
    console.log(`Received message from client for userId ${userId}: ${message}`);
    try {
      // if (userId !== currentChatId) {
      //   console.error(`Invalid chat session. Expected ${currentChatId}, got ${userId}`);
      //   throw new Error('Invalid chat session');
      // }
      console.log(`Sending message for userId ${userId}`);
      const result = await sendMessageForUser(userId, message, socket);
      console.log(`Message sent successfully for userId ${userId}`);
      socket.emit('messageSent', result);
    } catch (error) {
      console.error(`Error in sendMessage for userId ${userId}:`, error.message);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    if (currentChatId) {
      console.log(`Client disconnected. Releasing chat for userId: ${currentChatId}`);
      releaseChat(currentChatId);
      currentChatId = null;
    } else {
      console.log('Client disconnected. No active chat to release.');
    }
  });
});

async function getOrCreateDriverForChat(userId, chatUrl, socket) {
  if (!activeChats[userId]) {
    const driver = await getDriverFromPool();
    await initializeChatSession(driver, chatUrl);
    activeChats[userId] = { driver, lastActivity: Date.now() };
    listenForNewMessages(driver, userId, socket);
  } else {
    const { driver, timeoutId } = activeChats[userId];
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeChats[userId].timeoutId = null;
    }
    activeChats[userId].lastActivity = Date.now();
  }
  return activeChats[userId].driver;
}

async function initializeChatSession(driver, chatUrl) {
  await driver.get(chatUrl);
  await sleep(1000);

  console.log("Kiểm tra và đóng các popup hoặc overlay...");
  const overlays = await driver.findElements(By.css('.overlay, .popup, [role="dialog"]'));
  for (let overlay of overlays) {
    if (await overlay.isDisplayed()) {
      console.log("Đang đóng overlay hoặc popup...");
      await driver.executeScript("arguments[0].style.display = 'none';", overlay);
    }
  }
}

async function sendMessageForUser(userId, message, socket) {
  const chatSession = activeChats[userId];
  if (!chatSession) {
    throw new Error('Chat session not found');
  }
  chatSession.lastActivity = Date.now();
  return await sendMessage(chatSession.driver, message);
}

async function sendMessage(driver, message) {
  const messageInput = await driver.wait(until.elementLocated(By.css('div[contenteditable="true"][data-lexical-editor="true"]')), 10000);
  const sendButton = await driver.wait(until.elementLocated(By.xpath('.//div/div/div/div/div/div/div[2]/div/div/div[2]/div/div/div[3]')), 10000);

  console.log(`Đang gửi tin nhắn: ${message}`);
  await driver.executeScript(`
    var input = arguments[0];
    input.textContent = arguments[1];
    var evt = new InputEvent('input', {
      inputType: 'insertText',
      data: arguments[1],
      bubbles: true,
      cancelable: true
    });
    input.dispatchEvent(evt);
  `, messageInput, message);
  await sleep(100);

  console.log("Đang gửi tin nhắn...");
  await driver.executeScript("arguments[0].click();", sendButton);
  
  console.log("Đã gửi tin nhắn");
  await sleep(100);

  return { success: true, message: 'Tin nhắn đã được gửi' };
}

function releaseChat(userId) {
  if (activeChats[userId]) {
    const { driver, timeoutId } = activeChats[userId];
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    activeChats[userId].timeoutId = setTimeout(() => {
      console.log(`Releasing chat for userId: ${userId}`);
      releaseDriverToPool(driver);
      delete activeChats[userId];
    }, 10 * 60 * 1000); 
  }
}

async function getDriverFromPool() {
  if (driverPool.length > 0) {
    return driverPool.pop();
  }
  if (driverPool.length < MAX_DRIVERS) {
    return await initializeDriver();
  }
  return new Promise(resolve => {
    const checkPool = setInterval(() => {
      if (driverPool.length > 0) {
        clearInterval(checkPool);
        resolve(driverPool.pop());
      }
    }, 1000);
  });
}

function releaseDriverToPool(driver) {
  if (driverPool.length < MAX_DRIVERS) {
    driverPool.push(driver);
  } else {
    driver.quit();
  }
}

async function initializeDriver() {
  const options = new chrome.Options();
  options.addArguments('--disable-blink-features=AutomationControlled');
  options.addArguments('--start-maximized');
  options.addArguments('--ignore-certificate-errors');
  options.addArguments('--ignore-ssl-errors');

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  await driver.manage().setTimeouts({ implicit: 10000, pageLoad: 30000, script: 30000 });

  const cookiesLoaded = await loadCookies(driver);
  if (!cookiesLoaded) {
    await loginAndSaveCookies(driver);
  }

  return driver;
}

async function loginAndSaveCookies(driver) {
  await driver.get('https://www.instagram.com/accounts/login/');
  await sleep(3000);

  await driver.wait(until.elementLocated(By.name('username')), 10000);
  await driver.findElement(By.name('username')).sendKeys('your_username');
  await driver.findElement(By.name('password')).sendKeys('your_password');
  await driver.findElement(By.css('button[type="submit"]')).click();
  await sleep(5000);

  const cookies = await driver.manage().getCookies();
  fs.writeFileSync(cookieFilePath, JSON.stringify(cookies, null, 2));
  console.log('Saved cookies to file.');
}

async function loadCookies(driver) {
  if (fs.existsSync(cookieFilePath)) {
    const cookies = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));
    await driver.get('https://www.instagram.com');
    for (const cookie of cookies) {
      try {
        await driver.manage().addCookie(cookie);
      } catch (error) {
        console.warn(`Không thể thêm cookie: ${cookie.name}`, error.message);
      }
    }
    return true;
  }
  return false;
}

function saveChatUrl(userId, chatUrl) {
  let chatUrls = {};
  if (fs.existsSync(chatUrlsFile)) {
    chatUrls = JSON.parse(fs.readFileSync(chatUrlsFile, 'utf8'));
  }
  chatUrls[userId] = chatUrl;
  fs.writeFileSync(chatUrlsFile, JSON.stringify(chatUrls, null, 2));
}

async function openChatForUser(driver, userId) {
  await driver.get(`https://www.instagram.com/${userId}/`);
  await sleep(2000);
  
  try {
    // const messageButtonXPath = './/section/main/div/header/section[2]/div/div/div[2]/div/div[2]/div';
    const messageButtonXPath = ".//section/main/div/header/section[2]/div/div/div[2]/div/div[2]/div";
    const messageButtons = await driver.findElements(By.xpath(messageButtonXPath));

    for (let button of messageButtons) {
      const buttonText = await button.getText();
      if (buttonText.includes('Message')) {
        await driver.executeScript("arguments[0].scrollIntoView(true);", button);
        await sleep(1000);
        await button.click();
        await sleep(2000);
        
        
        const currentUrl = await driver.getCurrentUrl();
        if (currentUrl.includes('/direct/')) {
          return currentUrl;
        }
      }
    }
  } catch (error) {
    console.log("Nút 'Message' không có sẵn, thử trường hợp 2...");
  }

  try {
    const moreOptionsButtonXPath = "//button[contains(@aria-label, 'Options')]";
    const moreOptionsButton = await driver.wait(until.elementLocated(By.xpath(moreOptionsButtonXPath)), 5000);
    await moreOptionsButton.click();

    const sendMessageButtonXPath = "//div[text()='Send message']";
    const sendMessageButton = await driver.wait(until.elementLocated(By.xpath(sendMessageButtonXPath)), 5000);
    await sendMessageButton.click();
    await sleep(2000);

    const currentUrl = await driver.getCurrentUrl();
    if (currentUrl.includes('/direct/')) {
      return currentUrl;
    }
  } catch (error) {
    console.log("Không tìm thấy 'Send message' sau khi click vào dấu ba chấm, thử trường hợp 3...");
  }

  throw new Error("Không thể lấy URL chat cho người dùng này.");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of Object.entries(activeChats)) {
    if (now - session.lastActivity > 10 * 60 * 1000) {
      releaseChat(userId);
    }
  }
}, 5 * 60 * 1000);

app.post('/send-message', async (req, res) => {
  const { userId, chatUrl, message } = req.body;

  if ((!userId && !chatUrl) || !message) {
    return res.status(400).json({ error: 'Either userId or chatUrl, and message are required' });
  }

  try {
    let driver;
    if (userId) {
      const url = await getChatUrlForUser(userId);
      driver = await getOrCreateDriverForChat(userId, url);
    } else if (chatUrl) {
      const extractedUserId = extractUserIdFromChatUrl(chatUrl);
      driver = await getOrCreateDriverForChat(extractedUserId, chatUrl);
    }

    if (!driver) {
      throw new Error('Could not initialize chat session');
    }

    const result = await sendMessage(driver, message);
    res.json(result);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'An error occurred while sending the message', details: error.message });
  }
});

function extractUserIdFromChatUrl(chatUrl) {
  const match = chatUrl.match(/\/t\/(\d+)/);
  return match ? match[1] : null;
}

app.post('/get-chat-url', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const chatUrl = await getChatUrlForUser(userId);
    res.json({ userId, chatUrl });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'An error occurred while fetching chat URL', details: error.message });
  }
});

async function getChatUrlForUser(userId) {
  let chatUrl = getChatUrl(userId);
  if (!chatUrl) {
    const driver = await getDriverFromPool();
    try {
      chatUrl = await openChatForUser(driver, userId);
      saveChatUrl(userId, chatUrl);
    } finally {
      releaseDriverToPool(driver);
    }
  }
  return chatUrl;
}

function getChatUrl(userId) {
  if (fs.existsSync(chatUrlsFile)) {
    const chatUrls = JSON.parse(fs.readFileSync(chatUrlsFile, 'utf8'));
    return chatUrls[userId];
  }
  return null;
}

function handleServerShutdown() {
  console.log('Server is shutting down...');
  
  io.emit('serverShutdown', { message: 'Server is shutting down' });
  
  io.sockets.sockets.forEach((socket) => {
    socket.disconnect(true);
  });

  // Đóng server HTTP
  server.close(() => {
    console.log('Server has been shut down');
    process.exit(0);
  });
}

process.on('SIGTERM', handleServerShutdown);
process.on('SIGINT', handleServerShutdown);

async function listenForNewMessages(driver, userId, socket) {
  console.log(`Bắt đầu lắng nghe tin nhắn mới cho userId: ${userId}`);
  const messageIds = new Set(); 
  let lastMessageIndex = 0; 

  const checkNewMessages = async () => {
    try {
      const messagesContainerXPath = './/div/div/div[1]/div[1]/div[1]/section/main/section/div/div/div/div[1]/div/div[2]/div/div/div[1]/div/div/div/div[2]/div/div/div[1]/div/div/div/div/div/div/div[3]/div';
      const messagesContainer = await driver.wait(until.elementLocated(By.xpath(messagesContainerXPath)), 10000);
      
      const messages = await messagesContainer.findElements(By.xpath('.//div[@role="row"]'));
      
      if (messages.length > lastMessageIndex) {
        const newMessageIndex = messages.length - 1; 
        const lastMessageElement = messages[newMessageIndex];
        
        await driver.executeScript("arguments[0].scrollIntoView(true);", lastMessageElement);
        await driver.sleep(1000);
        console.log('Scrolled to the last message');

        for (let i = lastMessageIndex; i < messages.length; i++) {
          const messageElement = messages[i];
          const messageText = await messageElement.getText();
          const lines = messageText.split('\n');
          const name = lines[0];
          const content = lines.slice(1).join(' ').trim(); 
          
          const sanitizedContent = content
            .replace(/Enter/g, ' ') 
            .replace(/Sending/g, '') 
            .replace(/\s+/g, ' ') 
            .trim(); 

          const timestamp = Date.now();
          const messageId = `${timestamp}-${Math.random()}`; 
          if (!messageIds.has(messageId)) {
            const targetSocketId = userSockets[userId];
            if (targetSocketId) {
              io.to(targetSocketId).emit('newMessage', { 
                sender: name,
                content: sanitizedContent, 
                senderType: name === userId ? 'other' : 'user',
                id: messageId
              });
            } else {
              console.error('No socket found for userId:', userId);
            }
            messageIds.add(messageId);
          }
        }
        lastMessageIndex = messages.length;
      }
    } catch (error) {
      console.error('Lỗi khi kiểm tra tin nhắn mới:', error.message);
    }

    setTimeout(checkNewMessages, 2000);
  };

  checkNewMessages();
}

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
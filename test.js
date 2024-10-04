const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cookieFilePath = path.join(__dirname, 'instagram_cookies.json');
const chatUrlsFile = path.join(__dirname, 'chat_urls.json');

let driver;
let currentChatUrl = null;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginAndSaveCookies(driver) {
    await driver.get('https://www.instagram.com/accounts/login/');
    await sleep(3000);

    await driver.wait(until.elementLocated(By.name('username')), 10000);
    await driver.findElement(By.name('username')).sendKeys('quocnghitr0504@gmail.com');
    await driver.findElement(By.name('password')).sendKeys('sORROWN05042003@@@@@@');
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

function getChatUrl(userId) {
    if (fs.existsSync(chatUrlsFile)) {
        const chatUrls = JSON.parse(fs.readFileSync(chatUrlsFile, 'utf8'));
        return chatUrls[userId];
    }
    return null;
}

app.post('/chat', async (req, res) => {
    const { userId } = req.body;
    
    let chatUrl = getChatUrl(userId);
    if (chatUrl) {
        return res.json({ chatUrl });
    }

    console.log(`Attempting to open chat for Instagram user: ${userId}`);

    let driver;
    try {
        const options = new chrome.Options();
        options.addArguments('--disable-blink-features=AutomationControlled');
        options.addArguments('--start-maximized');
        options.addArguments('--ignore-certificate-errors');
        options.addArguments('--ignore-ssl-errors');
        
        driver = await new Builder().forBrowser('chrome').setChromeOptions(options).withCapabilities({'pageLoadStrategy': 'normal'}).build();

        await driver.manage().setTimeouts({implicit: 10000, pageLoad: 30000, script: 30000});

        const cookiesLoaded = await loadCookies(driver);
        if (!cookiesLoaded) {
            await loginAndSaveCookies(driver);
        }

        await driver.get('https://www.instagram.com/');
        await sleep(1000);

        await driver.get(`https://www.instagram.com/${userId}/`);
        await sleep(1000);

        const messageButtonXPath = './/section/main/div/header/section[2]/div/div/div[2]/div/div[2]/div';
        try {
            const messageButton = await driver.wait(until.elementLocated(By.xpath(messageButtonXPath)), 10000);
            await driver.executeScript("arguments[0].scrollIntoView(true);", messageButton);
            await sleep(1000);
            await messageButton.click();
            await sleep(1000);
        } catch (error) {
            console.error('Could not find or click Message button:', error.message);
            throw new Error('Could not find or click Message button');
        }
        // Lấy URL hiện tại
        const currentUrl = await driver.getCurrentUrl();
        console.log(`Current URL: ${currentUrl}`);

        // Chụp ảnh màn hình để debug
        await driver.takeScreenshot().then(
            function(image) {
                fs.writeFileSync('debug_screenshot_after_click.png', image, 'base64');
            }
        );

        if (currentUrl.includes('/direct/')) {
            chatUrl = currentUrl;
            saveChatUrl(userId, chatUrl);
            res.json({ chatUrl });
        } else {
            res.json({ error: 'Could not open chat', currentUrl: currentUrl });
        }
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'An error occurred while processing your request', details: error.message });
    } 
    // finally {
    //     if (driver) {
    //         await driver.quit();
    //     }
    // }
});


app.post('/send-message', async (req, res) => {
    const { chatUrl, message } = req.body;

    if (!chatUrl || !message) {
        return res.status(400).json({ error: 'ChatUrl and message are required' });
    }

    try {
        driver = await initializeDriver(); // Khởi tạo driver nếu chưa có
        const result = await sendMessage(driver, chatUrl, message);
        res.json(result);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'An error occurred while sending the message', details: error.message });
    }
    // Không đóng driver ở đây để tái sử dụng cho các request tiếp theo
});

async function sendMessage(driver, chatUrl, message) {
    await initializeDriver();
    await navigateToChatIfNeeded(chatUrl);

    const overlays = await driver.findElements(By.css('.overlay, .popup, [role="dialog"]'));
    for (let overlay of overlays) {
        if (await overlay.isDisplayed()) {
            console.log("Đang đóng overlay hoặc popup...");
            await driver.executeScript("arguments[0].style.display = 'none';", overlay);
        }
    }

    console.log("Đang tìm ô nhập tin nhắn...");
    const messageInput = await driver.wait(until.elementLocated(By.css('div[contenteditable="true"][data-lexical-editor="true"]')), 10000);
    
    console.log(`Đang nhập tin nhắn: ${message}`);
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
    await sleep(1000);

    console.log("Đang tìm nút gửi...");
    const sendButton = await driver.wait(until.elementLocated(By.xpath('.//div/div/div/div/div/div/div[2]/div/div/div[2]/div/div/div[3]')), 10000);
    
    console.log("Đang gửi tin nhắn...");
    await driver.executeScript("arguments[0].click();", sendButton);
    
    console.log("Đã gửi tin nhắn");

    return { success: true, message: 'Tin nhắn đã được gửi' };
}

async function initializeDriver() {
    if (!driver) {
        const options = new chrome.Options();
        options.addArguments('--disable-blink-features=AutomationControlled');
        options.addArguments('--start-maximized');
        options.addArguments('--ignore-certificate-errors');
        options.addArguments('--ignore-ssl-errors');
        
        driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
        await driver.manage().setTimeouts({implicit: 10000, pageLoad: 30000, script: 30000});
        
        const cookiesLoaded = await loadCookies(driver);
        if (!cookiesLoaded) {
            await loginAndSaveCookies(driver);
        }
    }
    return driver;
}

async function navigateToChatIfNeeded(chatUrl) {
    if (currentChatUrl !== chatUrl) {
        console.log(`Navigating to ${chatUrl}`);
        await driver.get(chatUrl);
        await driver.wait(until.urlIs(chatUrl), 10000);
        currentChatUrl = chatUrl;
    }
}


io.on('connection', (socket) => {
    console.log('New Socket.IO connection');

    socket.on('monitor chat', async (chatUrl) => {
        console.log(`Received request to monitor chat: ${chatUrl}`);

        await initializeDriver();
        await navigateToChatIfNeeded(chatUrl);

        const checkInterval = setInterval(async () => {
            try {
                const newMessages = await checkNewMessages(chatUrl);
                if (newMessages.length > 0) {
                    console.log(`Sending ${newMessages.length} new messages`);
                    socket.emit('new messages', newMessages);
                }
            } catch (error) {
                console.error('Error checking messages:', error);
                socket.emit('error', 'Error checking messages');
            }
        }, 1000);  // Kiểm tra mỗi giây

        socket.on('disconnect', () => {
            console.log('Socket.IO connection closed');
            clearInterval(checkInterval);
        });
    });

    socket.on('send message', async (data) => {
        const { chatUrl, message } = data;
        try {
            const result = await sendMessage(chatUrl, message);
            socket.emit('message sent', result);
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', 'Error sending message');
        }
    });
});

    async function checkNewMessages(chatUrl) {
        await initializeDriver();
        await navigateToChatIfNeeded(chatUrl);
    
        console.log("Checking for new messages...");
        const messageElements = await driver.findElements(By.css('div[role="row"]'));
        
        const messages = [];
        for (let element of messageElements) {
            const text = await element.getText();
            const isOwnMessage = await element.getAttribute('data-testid') === 'message-container-sent';
            
            if (!isOwnMessage) {
                messages.push(text);
            }
        }
    
        return messages;
}

process.on('SIGINT', async () => {
    if (driver) {
        await driver.quit();
    }
    process.exit();
});

const port = 3000;
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
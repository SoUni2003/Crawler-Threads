const { Builder, By ,until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function initializeDriver() {
    const options = new chrome.Options();
    options.addArguments('--start-maximized');  // Mở rộng cửa sổ trình duyệt
    // options.addArguments('--headless');  // Bỏ dòng này để hiển thị cửa sổ trình duyệt
    options.addArguments('--disable-gpu');  // Tắt GPU (thường để tránh vấn đề khi chạy trên server)
    options.addArguments('--no-sandbox');  // Đảm bảo tính bảo mật
    options.addArguments('--disable-dev-shm-usage');  // Tránh các lỗi bộ nhớ trong môi trường Docker
    return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

async function loadCookies(driver, cookieFilePath) {  
    try {  
        if (fs.existsSync(cookieFilePath)) {  
            const cookies = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));  
            const currentTime = Math.floor(new Date().getTime() / 1000);  
            console.log(`Current time: ${currentTime}`);  

            let isCookieValid = cookies.some(cookie => cookie.expiry && cookie.expiry > currentTime);  
            console.log(`Are cookies valid? ${isCookieValid}`);  

            const currentUrl = await driver.getCurrentUrl();  
            const currentDomain = new URL(currentUrl).hostname;  

            if (isCookieValid && currentDomain.includes('threads.net')) {  
                for (let cookie of cookies) {  
                    await driver.manage().addCookie(cookie); 
                }  
                await driver.navigate().refresh();  
                console.log('Using existing cookies, no need to login again.');  
                return true; 
            } else {  
                console.log('Cookies have expired/Invalid domain, need to login again.');  
                fs.unlinkSync(cookieFilePath); 
            }  
        }  
    } catch (error) {  
        console.error("Error loading cookies:", error);  
    }  
    return false; 
}

async function loginAndSaveCookies(driver, cookieFilePath) {
    await driver.get('https://www.threads.net/login');
    await driver.findElement(By.xpath('.//div/div/div/div[1]/div[1]/div[3]/form/div/div[1]/input')).sendKeys('quocnghitr0504@gmail.com');
    await driver.findElement(By.xpath('.//div/div/div/div[1]/div[1]/div[3]/form/div/div[2]/input')).sendKeys('sORROWN05042003@@@@@@');
    await driver.findElement(By.xpath('.//div/div/div/div[1]/div[1]/div[3]/form/div/div[3]/div[2]')).click();
    await sleep(3000);

    const cookies = await driver.manage().getCookies();
    fs.writeFileSync(cookieFilePath, JSON.stringify(cookies, null, 2));
    console.log('Saved cookies to file.');
}

// async function scrollAndLoadItems(driver) {
//     let allItems = [];
//     while (true) {
//         let listItems = await driver.findElements(By.xpath('//ul/li'));
//         if (listItems.length === 0) {
//             break;
//         }

//         allItems = allItems.concat(listItems);

//         let listElement = driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[2]/div/div/div/ul'));
//         let lastHeight = await driver.executeScript("return arguments[0].scrollHeight", listElement);
//         await driver.executeScript("arguments[0].scrollBy(0, arguments[1]);", listElement, lastHeight);
//         await sleep(2000);

//         let newHeight = await driver.executeScript("return arguments[0].scrollHeight", listElement);
//         if (newHeight === lastHeight) {
//             break;
//         }
//         lastHeight = newHeight;
//     }
//     return allItems;
// }

// Save for API

// async function savePostToAPI(postInfo) {
//     try {
//         const response = await axios.post('http://14.224.183.55/api/v1/threads/save-post', postInfo);
//         console.log(`User ${postInfo.userId} has been sent to the API.`);
//         console.log("Response:", response.data);
//     } catch (error) {
//         console.error(`Error sending data for user ${postInfo.userId} to the API:`, error.message);
//         if (error.response) {
//             console.error("Response data:", error.response.data);
//             console.error("Response status:", error.response.status);
//             console.error("Response headers:", error.response.headers);
//         }
//         throw error;
//     }
// }

// Save for JSON
async function savePostToAPI(postInfo, filePath) {
    try {
        let existingData = [];
        if (fs.existsSync(filePath)) {
            existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }

        existingData.push(postInfo);

        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
        console.log(`Post information has been saved to ${filePath}`);
    } catch (error) {
        console.error("Error saving post to JSON:", error);
    }
}

// Save for API
// async function saveUserToAPI(userInfo) {
//     try {
//         const response = await axios.post('http://14.224.183.55/api/v1/threads/save-user', userInfo);
//         console.log(`User ${userInfo.userId} has been sent to the API.`);
//         console.log("Response:", response.data);
//     } catch (error) {
//         console.error(`Error sending data for user ${userInfo.userId} to the API:`, error.message);
//         if (error.response) {
//             console.error("Response data:", error.response.data);
//             console.error("Response status:", error.response.status);
//             console.error("Response headers:", error.response.headers);
//         }
//         throw error;
//     }
// }

async function saveUserToAPI(userInfo, filePath) {
    try {
        let existingData = [];
        if (fs.existsSync(filePath)) {
            existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }

        existingData.push(userInfo);

        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
        console.log(`User information has been saved to ${filePath}`);
    } catch (error) {
        console.error("Error saving user to JSON:", error);
    }
}


// async function collectUserInfo(driver, items) {
//     let userInfoList = [];
//     const originalWindow = await driver.getWindowHandle();

//     for (let i = 0; i < items.length; i++) {
//         let item = items[i];
//         try {
//             let avatarElements = await item.findElements(By.xpath('.//div/img'));
//             if (avatarElements.length === 0) {
//                 continue;
//             }            
//             await driver.executeScript("arguments[0].scrollIntoView(true);", item);
//             const linkElement = await item.findElement(By.xpath('.//object/a'));
//             const link = await linkElement.getAttribute('href');

//             await driver.executeScript("window.open(arguments[0]);", link);
//             await driver.switchTo().window((await driver.getAllWindowHandles())[1]);

//             let backButton = await safeFindElement(driver, By.xpath('//*[@id="barcelona-page-layout"]/div/div/div/a/div'));
//             if (backButton) {
//                 await driver.close();
//                 await driver.switchTo().window(originalWindow);
//                 continue;
//             } else {
//                 console.log('Back button not found, continuing without clicking.');
//             }
//             console.log('Navigating to:', await driver.getCurrentUrl());
//             await sleep(3000);

//             let element = await driver.wait(until.elementLocated(By.xpath('.//div/div[1]/div[1]/div[1]/div[1]/h1')), 10000);
//             await element.click();
//             await sleep(3000);

//             let userInfo = {
//                 link_Main: await driver.getCurrentUrl(),
//                 userId: await getElementText(driver, By.xpath('.//div/div[1]/div[1]/div[1]/div[2]/div/span/span')),
//                 name: await getElementText(driver, By.xpath('.//div/div[1]/div[1]/div[1]/div[1]/h1')),
//                 avatar: await getElementAttribute(driver, By.xpath('.//div/div/img'), 'src'),
//                 description: await getElementText(driver, By.xpath('.//div[2]/div[1]/div[1]/div[2]/span')),
//                 follow: await getElementAttribute(driver, By.xpath('.//div/div[2]/div[1]/div[1]/div[3]/div[1]/div/div/span/span'), 'title'),
//                 linkOther: await getElementText(driver, By.xpath('.//div[2]/div/span[2]/div/a/span/span')),
//                 joined: await extractDataByLabel(driver, 'Joined'),
//                 baseIn: await extractDataByLabel(driver, 'Based in')
//             };

//             let avatarUrl = userInfo.avatar;
//             if (avatarUrl) {
//                 let imgName = userInfo.userId.replace(/\s+/g, '_') + '.jpg';
//                 let imgPath = path.join(__dirname, 'images', imgName);
//                 await downloadImage(avatarUrl, imgPath);
//                 userInfo.avatar = `images/${imgName}`; 
//             }
//             userInfoList.push(userInfo);
//             await saveUserToAPI(userInfo);
//             console.log(`User ${i}:`, userInfo);
//             await driver.close();
//             await driver.switchTo().window(originalWindow);

//         } catch (err) {
//             console.log("Error collecting user info:", err);
//             let defaultUserInfo = {
//                 userId: userId,
//                 name: 'none',
//                 link_Main: 'none',
//                 avatar: 'none',
//                 description: 'none',
//                 follow: 'none',
//                 linkOther: 'none',
//                 joined: 'none',
//                 baseIn: 'none'
//             };
//             await saveUserToAPI(defaultUserInfo);
//         }
//     }
//     return userInfoList;
// }

async function extractDataByLabel(driver, label) {
    try {
        let labelElement = await driver.findElement(By.xpath(`//span[contains(text(), '${label}')]`));
        
        let parentElement = await labelElement.findElement(By.xpath('./ancestor::div[1]'));
        
        let valueElement = await parentElement.findElement(By.xpath('./following-sibling::div[1]//span | ./following-sibling::span[1]'));
        
        if (valueElement) {
            return await valueElement.getText();
        }
    } catch (err) {
        console.log(`Error extracting data for ${label}:`, err);
    }
    return 'none';
}

async function findValidContainerXpath(driver) {
    const xpath1 = '/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[1]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[2]/div/div/div[1]';
    const xpath2 = '/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[2]/div/div/div[1]';

    try {
        return await driver.wait(until.elementLocated(By.xpath(xpath1)), 5000);
    } catch (error) {
        console.log("XPath1 không hợp lệ, thử XPath2...");
        try {
            return await driver.wait(until.elementLocated(By.xpath(xpath2)), 15000);
        } catch (error) {
            console.log("Cả XPath1 và XPath2 đều không hợp lệ.");
            throw new Error("Không thể tìm thấy container.");
        }
    }
}

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    fs.mkdirSync(dirname, { recursive: true });
}

const downloadImage = async (url, filePath) => {
    ensureDirectoryExistence(filePath); 
    const writer = fs.createWriteStream(filePath);
    const response = await axios({
        url,
        responseType: 'stream',
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

const isUsernameUnique = (userId, existingUsernames) => !existingUsernames.has(userId);

async function scrollAndCollectPosts(driver) {
    const posts = [];
    const userInfoPostList = [];
    const existingUsernames = new Set(); 
    const containerElement = await findValidContainerXpath(driver);
    const postMax = 50; 
    let postIndex = 1; 
    let uniqueUserCount = 1; 

    while (uniqueUserCount <= postMax) {
        try {
            let postXpath = `./div[${postIndex}]`;
            let postElement = await containerElement.findElement(By.xpath(postXpath));

            console.log(`Retrieving data from post no ${postIndex}`);

            let titleElement = await safeFindElement(postElement, By.xpath('.//div/div/div/div/div[3]/div/div[1]'));
            let title = titleElement ? await titleElement.getText() : 'None title';

            let userIdElement = await safeFindElement(postElement, By.xpath('.//div/div/div/div/div[2]/div/div[1]/div/span/div/span/div/a'));
            let userId = userIdElement ? await userIdElement.getText() : 'None';

            let authorHrefElement = await safeFindElement(postElement, By.xpath('.//div/div/div/div/div[2]/div/div[1]/div/span/div/span/div/a'));
            let authorHref = authorHrefElement ? await authorHrefElement.getAttribute('href') : null;

            let timeElment = await safeFindElement(postElement, By.xpath('.//div/div[2]/div/div/div[1]/div[2]/div/div/div/div/div[3]/div/div[3]/div/div[1]/div/div/div/span/div/span'));
            let time = timeElment ? await timeElment.getText() : 'None time';

            let tymElment = await safeFindElement(postElement, By.xpath('.//div[2]/div/div/div/span/div/span'));
            let tym = tymElment ? await tymElment.getText() : 'None tym';

            let commentElment = await safeFindElement(postElement, By.xpath('.//div[3]/div/div/div/span/div/span'));
            let comment = commentElment ? await commentElment.getText() : 'None comment';

            let repostElment = await safeFindElement(postElement, By.xpath('.//div/div[3]/div/div/span/div/span'));
            let repost = repostElment ? await repostElment.getText() : 'None repost';

            let imgElements = await postElement.findElements(By.xpath('.//picture/img'));

            let postData = {
                userId: userId,
                title: title,
                time: time,
                tym: tym,
                comment: comment,
                repost: repost,
            };

            if (imgElements.length === 1) {
                let imgSrc = await imgElements[0].getAttribute('src');
                postData.image = imgSrc;
            } else if (imgElements.length > 1) {
                let imgSrcs = [];
                for (let imgElement of imgElements) {
                    let imgSrc = await imgElement.getAttribute('src');
                    imgSrcs.push(imgSrc);
                }
                postData.images = imgSrcs;
            }
            posts.push(postData);
            await savePostToAPI(postData);
            console.log(`Post ${postIndex}:`, postData);
            console.log('authorHref1222222222222222222',authorHref)

            if (authorHref) {
                if (isUsernameUnique(userId, existingUsernames)) {
                    try {
                        console.log(`Opening new tab for author: ${userId}`);
                        await driver.switchTo().newWindow('tab');
                        await driver.get(authorHref);
                        console.log('Navigating to:', await driver.getCurrentUrl());
                        await sleep(3000);

                        let element = await driver.wait(until.elementLocated(By.xpath('.//div/div[1]/div[1]/div[1]/div[1]/h1')), 10000);
                        await element.click();
                        await sleep(3000);

                        let userInfoPost = {
                            userId: userId,
                            name: await getElementText(driver, By.xpath('.//div/div[1]/div[1]/div[1]/div[1]/h1')),
                            link_Main: await driver.getCurrentUrl(),
                            avatar: await getElementAttribute(driver, By.xpath('.//div/div/img'), 'src'), // Avatar từ trang của người dùng
                            description: await getElementText(driver, By.xpath('.//div[2]/div[1]/div[1]/div[2]/span')),
                            follow: await getElementAttribute(driver, By.xpath('.//div/div[2]/div[1]/div[1]/div[3]/div[1]/div/div/span/span'), 'title'),
                            linkOther: await getElementText(driver, By.xpath('.//div[2]/div/span[2]/div/a/span/span')),
                            joined: await extractDataByLabel(driver, 'Joined'),
                            baseIn: await extractDataByLabel(driver, 'Based in')
                        };

                        let avatarUrl = userInfoPost.avatar;
                        if (avatarUrl) {
                            let imgName = userInfoPost.userId.replace(/\s+/g, '_') + '.jpg'; 
                            let imgPath = path.join(__dirname, 'images', imgName);
                            await downloadImage(avatarUrl, imgPath);
                            userInfoPost.avatar = `images/${imgName}`; 
                        }

                        userInfoPostList.push(userInfoPost);
                        await saveUserToAPI(userInfoPost);
                        existingUsernames.add(userId); 
                        uniqueUserCount++; 

                        console.log(`User info ${postIndex}:`, userInfoPost);
                    } catch (err) {
                        console.log("Error collecting user info:", err);
                        let defaultUserInfo = {
                            userId: userId,
                            name: 'none',
                            link_Main: 'none',
                            avatar: 'none',
                            description: 'none',
                            follow: 'none',
                            linkOther: 'none',
                            joined: 'none',
                            baseIn: 'none'
                        };
                        await saveUserToAPI(defaultUserInfo);
                    }
                    await driver.close();
                    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);
                } else {
                    console.log(`Username ${userId} already exists. Skipping.`);
                }
            }
            postIndex++; 
            await driver.executeScript("arguments[0].scrollIntoView();", postElement);
            await sleep(2000);
        } catch (error) {
            console.log(`No posts found in index ${postIndex}. Stop!.`);
            break;
        }
    }

    return { posts, userInfoPostList };
}

async function safeFindElement(element, by) {
    try {
        return await element.findElement(by);
    } catch (error) {
        return null;
    }
}

async function getElementText(driver, by) {
    try {
        let element = await driver.findElement(by);
        return await element.getText();
    } catch (error) {
        return 'none';
    }
}

async function getElementAttribute(driver, by, attributeName) {
    try {
        let element = await driver.findElement(by);
        return await element.getAttribute(attributeName);
    } catch (error) {
        return 'none';
    }
}

(async function main() {  
    let driver = await initializeDriver();  
    const search = process.argv[2];  
    const keywords = search.split("=")[1].split(",");  

    const cookieFilePath = 'cookies.json';  
    const allUserInfoList = []; 
    const allPosts = []; 

    for (const keyword of keywords) {  
        try {  
            await driver.get('https://www.threads.net/');   

            if (await loadCookies(driver, cookieFilePath)) {  
                await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[1]/div[2]/div[2]/a/div/div[2]')).click();  
                await sleep(2000);  
                await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[1]/div/div/div/input')).sendKeys(keyword);  
            } else {  
                await loginAndSaveCookies(driver, cookieFilePath);  
                await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[1]/div[2]/div[2]/a/div/div[2]')).click();  
                await sleep(2000);  
                await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[1]/div/div/div/input')).sendKeys(keyword);  
            }  
            console.log(`Processed user list for ${keyword}`);  



            let inputElement = await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[1]/div/div/div/input'));  
            await inputElement.clear();  

            await inputElement.sendKeys('\n');  
            await sleep(1000);  


            let { posts, userInfoPostList } = await scrollAndCollectPosts(driver);  
            allPosts.push(...posts); 
            allUserInfoList.push(...userInfoPostList);
            console.log(`Collected posts for ${keyword}`);  

        } catch (error) {  
            console.error(`An error occurred while processing ${keyword}:`, error);  
        }   
    } 

    // await driver.quit();  
})();


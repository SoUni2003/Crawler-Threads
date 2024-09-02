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
    options.addArguments('--start-maximized'); 
    return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

async function loadCookies(driver, cookieFilePath) {
    if (fs.existsSync(cookieFilePath)) {
        const cookies = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));
        const currentTime = Math.floor(new Date().getTime() / 1000);
        console.log(currentTime);

        let isCookieValid = cookies.some(cookie => cookie.expiry && cookie.expiry > currentTime);
        console.log(isCookieValid);
        
        if (isCookieValid) {
            for (let cookie of cookies) {
                await driver.manage().addCookie(cookie);
            }
            await driver.navigate().refresh();
            console.log('Using existing cookies, no need to login again.');
            return true;
        } else {
            console.log('Cookies have expired, need to login again.');
            fs.unlinkSync(cookieFilePath);
        }
    }
    return false;
}

async function loginAndSaveCookies(driver, cookieFilePath) {
    await driver.get('https://www.threads.net/login');
    await driver.findElement(By.xpath('/html/body/div[1]/div/div/div[2]/div/div/div/div[1]/div[1]/div[3]/form/div/div[1]/input')).sendKeys('quocnghitr0504@gmail.com');
    await driver.findElement(By.xpath('/html/body/div[1]/div/div/div[2]/div/div/div/div[1]/div[1]/div[3]/form/div/div[2]/input')).sendKeys('sORROWN05042003@@@@@@');
    await driver.findElement(By.xpath('/html/body/div[1]/div/div/div[2]/div/div/div/div[1]/div[1]/div[3]/form/div/div[3]/div[2]')).click();
    await sleep(3000);

    const cookies = await driver.manage().getCookies();
    fs.writeFileSync(cookieFilePath, JSON.stringify(cookies, null, 2));
    console.log('Saved cookies to file.');
}

async function scrollAndLoadItems(driver) {
    let allItems = [];
    while (true) {
        let listItems = await driver.findElements(By.xpath('//ul/li'));
        if (listItems.length === 0) {
            break;
        }

        allItems = allItems.concat(listItems);

        let listElement = driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[2]/div/div/div/ul'));
        let lastHeight = await driver.executeScript("return arguments[0].scrollHeight", listElement);
        await driver.executeScript("arguments[0].scrollBy(0, arguments[1]);", listElement, lastHeight);
        await sleep(2000);

        let newHeight = await driver.executeScript("return arguments[0].scrollHeight", listElement);
        if (newHeight === lastHeight) {
            break;
        }
        lastHeight = newHeight;
    }
    return allItems;
}

async function collectUserInfo(driver, items) {
    let userInfoList = [];
    const originalWindow = await driver.getWindowHandle();

    for (let i = 0; i < items.length; i++) {
        let item = items[i];
        try {
            let avatarElements = await item.findElements(By.xpath('.//div/img'));
            if (avatarElements.length === 0) {
                continue;
            }

            await driver.executeScript("arguments[0].scrollIntoView(true);", item);
            const linkElement = await item.findElement(By.xpath('.//object/a'));
            const link = await linkElement.getAttribute('href');

            await driver.executeScript("window.open(arguments[0]);", link);
            await driver.switchTo().window((await driver.getAllWindowHandles())[1]);
            console.log('Navigating to:', await driver.getCurrentUrl());
            await sleep(3000);

            let element = await driver.wait(until.elementLocated(By.xpath('.//div/div[1]/div[1]/div[1]/div[1]/h2')), 10000);
            await element.click();
            await sleep(3000);

            let userInfo = {
                link_main: await driver.getCurrentUrl(),
                username: await getElementText(driver, By.xpath('.//div/div[1]/div[1]/div[1]/div[2]/div/span/span')),
                details: await getElementText(driver, By.xpath('.//div/div[1]/div[1]/div[1]/div[1]/h2')),
                avatar: await getElementAttribute(driver, By.xpath('.//div/div/img'), 'src'),
                description: await getElementText(driver, By.xpath('.//div[2]/div[1]/div[1]/div[2]/span')),
                follow: await getElementAttribute(driver, By.xpath('.//div/div[2]/div[1]/div[1]/div[3]/div[1]/div/div/span/span'), 'title'),
                linkother: await getElementText(driver, By.xpath('.//div/span[2]/a/div/span/span')),
                joined: await extractDataByLabel(driver, 'Joined'),
                basein: await extractDataByLabel(driver, 'Based in')
            };

            let avatarUrl = userInfo.avatar;
            if (avatarUrl) {
                let imgName = userInfo.username.replace(/\s+/g, '_') + '.jpg';
                let imgPath = path.join(__dirname, 'images', imgName);
                await downloadImage(avatarUrl, imgPath);
                userInfo.avatar = `images/${imgName}`; 
            }
            userInfoList.push(userInfo);
            console.log(`User ${i}:`, userInfo);

            await driver.close();
            await driver.switchTo().window(originalWindow);

        } catch (err) {
            console.log("Error collecting user info:", err);
            userInfoList.push({
                link_main: 'none',
                username: 'none',
                details: 'none',
                avatar: 'none',
                description: 'none',
                follow: 'none',
                linkother: 'none',
                joined: 'none',
                basein: 'none'
            });
        }
    }
    return userInfoList;
}

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

const isUsernameUnique = (username, existingUsernames) => !existingUsernames.has(username);

async function scrollAndCollectPosts(driver) {
    const posts = [];
    const userInfoPostList = [];
    const existingUsernames = new Set(); 
    const containerElement = await findValidContainerXpath(driver);
    const postMax = 500; 
    let postIndex = 1; 
    let uniqueUserCount = 1; 

    while (uniqueUserCount < postMax) {
        try {
            let postXpath = `./div[${postIndex}]`;
            let postElement = await containerElement.findElement(By.xpath(postXpath));

            console.log(`Retrieving data from post no ${postIndex}`);

            let titleElement = await safeFindElement(postElement, By.xpath('.//div/div/div/div/div[3]/div/div[1]'));
            let title = titleElement ? await titleElement.getText() : 'None title';

            let authorElement = await safeFindElement(postElement, By.xpath('.//div/span[1]/div/div/a/span'));
            let author = authorElement ? await authorElement.getText() : 'None author';

            let authorHrefElement = await safeFindElement(postElement, By.xpath('.//div/span[1]/div/div/a'));
            let authorHref = authorHrefElement ? await authorHrefElement.getAttribute('href') : null;

            let timeElment = await safeFindElement(postElement, By.xpath('.//span/a/time/div'));
            let time = timeElment ? await timeElment.getText() : 'None time';

            let tymElment = await safeFindElement(postElement, By.xpath('.//div/div[1]/div/div/span/div/span'));
            let tym = tymElment ? await tymElment.getText() : 'None tym';

            let commentElment = await safeFindElement(postElement, By.xpath('.//div/div[2]/div/div/span/div/span'));
            let comment = commentElment ? await commentElment.getText() : 'None comment';

            let repostElment = await safeFindElement(postElement, By.xpath('.//div/div[3]/div/div/span/div/span'));
            let repost = repostElment ? await repostElment.getText() : 'None repost';

            let imgElements = await postElement.findElements(By.xpath('.//picture/img'));

            let postData = {
                index: postIndex,
                title: title,
                author: author,
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
            console.log(`Post ${postIndex}:`, postData);

            if (authorHref) {
                if (isUsernameUnique(author, existingUsernames)) {
                    try {
                        console.log(`Opening new tab for author: ${author}`);
                        await driver.switchTo().newWindow('tab');
                        await driver.get(authorHref);
                        console.log('Navigating to:', await driver.getCurrentUrl());
                        await sleep(3000);

                        let element = await driver.wait(until.elementLocated(By.xpath('.//div/div[1]/div[1]/div[1]/div[1]/h2')), 10000);
                        await element.click();
                        await sleep(3000);

                        let userInfoPost = {
                            index: uniqueUserCount,
                            link_main: await driver.getCurrentUrl(),
                            username: author,
                            details: await getElementText(driver, By.xpath('.//div/div[1]/div[1]/div[1]/div[1]/h2')),
                            avatar: await getElementAttribute(driver, By.xpath('.//div/div/img'), 'src'), // Avatar từ trang của người dùng
                            description: await getElementText(driver, By.xpath('.//div[2]/div[1]/div[1]/div[2]/span')),
                            follow: await getElementAttribute(driver, By.xpath('.//div/div[2]/div[1]/div[1]/div[3]/div[1]/div/div/span/span'), 'title'),
                            linkother: await getElementText(driver, By.xpath('.//div/span[2]/a/div/span/span')),
                            joined: await extractDataByLabel(driver, 'Joined'),
                            basein: await extractDataByLabel(driver, 'Based in')
                        };

                        let avatarUrl = userInfoPost.avatar;
                        if (avatarUrl) {
                            let imgName = userInfoPost.username.replace(/\s+/g, '_') + '.jpg'; 
                            let imgPath = path.join(__dirname, 'images', imgName);
                            await downloadImage(avatarUrl, imgPath);
                            userInfoPost.avatar = `images/${imgName}`; 
                        }

                        userInfoPostList.push(userInfoPost);
                        existingUsernames.add(author); 
                        uniqueUserCount++; 

                        console.log(`User info ${postIndex}:`, userInfoPost);
                    } catch (err) {
                        console.log("Error collecting user info:", err);
                        userInfoPostList.push({
                            index: uniqueUserCount,
                            link_main: 'none',
                            username: author,
                            details: 'none',
                            avatar: 'none',
                            description: 'none',
                            follow: 'none',
                            linkother: 'none',
                            joined: 'none',
                            basein: 'none'
                        });
                    }
                    await driver.close();
                    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);
                } else {
                    console.log(`Username ${author} already exists. Skipping.`);
                }
            }
            postIndex++; 
            await driver.executeScript("arguments[0].scrollIntoView();", postElement);
            await sleep(2000);
        } catch (error) {
            console.log(`No posts found in index ${postIndex}. Stop!.`);
            break;
        }
        fs.writeFileSync('list_post_user_data.json', JSON.stringify(userInfoPostList, null, 2));
        console.log("Post data has been saved to file list_post_user_data.json");
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
    try {
        const cookieFilePath = 'cookies.json';

        await driver.get('https://www.threads.net/');

        if (await loadCookies(driver, cookieFilePath)) {
            await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[1]/div[2]/div[2]/a/div/div[2]')).click();
            await sleep(2000);
            await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[1]/div/div/label/input')).sendKeys('forex');
        } else {
            await loginAndSaveCookies(driver, cookieFilePath);
            await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[1]/div[2]/div[2]/a/div/div[2]')).click();
            await sleep(2000);
            await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[1]/div/div/label/input')).sendKeys('forex');
        }

        await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[1]/div/div/label/input')).clear();
        await sleep(2000);

        let allItems = await scrollAndLoadItems(driver);
        let userInfoList = await collectUserInfo(driver, allItems);

        fs.writeFileSync('list_user_search.json', JSON.stringify(userInfoList, null, 2));
        console.log("Saved user list to file list_user_search.json");

        await sleep(3000)
        let inputElement = await driver.findElement(By.xpath('/html/body/div[2]/div/div/div[2]/div[2]/div/div/div/div[2]/div[1]/div/div/div[2]/div[1]/div[1]/div/div[1]/div/div/label/input'));
        await inputElement.clear();
        await sleep(3000);
        await inputElement.sendKeys('\n');
        await sleep(5000);

        let {posts, userInfoPostList } = await scrollAndCollectPosts(driver);

        let allUser = userInfoList.concat(userInfoPostList);

        fs.writeFileSync('all_user_search.json', JSON.stringify(allUser, null, 2));
        fs.writeFileSync('all_post_user_search.json', JSON.stringify(posts, null, 2));
        console.log("Data has been saved ");
    } catch (error) {
        console.error('An error occurred:', error);
    } 
    finally {
        await driver.quit();
    }
})();

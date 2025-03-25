import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
const port = process.env.PORT || 4334;

// Middleware để phân tích JSON body
app.use(express.json());

// API endpoint để scrape dữ liệu từ URL
app.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL là bắt buộc' });
    }
    
    const data = await scrapeData(url);
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Có lỗi xảy ra khi scrape dữ liệu' });
  }
});

async function scrapeData(url) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Thiết lập user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
  
  // Đi đến URL
  await page.goto(url, {
    waitUntil: 'networkidle2'
  });
  
  // Lấy nội dung của trang
  const content = await page.content();
  
  let result = {};
  
  // Thử phân tích nội dung JSON từ body
  try {
    const bodyText = await page.evaluate(() => document.body.innerText);
    const jsonData = JSON.parse(bodyText);
    result = { success: true, data: jsonData };
  } catch (error) {
    result = { 
        
      success: false, 
      message: 'Không thể phân tích dữ liệu JSON',
      htmlPreview: content.substring(0, 500) + '...'
    };
  }
  
  await browser.close();
  return result;
}

// Khởi động server
app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
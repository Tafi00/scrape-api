import express from 'express';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tạo thư mục uploads nếu chưa tồn tại
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

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

// API endpoint để tải file từ URL
app.post('/download', async (req, res) => {
  try {
    const { url, headers = {}, downloadButtonSelector, sessionCookie, loginAction, browserlessApiKey } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL là bắt buộc' });
    }

    // Khởi tạo browser với Browserless nếu có API key, hoặc local
    let browser;
    if (browserlessApiKey) {
      console.log('Sử dụng browserless.io với API key');
      const browserWSEndpoint = `wss://chrome.browserless.io?token=${browserlessApiKey}`;
      browser = await puppeteer.connect({
        browserWSEndpoint,
        ignoreHTTPSErrors: true
      });
    } else {
      browser = await puppeteer.launch({ 
        headless: true, // Đặt thành false để có thể theo dõi quá trình tải
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-web-security', 
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-features=BlockInsecurePrivateNetworkRequests',
          '--window-size=1920,1080',
          '--disable-dev-shm-usage',
          '--ignore-certificate-errors'
        ]
      });
    }
    
    const page = await browser.newPage();
    
    // Thiết lập user agent thực tế hơn
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
    
    // Thêm cookies nếu có
    if (sessionCookie) {
      await page.setCookie({
        name: 'sessionid',
        value: sessionCookie,
        domain: new URL(url).hostname,
        path: '/',
      });
    }
    
    // Thêm headers nếu có
    if (Object.keys(headers).length > 0) {
      await page.setExtraHTTPHeaders(headers);
    }
    
    // Điều chỉnh timeout và waitUntil
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);
    
    // Tạo thư mục tải về nếu chưa tồn tại
    const downloadPath = path.join(uploadsDir, 'tmp');
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }
    
    // Cấu hình client để tải file - sử dụng phương thức mới cho Puppeteer
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadPath
    });
    
    // CẤU HÌNH REQUEST INTERCEPTION CHUNG - CHỈ ĐẶT MỘT LẦN
    await page.setRequestInterception(true);
    page.on('request', request => {
      const resourceType = request.resourceType();
      const url = request.url();
      const hostname = new URL(url).hostname;
      
      // Bỏ qua tài nguyên không cần thiết
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font' || resourceType === 'media') {
        request.abort();
      } 
      // Chấp nhận các yêu cầu từ domain gốc hoặc các yêu cầu tải xuống
      else if (url.includes(hostname) || url.includes('download')) {
        request.continue();
      } 
      else {
        request.continue();
      }
    });
    
    // Theo dõi các phản hồi để phát hiện tải xuống
    page.on('response', async response => {
      const url = response.url();
      const headers = response.headers();
      const contentType = headers['content-type'] || '';
      const contentDisposition = headers['content-disposition'] || '';
      
      // Kiểm tra nếu đây là một phản hồi tải xuống và thành công
      if (response.ok() && (contentDisposition.includes('attachment') ||
          contentType.includes('application/pdf') ||
          contentType.includes('application/octet-stream'))) {
        console.log(`Phát hiện tải xuống thành công từ: ${url}`);
        
        try {
          const buffer = await response.buffer();
          if (buffer && buffer.length > 0) {
            const fileName = url.split('/').pop().split('?')[0] || 'downloaded_file';
            const uniqueFileName = `${Date.now()}-${fileName}`;
            const filePath = path.join(downloadPath, uniqueFileName);
            
            fs.writeFileSync(filePath, buffer);
            console.log(`Đã lưu file phản hồi tại: ${filePath}`);
          }
        } catch (bufferError) {
          console.error('Không thể lấy buffer từ phản hồi:', bufferError);
        }
      }
    });
    
    // Xử lý đặc biệt cho topcv.vn
    if (url.includes('topcv.vn')) {
      console.log('Phát hiện trang topcv.vn, áp dụng xử lý đặc biệt...');
      
      // Thử phương pháp trực tiếp trước với node-fetch
      try {
        // Tải trực tiếp bằng node-fetch bên ngoài puppeteer
        const fetchResponse = await fetch(url, {
          method: 'GET',
          headers: {
            ...headers,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://www.topcv.vn/'
          },
          redirect: 'follow'
        });
        
        if (fetchResponse.ok) {
          const buffer = await fetchResponse.arrayBuffer();
          const fileName = url.split('/').pop().split('?')[0] || 'topcv-download';
          const uniqueFileName = `${Date.now()}-${fileName}`;
          const filePath = path.join(uploadsDir, uniqueFileName);
          
          fs.writeFileSync(filePath, Buffer.from(buffer));
          console.log(`Đã tải file topcv trực tiếp: ${filePath}`);
          
          // Trả về kết quả thành công
          const downloadUrl = `/download/${uniqueFileName}`;
          res.json({
            success: true,
            downloadUrl: downloadUrl,
            fileName: fileName,
            note: "Đã xử lý đặc biệt cho topcv.vn"
          });
          
          await browser.close();
          return;
        } else {
          console.log(`Không thể tải trực tiếp, phản hồi có mã: ${fetchResponse.status}`);
        }
      } catch (directFetchError) {
        console.error('Lỗi khi tải trực tiếp từ topcv:', directFetchError);
      }
      
      // Phương pháp Puppeteer đặc biệt cho topcv
      try {
        console.log('Thử phương pháp chuyên biệt cho topcv...');
        
        // Mở URL gốc trước
        const refererUrl = 'https://www.topcv.vn/';
        await page.goto(refererUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Thiết lập thông tin giả của phiên trình duyệt
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        
        // Đi đến URL đích
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Đợi để tải xong
        await page.waitForTimeout(5000);
        
        // Thử tạo PDF từ trang hiện tại
        try {
          console.log('Đang tạo PDF từ trang...');
          const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
          });
          
          const pdfName = `topcv-${Date.now()}.pdf`;
          const pdfPath = path.join(uploadsDir, pdfName);
          
          fs.writeFileSync(pdfPath, pdfBuffer);
          console.log(`Đã tạo PDF: ${pdfPath}`);
          
          // Trả về kết quả PDF
          const downloadUrl = `/download/${pdfName}`;
          res.json({
            success: true,
            downloadUrl: downloadUrl,
            fileName: pdfName,
            note: "Đã tạo PDF từ trang topcv.vn"
          });
          
          await browser.close();
          return;
        } catch (pdfError) {
          console.error('Không thể tạo PDF:', pdfError);
        }
        
        // Lấy nội dung HTML nếu không tạo được PDF
        const content = await page.content();
        const fileName = url.split('/').pop().split('?')[0] || 'topcv-content';
        const uniqueFileName = `${Date.now()}-${fileName}.html`;
        const filePath = path.join(uploadsDir, uniqueFileName);
        
        fs.writeFileSync(filePath, content);
        console.log(`Đã lưu nội dung topcv: ${filePath}`);
        
        // Trả về kết quả
        const downloadUrl = `/download/${uniqueFileName}`;
        res.json({
          success: true,
          downloadUrl: downloadUrl,
          fileName: fileName,
          note: "Đã lưu nội dung trang từ topcv.vn"
        });
        
        await browser.close();
        return;
      } catch (puppeteerError) {
        console.error('Lỗi khi xử lý topcv với puppeteer:', puppeteerError);
      }
    }
    
    // Thử phương pháp 3: Mô phỏng hành vi tải xuống
    console.log(`Đang tải file từ: ${url} bằng phương pháp mô phỏng hành vi người dùng`);
    
    try {
      // Kiểm tra xem có cần đăng nhập không
      if (loginAction) {
        console.log('Đang thực hiện đăng nhập...');
        await page.goto(loginAction.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Điền thông tin đăng nhập
        await page.type(loginAction.usernameSelector, loginAction.username);
        await page.type(loginAction.passwordSelector, loginAction.password);
        
        // Nhấn nút đăng nhập
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          page.click(loginAction.submitButtonSelector)
        ]);
        
        console.log('Đăng nhập thành công!');
      }
      
      // Đi đến URL chứa file cần tải
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle2', 
          timeout: 90000 // Tăng timeout lên 90 giây
        });
        console.log('Đã mở trang web chứa file');
      } catch (navError) {
        console.error('Lỗi điều hướng trang:', navError);
        // Kiểm tra xem trang có tải một phần không
        const pageContent = await page.content();
        if (pageContent && pageContent.length > 100) {
          console.log('Trang đã tải một phần mặc dù có lỗi điều hướng, tiếp tục xử lý...');
        } else {
          throw new Error(`Không thể tải trang: ${navError.message}`);
        }
      }
      
      // Nếu có selector cho nút tải xuống, click vào nó
      if (downloadButtonSelector) {
        console.log(`Nhấp vào nút tải xuống: ${downloadButtonSelector}`);
        await page.waitForSelector(downloadButtonSelector, { visible: true, timeout: 10000 });
        await page.click(downloadButtonSelector);
        
        // Đợi file tải về
        console.log('Đang đợi file tải về...');
        await page.waitForTimeout(5000);
      }
      
      // Đợi file tải về
      let downloadedFilePath = null;
      let attempts = 0;
      const maxAttempts = 20; // Tăng số lần thử
      
      // Hàm kiểm tra file tải xuống
      const checkDownloadedFile = () => {
        const files = fs.readdirSync(downloadPath);
        if (files.length > 0) {
          // Lọc ra các file không phải là tạm thời
          const validFiles = files.filter(file => !file.endsWith('.crdownload') && !file.endsWith('.tmp'));
          
          if (validFiles.length > 0) {
            // Lấy file mới nhất
            const sortedFiles = validFiles.map(file => ({
              name: file,
              path: path.join(downloadPath, file),
              ctime: fs.statSync(path.join(downloadPath, file)).ctime.getTime()
            })).sort((a, b) => b.ctime - a.ctime);
            
            if (sortedFiles.length > 0) {
              return sortedFiles[0].path;
            }
          }
        }
        return null;
      };
      
      while (!downloadedFilePath && attempts < maxAttempts) {
        // Kiểm tra xem file đã tải về chưa
        downloadedFilePath = checkDownloadedFile();
        
        if (downloadedFilePath) {
          console.log(`Đã tìm thấy file tải về: ${downloadedFilePath}`);
          break;
        }
        
        console.log(`Đang đợi file tải về... (lần thử ${attempts + 1}/${maxAttempts})`);
        await page.waitForTimeout(2000); // Tăng thời gian đợi mỗi lần
        attempts++;
      }
      
      // Thử phương pháp thay thế sử dụng DOM nếu không tìm thấy file
      if (!downloadedFilePath) {
        console.log('Thử cách khác: Kiểm tra phản hồi của trang');
        
        // Kiểm tra xem trang có chứa dữ liệu có thể tải về không
        try {
          const contentType = await page.evaluate(() => {
            // Tìm các phần tử có thể chứa nội dung
            const contentElement = document.querySelector('pre, code, body');
            if (contentElement) {
              // Kiểm tra content-type trong meta tags
              const metaContentType = document.querySelector('meta[http-equiv="Content-Type"]');
              if (metaContentType) {
                return metaContentType.content;
              }
              return 'text/html'; // Mặc định
            }
            return null;
          });
          
          if (contentType) {
            // Lấy nội dung trang
            const content = await page.content();
            const tempFilePath = path.join(uploadsDir, `${Date.now()}-direct_content.html`);
            fs.writeFileSync(tempFilePath, content);
            downloadedFilePath = tempFilePath;
          }
        } catch (domError) {
          console.error('Lỗi khi kiểm tra DOM:', domError);
        }
      }
      
      if (!downloadedFilePath) {
        console.log('Không tìm thấy file tải về sau nhiều lần thử');
        
        // Trích xuất nội dung trang
        const pageContent = await page.content();
        const tempFilePath = path.join(uploadsDir, `${Date.now()}-page_content.html`);
        fs.writeFileSync(tempFilePath, pageContent);
        
        // Ném lỗi để chuyển sang phương pháp tiếp theo
        throw new Error('Không tìm thấy file tải về');
      }
      
      // Đọc file đã tải
      const downloadedFileName = path.basename(downloadedFilePath);
      const uniqueFileName = `${Date.now()}-${downloadedFileName}`;
      const finalFilePath = path.join(uploadsDir, uniqueFileName);
      
      // Di chuyển file từ thư mục tạm sang thư mục chính
      fs.copyFileSync(downloadedFilePath, finalFilePath);
      fs.unlinkSync(downloadedFilePath);
      
      // Tạo URL mới để tải file
      const downloadUrl = `/download/${uniqueFileName}`;
      
      console.log(`File đã được lưu tại: ${finalFilePath}`);
      res.json({
        success: true,
        downloadUrl: downloadUrl,
        fileName: downloadedFileName,
        note: "Phương pháp mô phỏng hành vi người dùng thành công"
      });
      
      return;
    } catch (simulationError) {
      console.error('Lỗi khi mô phỏng hành vi tải xuống:', simulationError);
      
      // Tiếp tục với các phương pháp trước đó
      console.log('Thử phương pháp thay thế...');
    }

    // Tạo tên file duy nhất cho các phương pháp khác
    const urlParts = url.split('/');
    const fileName = urlParts[urlParts.length - 1].split('?')[0] || 'downloaded_file';
    const uniqueFileName = `${Date.now()}-${fileName}`;
    const filePath = path.join(uploadsDir, uniqueFileName);

    // Phương pháp 1: Tải trực tiếp từ URL bằng cách download buffer
    try {
      console.log(`Đang tải file từ: ${url} bằng phương pháp 1`);
      
      const response = await page.evaluate(async (targetUrl, reqHeaders) => {
        try {
          const fetchOptions = {
            method: 'GET',
            headers: {
              ...reqHeaders,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
            },
            credentials: 'include'
          };
          
          const response = await fetch(targetUrl, fetchOptions);
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const buffer = await response.arrayBuffer();
          return Array.from(new Uint8Array(buffer));
        } catch (e) {
          return { error: e.toString() };
        }
      }, url, headers);

      if (response && response.error) {
        throw new Error(`Lỗi khi tải file: ${response.error}`);
      }

      // Lưu file
      fs.writeFileSync(filePath, Buffer.from(response));
      console.log(`File đã được lưu tại: ${filePath}`);

      // Tạo URL mới để tải file
      const downloadUrl = `/download/${uniqueFileName}`;
      
      res.json({
        success: true,
        downloadUrl: downloadUrl,
        fileName: fileName
      });
      
      return;
    } catch (directError) {
      console.error('Lỗi tải trực tiếp (phương pháp 1):', directError);
      
      // Phương pháp 2: Thử mở trang và lưu nội dung
      try {
        console.log(`Đang tải file từ: ${url} bằng phương pháp 2`);
        
        // Không cần thiết lập lại request interception
        // await page.setRequestInterception(false);
        
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        // Đợi để trang tải xong
        await page.waitForTimeout(2000);
        
        // Lưu nội dung trang
        const content = await page.content();
        fs.writeFileSync(filePath, content);
        
        // Tạo URL mới để tải file
        const downloadUrl = `/download/${uniqueFileName}`;
        
        res.json({
          success: true,
          downloadUrl: downloadUrl,
          fileName: fileName,
          note: "Phương pháp dự phòng được sử dụng"
        });
        
        return;
      } catch (navigateError) {
        console.error('Lỗi phương pháp 2:', navigateError);
        throw new Error(`Không thể tải file: ${directError.message}. Lỗi điều hướng: ${navigateError.message}`);
      }
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Có lỗi xảy ra khi tải file',
      message: error.message
    });
  }
});

// API endpoint để phục vụ file đã tải
app.get('/download/:fileName', (req, res) => {
  try {
    const fileName = req.params.fileName;
    const filePath = path.join(uploadsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File không tồn tại' });
    }

    // Gửi file
    res.download(filePath, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      // Xóa file sau khi đã tải xong
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Error deleting file:', err);
        }
      });
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Có lỗi xảy ra khi phục vụ file' });
  }
});

async function scrapeData(url) {
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-web-security', 
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      '--window-size=1920,1080',
      '--disable-dev-shm-usage',
      '--ignore-certificate-errors'
    ]
  });
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
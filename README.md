# API Scraping và Tải File

API này cung cấp hai chức năng chính:
1. Scrape dữ liệu JSON từ trang web
2. Tải file từ URL với 3 phương pháp khác nhau để vượt qua bảo mật

## Cài đặt

```bash
# Sử dụng Bun
bun install

# Chạy server
bun --watch start
```

## API Endpoints

### 1. Scrape dữ liệu JSON

```
POST /scrape
```

Body:
```json
{
  "url": "https://example.com/api/data"
}
```

### 2. Tải file từ URL

```
POST /download
```

#### Cách 1: Tải file đơn giản
```json
{
  "url": "https://example.com/file.pdf"
}
```

#### Cách 2: Tải file với headers tùy chỉnh
```json
{
  "url": "https://www.topcv.vn/download-cv?accessKey=xxx",
  "headers": {
    "Cookie": "your_session_cookie",
    "Referer": "https://www.topcv.vn/"
  }
}
```

#### Cách 3: Mô phỏng click nút tải xuống
```json
{
  "url": "https://www.topcv.vn/download-cv?accessKey=xxx",
  "downloadButtonSelector": "button.download-btn"
}
```

#### Cách 4: Tải file với đăng nhập trước
```json
{
  "url": "https://www.topcv.vn/download-cv?accessKey=xxx",
  "loginAction": {
    "url": "https://www.topcv.vn/login",
    "usernameSelector": "input[name='email']",
    "passwordSelector": "input[name='password']",
    "username": "your_email",
    "password": "your_password",
    "submitButtonSelector": "button[type='submit']"
  },
  "downloadButtonSelector": "button.download-btn"
}
```

#### Cách 5: Sử dụng Browserless.io
```json
{
  "url": "https://www.topcv.vn/download-cv?accessKey=xxx",
  "browserlessApiKey": "your-browserless-api-key",
  "downloadButtonSelector": "button.download-btn"
}
```

### 3. Tải file từ URL đã tạo
```
GET /download/:fileId
```

## Chú ý

1. API tự động xóa file sau khi đã tải xong để tiết kiệm dung lượng.
2. Có ba phương pháp tải file, sẽ thử lần lượt từng phương pháp:
   - Phương pháp 1: Mô phỏng hành vi người dùng (click nút tải)
   - Phương pháp 2: Tải trực tiếp qua fetch API
   - Phương pháp 3: Lưu nội dung trang HTML

3. Nếu sử dụng Browserless, bạn cần đăng ký tài khoản tại [browserless.io](https://www.browserless.io/) và lấy API key. 
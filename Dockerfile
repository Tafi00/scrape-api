FROM oven/bun:1 AS base

# Tạo thư mục làm việc trong container
WORKDIR /usr/src/app

# Sao chép package.json và package-lock.json (nếu có)
COPY package*.json ./

RUN mkdir -p ./uploads
# Cài đặt các dependencies
RUN bun install

# Sao chép source code vào container
COPY . .

# Mở cổng mà ứng dụng sẽ chạy
EXPOSE 4334

# Chạy ứng dụng
CMD ["bun", "index.js"]



# แก้ไขปัญหา WebSocket บน Domain

## ปัญหา
- ✅ ใช้ IP (`http://43.229.132.32:8090`) → ลากรถได้ปกติ
- ❌ ใช้ Domain (`https://survey.thymez-tick.com`) → รถเด้งกลับ

## สาเหตุ
เมื่อใช้ domain กับ HTTPS, WebSocket ต้องใช้ **WSS** (WebSocket Secure) และต้องผ่าน reverse proxy เดียวกับ HTTP requests

## การแก้ไข

### 1. แก้ไข WebSocket URL (เสร็จแล้ว ✅)
ไฟล์: `pages/index.js`

```javascript
// ตรวจสอบว่าใช้ HTTPS หรือ domain
if (isHttps || hostname.includes('.')) {
  // Production domain - ใช้ same origin (ไม่ระบุ port)
  wsUrl = `${window.location.protocol}//${hostname}`;
} else {
  // Development IP - ใช้ port 8091
  wsUrl = `${window.location.protocol}//${hostname}:8091`;
}
```

### 2. ตั้งค่า Reverse Proxy (ต้องทำ ⚠️)

คุณต้องตั้งค่า reverse proxy (Nginx/Apache) ให้ forward WebSocket connections ไปที่ backend server

#### Nginx Configuration

เพิ่มใน nginx config ของ `survey.thymez-tick.com`:

```nginx
# WebSocket proxy for Socket.IO
location /socket.io/ {
    proxy_pass http://localhost:8091;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Timeouts
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
    proxy_read_timeout 7d;
}

# API proxy (ถ้ายังไม่มี)
location /api/ {
    proxy_pass http://localhost:8091;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Next.js frontend
location / {
    proxy_pass http://localhost:8090;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

#### Apache Configuration

ถ้าใช้ Apache:

```apache
# Enable required modules
# a2enmod proxy proxy_http proxy_wstunnel rewrite

<VirtualHost *:443>
    ServerName survey.thymez-tick.com
    
    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem
    
    # WebSocket proxy
    ProxyPass /socket.io/ ws://localhost:8091/socket.io/
    ProxyPassReverse /socket.io/ ws://localhost:8091/socket.io/
    
    # API proxy
    ProxyPass /api/ http://localhost:8091/api/
    ProxyPassReverse /api/ http://localhost:8091/api/
    
    # Frontend proxy
    ProxyPass / http://localhost:8090/
    ProxyPassReverse / http://localhost:8090/
    
    # WebSocket upgrade headers
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)           ws://localhost:8091/$1 [P,L]
</VirtualHost>
```

### 3. ทดสอบการเชื่อมต่อ

หลังจากตั้งค่า reverse proxy แล้ว:

1. Restart web server:
```bash
# Nginx
sudo systemctl restart nginx

# Apache
sudo systemctl restart apache2
```

2. เปิด browser console บน `https://survey.thymez-tick.com`

3. ดูว่ามี log:
```
🔌 Connecting to WebSocket: https://survey.thymez-tick.com
WebSocket connected
```

4. ลองลากรถ → ควรไม่เด้งกลับแล้ว

### 4. Debug WebSocket Connection

ถ้ายังไม่ได้ ตรวจสอบ:

```bash
# ดู WebSocket connections
sudo netstat -tulpn | grep 8091

# ดู nginx/apache error logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/apache2/error.log

# ดู backend logs
pm2 logs app-survey-backend
```

## สรุป

### ก่อนแก้ไข
- IP: `http://43.229.132.32:8090` → WebSocket: `http://43.229.132.32:8091` ✅
- Domain: `https://survey.thymez-tick.com` → WebSocket: `https://survey.thymez-tick.com:8091` ❌ (ไม่มี SSL cert บน port 8091)

### หลังแก้ไข
- IP: `http://43.229.132.32:8090` → WebSocket: `http://43.229.132.32:8091` ✅
- Domain: `https://survey.thymez-tick.com` → WebSocket: `https://survey.thymez-tick.com/socket.io/` ✅ (ผ่าน reverse proxy)

## ไฟล์ที่แก้ไข
- `pages/index.js` - เปลี่ยน WebSocket URL logic

## ขั้นตอนต่อไป
1. ✅ แก้โค้ด WebSocket URL (เสร็จแล้ว)
2. ⚠️ ตั้งค่า reverse proxy บน server
3. ✅ Restart web server
4. ✅ ทดสอบบน domain

หลังจากตั้งค่า reverse proxy แล้ว ทั้ง IP และ Domain จะใช้งานได้ปกติ!

# ตั้งค่า WebSocket ใน Nginx Proxy Manager

## ปัญหา
คุณใช้ **Nginx Proxy Manager** (Docker) อยู่แล้ว ซึ่งทำงานบน port 80 และ 443
ดังนั้นต้องตั้งค่า WebSocket ใน Nginx Proxy Manager แทน

## วิธีแก้ไข

### 1. เข้า Nginx Proxy Manager Admin Panel

เปิด browser ไปที่:
```
http://43.229.132.32:81
```

หรือ
```
http://survey.thymez-tick.com:81
```

Login ด้วย admin credentials ของคุณ

### 2. แก้ไข Proxy Host สำหรับ survey.thymez-tick.com

1. คลิกที่ **Proxy Hosts**
2. หา `survey.thymez-tick.com` แล้วคลิก **Edit** (ไอคอน 3 จุด)

### 3. ตั้งค่า Details Tab

**Domain Names:**
```
survey.thymez-tick.com
```

**Scheme:** `http`

**Forward Hostname / IP:** `localhost` หรือ `127.0.0.1`

**Forward Port:** `8090` (Next.js frontend)

**เปิด:**
- ✅ Cache Assets
- ✅ Block Common Exploits
- ✅ Websockets Support (สำคัญมาก!)

### 4. ตั้งค่า SSL Tab

**SSL Certificate:** เลือก certificate ของ survey.thymez-tick.com

**เปิด:**
- ✅ Force SSL
- ✅ HTTP/2 Support
- ✅ HSTS Enabled

### 5. ตั้งค่า Custom Locations (สำคัญที่สุด!)

ไปที่ **Custom Locations** tab แล้วเพิ่ม 2 locations:

#### Location 1: WebSocket (Socket.IO)

```
Define Location: /socket.io/
Scheme: http
Forward Hostname / IP: localhost
Forward Port: 8091
```

**Custom config:**
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_connect_timeout 7d;
proxy_send_timeout 7d;
proxy_read_timeout 7d;
proxy_buffering off;
```

**เปิด:**
- ✅ Websockets Support

#### Location 2: API Backend

```
Define Location: /api/
Scheme: http
Forward Hostname / IP: localhost
Forward Port: 8091
```

**Custom config:**
```nginx
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

### 6. บันทึกการตั้งค่า

คลิก **Save** ทุก location และ **Save** proxy host

### 7. ทดสอบ

1. เปิด `https://survey.thymez-tick.com`
2. เปิด Browser Console (F12)
3. ดู log ควรเห็น:
   ```
   🔌 Connecting to WebSocket: https://survey.thymez-tick.com
   WebSocket connected
   ```
4. **ลองลากรถ → ไม่ควรเด้งกลับแล้ว!** ✅

## สรุปการตั้งค่า

### Main Proxy Host
- **Domain:** survey.thymez-tick.com
- **Forward to:** localhost:8090 (Next.js)
- **Websockets:** ✅ เปิด
- **SSL:** ✅ เปิด Force SSL

### Custom Location 1: /socket.io/
- **Forward to:** localhost:8091
- **Websockets:** ✅ เปิด
- **Custom config:** มี proxy headers สำหรับ WebSocket

### Custom Location 2: /api/
- **Forward to:** localhost:8091
- **Custom config:** มี proxy headers ปกติ

## Debug

### ตรวจสอบว่า PM2 รันอยู่
```bash
pm2 status

# ควรเห็น:
# app-survey-backend (port 8091) - online
# app-survey-frontend (port 8090) - online
```

### ตรวจสอบ Nginx Proxy Manager logs
```bash
docker logs docker-app-1 -f
```

### ทดสอบ WebSocket connection
เปิด Browser DevTools → Network tab → Filter: WS
ควรเห็น connection ไปที่ `/socket.io/` status 101 Switching Protocols

## ผลลัพธ์

หลังจากตั้งค่าเสร็จ:
- ✅ เข้าจาก IP: `http://43.229.132.32:8090` → ใช้งานได้
- ✅ เข้าจาก Domain: `https://survey.thymez-tick.com` → ใช้งานได้
- ✅ WebSocket realtime ทำงานทั้ง IP และ Domain
- ✅ ลากรถไม่เด้งกลับทั้งคอมและมือถือ

## หมายเหตุ

- ไม่ต้องใช้ไฟล์ `nginx-config-survey.conf` ที่สร้างไว้ เพราะคุณใช้ Nginx Proxy Manager
- Nginx Proxy Manager จะจัดการ SSL และ reverse proxy ให้อัตโนมัติ
- ตั้งค่าผ่าน Web UI ง่ายกว่าแก้ไข config file

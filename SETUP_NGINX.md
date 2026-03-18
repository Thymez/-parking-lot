# คำแนะนำตั้งค่า Nginx สำหรับ survey.thymez-tick.com

## ขั้นตอนการตั้งค่า (ทำตามลำดับ)

### 1. คัดลอกไฟล์ Config

```bash
# คัดลอกไฟล์ config ไปยัง Nginx
sudo cp /root/app-survey/nginx-config-survey.conf /etc/nginx/sites-available/survey.thymez-tick.com

# ตรวจสอบว่าคัดลอกสำเร็จ
ls -la /etc/nginx/sites-available/survey.thymez-tick.com
```

### 2. แก้ไข SSL Certificate Path (ถ้าจำเป็น)

```bash
# แก้ไขไฟล์ config
sudo nano /etc/nginx/sites-available/survey.thymez-tick.com
```

**ตรวจสอบบรรทัดเหล่านี้:**
```nginx
ssl_certificate /etc/letsencrypt/live/survey.thymez-tick.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/survey.thymez-tick.com/privkey.pem;
```

**ถ้า SSL cert อยู่ที่อื่น ให้แก้ path ให้ถูกต้อง**

ตรวจสอบ SSL cert ของคุณ:
```bash
# ดู SSL cert ที่มี
sudo ls -la /etc/letsencrypt/live/
sudo ls -la /etc/ssl/certs/
```

### 3. สร้าง Symbolic Link (Enable Site)

```bash
# สร้าง symlink ไปยัง sites-enabled
sudo ln -s /etc/nginx/sites-available/survey.thymez-tick.com /etc/nginx/sites-enabled/

# ตรวจสอบว่าสร้างสำเร็จ
ls -la /etc/nginx/sites-enabled/ | grep survey
```

### 4. ลบ Default Config (ถ้ามี)

```bash
# ลบ default config ที่อาจจะขัดแย้ง
sudo rm /etc/nginx/sites-enabled/default

# หรือถ้าไม่แน่ใจ ให้ disable ไว้ก่อน
sudo mv /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.disabled
```

### 5. ทดสอบ Config

```bash
# ทดสอบว่า config ถูกต้องหรือไม่
sudo nginx -t
```

**ถ้าขึ้น:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```
แสดงว่าถูกต้อง ✅

**ถ้าขึ้น error:** แก้ไขตาม error message ที่แสดง

### 6. Reload Nginx

```bash
# Reload Nginx เพื่อใช้ config ใหม่
sudo systemctl reload nginx

# หรือ restart ถ้า reload ไม่ได้
sudo systemctl restart nginx

# ตรวจสอบสถานะ
sudo systemctl status nginx
```

### 7. ตรวจสอบว่า PM2 รันอยู่

```bash
# ตรวจสอบว่า backend และ frontend รันอยู่
pm2 status

# ควรเห็น:
# app-survey-backend (port 8091) - online
# app-survey-frontend (port 8090) - online
```

**ถ้าไม่รัน:**
```bash
cd /root/app-survey
pm2 start ecosystem.config.js
pm2 save
```

### 8. ทดสอบการเชื่อมต่อ

#### A. ทดสอบ HTTP → HTTPS Redirect
```bash
curl -I http://survey.thymez-tick.com
# ควรเห็น: HTTP/1.1 301 Moved Permanently
# Location: https://survey.thymez-tick.com/
```

#### B. ทดสอบ HTTPS
```bash
curl -I https://survey.thymez-tick.com
# ควรเห็น: HTTP/2 200
```

#### C. ทดสอบ API
```bash
curl https://survey.thymez-tick.com/api/stats
# ควรได้ JSON response กลับมา
```

### 9. ทดสอบบน Browser

1. เปิด `https://survey.thymez-tick.com`
2. เปิด Browser Console (F12)
3. ดู log ควรเห็น:
   ```
   🔌 Connecting to WebSocket: https://survey.thymez-tick.com
   WebSocket connected
   ```
4. **ลองลากรถ → ไม่ควรเด้งกลับแล้ว!** ✅

### 10. ทดสอบ Realtime (2 เครื่อง)

1. เปิดบนคอม: `https://survey.thymez-tick.com`
2. เปิดบนมือถือ: `https://survey.thymez-tick.com`
3. ลากรถบนคอม → มือถือควรเห็นแบบ realtime
4. ลากรถบนมือถือ → คอมควรเห็นแบบ realtime

## 🔧 Debug ถ้ามีปัญหา

### ปัญหา: WebSocket ไม่เชื่อมต่อ

```bash
# ดู Nginx error log
sudo tail -f /var/log/nginx/survey-error.log

# ดู Backend log
pm2 logs app-survey-backend

# ตรวจสอบ port 8091 ว่าเปิดอยู่
sudo netstat -tulpn | grep 8091
```

### ปัญหา: SSL Certificate Error

```bash
# ตรวจสอบ SSL cert
sudo certbot certificates

# Renew SSL cert ถ้าหมดอายุ
sudo certbot renew

# Restart Nginx หลัง renew
sudo systemctl restart nginx
```

### ปัญหา: 502 Bad Gateway

```bash
# ตรวจสอบว่า backend รันอยู่
pm2 status

# Restart backend
pm2 restart app-survey-backend

# ตรวจสอบ log
pm2 logs app-survey-backend --lines 50
```

### ปัญหา: รถยังเด้งกลับ

```bash
# ตรวจสอบว่า WebSocket connected หรือไม่
# เปิด Browser Console แล้วดู:
# - ถ้าเห็น "WebSocket connected" = ✅ ดี
# - ถ้าไม่เห็น = ❌ WebSocket ไม่ได้เชื่อมต่อ

# ตรวจสอบ Network tab ใน Browser DevTools
# ดูว่ามี request ไปที่ /socket.io/ หรือไม่
# Status ควรเป็น 101 Switching Protocols
```

## 📋 Checklist

- [ ] คัดลอกไฟล์ config ไปยัง `/etc/nginx/sites-available/`
- [ ] แก้ไข SSL certificate path (ถ้าจำเป็น)
- [ ] สร้าง symbolic link ไปยัง `sites-enabled`
- [ ] ทดสอบ config ด้วย `sudo nginx -t`
- [ ] Reload Nginx
- [ ] ตรวจสอบ PM2 รันอยู่
- [ ] ทดสอบ HTTP redirect
- [ ] ทดสอบ HTTPS
- [ ] ทดสอบ WebSocket connection
- [ ] ทดสอบลากรถไม่เด้งกลับ
- [ ] ทดสอบ realtime บน 2 เครื่อง

## 🎯 สรุป

หลังจากทำตามขั้นตอนทั้งหมดแล้ว:
- ✅ เข้าจาก IP: `http://43.229.132.32:8090` → ใช้งานได้
- ✅ เข้าจาก Domain: `https://survey.thymez-tick.com` → ใช้งานได้
- ✅ WebSocket realtime ทำงานทั้ง IP และ Domain
- ✅ ลากรถไม่เด้งกลับทั้งคอมและมือถือ

ถ้ามีปัญหาตรงไหน บอกได้เลยครับ!

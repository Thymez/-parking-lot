# การแก้ไขปัญหา Server ล่มบ่อย

## 📋 สรุปปัญหาที่พบ

### 1. ⚠️ ไม่มี Global Error Handlers (แก้ไขแล้ว ✅)
**ปัญหา:** Server จะ crash ทันทีเมื่อเกิด uncaught exception หรือ unhandled promise rejection

**แก้ไข:**
- เพิ่ม `process.on('uncaughtException')` handler
- เพิ่ม `process.on('unhandledRejection')` handler
- เพิ่ม graceful shutdown สำหรับ SIGTERM และ SIGINT

### 2. ⚠️ Database Connection ไม่มี Error Handling (แก้ไขแล้ว ✅)
**ปัญหา:** ถ้า database file corrupt หรือ locked จะทำให้ server crash

**แก้ไข:**
- ใช้ try-catch ครอบการเชื่อมต่อ database
- ปิด server อย่างถูกต้องถ้าเชื่อมต่อ database ไม่ได้

### 3. ⚠️ Synchronous bcrypt Operations (แก้ไขแล้ว ✅)
**ปัญหา:** `bcrypt.hashSync()` และ `bcrypt.compareSync()` block event loop

**แก้ไข:**
- เปลี่ยนเป็น `bcrypt.hash()` และ `bcrypt.compare()` (async)
- ทำให้ login/register endpoints เป็น async functions

### 4. ⚠️ WebSocket ไม่มี Error Handlers (แก้ไขแล้ว ✅)
**ปัญหา:** เมื่อ client disconnect ผิดปกติอาจทำให้ server crash

**แก้ไข:**
- เพิ่ม `socket.on('error')` handler
- เพิ่ม `io.on('error')` handler
- Log disconnect reason เพื่อ debug

### 5. ⚠️ API Endpoints ไม่มี Error Handling (แก้ไขแล้ว ✅)
**ปัญหา:** ถ้า database query error จะทำให้ server crash

**แก้ไข:**
- ครอบทุก endpoint ด้วย try-catch
- Return proper error response แทนการ crash

### 6. ⚠️ ไม่มี Request Timeout (แก้ไขแล้ว ✅)
**ปัญหา:** Request ที่ค้างนานเกินไปจะกิน memory

**แก้ไข:**
- ตั้ง request timeout 30 วินาที
- เพิ่ม global error handler middleware

### 7. ⚠️ Memory Leak จาก requestAnimationFrame (แก้ไขแล้ว ✅)
**ปัญหา:** `MapView.js` ใช้ `requestAnimationFrame` วนลูปตลอดเวลา กิน CPU และ Memory สูง

**แก้ไข:**
- เปลี่ยนเป็น conditional animation - animate เฉพาะตอนมี interaction
- เมื่อไม่มี interaction จะ draw เพียงครั้งเดียว
- ลด CPU usage และ Memory leak อย่างมาก

## 🔧 การแก้ไขที่ทำไปแล้ว

### ไฟล์: `server/index.js`

1. **เพิ่ม Process Error Handlers (บรรทัด 11-36)**
```javascript
process.on('uncaughtException', (error) => {
  console.error('❌ [CRITICAL] Uncaught Exception:', error);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    if (db) db.close();
    process.exit(0);
  });
});
```

2. **Database Connection Error Handling (บรรทัด 57-64)**
```javascript
let db;
try {
  db = new Database(path.join(__dirname, 'parking.db'));
  console.log('✅ Database connected successfully');
} catch (error) {
  console.error('❌ [CRITICAL] Failed to connect to database:', error);
  process.exit(1);
}
```

3. **Request Timeout Middleware (บรรทัด 57-66)**
```javascript
app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

app.use((err, req, res, next) => {
  console.error('❌ [EXPRESS ERROR]:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});
```

4. **Async bcrypt Operations (บรรทัด 145-167, 169-192)**
```javascript
// Login endpoint - ใช้ bcrypt.compare() แทน compareSync()
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

5. **WebSocket Error Handlers (บรรทัด 742-756)**
```javascript
io.on('connection', (socket) => {
  console.log('✅ [WEBSOCKET] Client connected:', socket.id, '| Total clients:', io.engine.clientsCount);

  socket.on('error', (error) => {
    console.error('❌ [WEBSOCKET] Socket error:', socket.id, error);
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ [WEBSOCKET] Client disconnected:', socket.id, '| Reason:', reason, '| Remaining clients:', io.engine.clientsCount);
  });
});

io.on('error', (error) => {
  console.error('❌ [WEBSOCKET] IO error:', error);
});
```

6. **Try-Catch ทุก API Endpoints**
- ครอบทุก endpoint ด้วย try-catch
- Return proper error response พร้อม error message

### 8. ⚠️ ไม่มี Rate Limiting (แก้ไขแล้ว ✅)
**ปัญหา:** ไม่มีการจำกัดจำนวน request ต่อ IP อาจถูก DDoS หรือ brute force attack

**แก้ไข:**
- เพิ่ม API rate limiter: 100 requests/15 นาที (production), 1000 requests/15 นาที (development)
- เพิ่ม Auth rate limiter: 5 login attempts/15 นาที
- ป้องกัน brute force attacks บน login/register endpoints

### 9. ⚠️ Environment Variables (แก้ไขแล้ว ✅)
**ปัญหา:** JWT_SECRET hardcoded ในโค้ด ไม่ปลอดภัย

**แก้ไข:**
- ใช้ dotenv สำหรับจัดการ environment variables
- อ่าน JWT_SECRET, PORT, NODE_ENV จาก .env file
- อัพเดท .env.example พร้อมตัวอย่าง

### 10. ⚠️ Database Performance (แก้ไขแล้ว ✅)
**ปัญหา:** ใช้ default SQLite settings ทำให้ performance ไม่ดี

**แก้ไข:**
- เปิดใช้ WAL (Write-Ahead Logging) mode เพื่อ concurrent reads
- ตั้ง cache_size = 64MB เพื่อเพิ่ม performance
- ตั้ง temp_store = MEMORY เพื่อใช้ RAM แทน disk
- ตั้ง synchronous = NORMAL เพื่อ balance ระหว่าง speed และ safety

## 📊 ปัญหาเพิ่มเติมที่ควรพิจารณา

### 1. Logging System (ยังไม่มี)

### 2. Logging System
**ปัญหา:** ใช้ console.log ธรรมดา ไม่มี log rotation

**แนะนำ:**
```javascript
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### 3. Health Check Endpoint
**ปัญหา:** ไม่มี endpoint สำหรับตรวจสอบ server health

**แนะนำ:**
```javascript
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});
```

## 🚀 คำแนะนำการ Deploy

### 1. ใช้ PM2 Ecosystem Config (มีอยู่แล้ว ✅)
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 2. Monitor Memory Usage
```bash
pm2 monit
```

### 3. ตรวจสอบ Logs
```bash
pm2 logs app-survey-backend
pm2 logs app-survey-frontend
```

### 4. Restart Policy
- PM2 จะ auto-restart เมื่อ crash (autorestart: true)
- จะ restart เมื่อใช้ memory เกิน 1GB (max_memory_restart: '1G')

## 📈 การ Monitor

### ตรวจสอบ Server Health
```bash
# ดู process status
pm2 status

# ดู memory usage
pm2 monit

# ดู logs แบบ real-time
pm2 logs --lines 100

# ดู error logs
tail -f logs/backend-error.log
```

### Metrics ที่ควรติดตาม
1. **Memory Usage** - ควรไม่เกิน 800MB (limit คือ 1GB)
2. **CPU Usage** - ควรไม่เกิน 80%
3. **Response Time** - ควรไม่เกิน 1000ms
4. **Error Rate** - ควรไม่เกิน 1%
5. **WebSocket Connections** - ติดตามจำนวน active connections

## ✅ สรุป

การแก้ไขที่ทำไปแล้วจะช่วย:
1. ✅ ป้องกัน server crash จาก uncaught errors
2. ✅ จัดการ database errors อย่างถูกต้อง
3. ✅ ลด event loop blocking จาก bcrypt
4. ✅ จัดการ WebSocket errors
5. ✅ ป้องกัน hanging requests ด้วย timeout
6. ✅ Graceful shutdown เมื่อได้รับ SIGTERM/SIGINT

Server ควรจะเสถียรขึ้นมาก แต่ยังควรติดตาม memory usage และพิจารณาแก้ไข requestAnimationFrame ใน MapView.js เพื่อลด memory leak ในระยะยาว

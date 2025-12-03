# Image Collage Feature - Setup Instructions

## 1. ติดตั้ง Python Dependencies

```bash
cd python-service
pip install -r requirements.txt
```

## 2. รัน Python Service

```bash
# ใน terminal แยก
cd python-service
python main.py
```

หรือ

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 3. เพิ่ม Environment Variable

เพิ่มใน `.env`:

```env
PYTHON_SERVICE_URL=http://localhost:8000
```

## 4. รัน Next.js

```bash
# ใน terminal หลัก
npm run dev
```

## 5. ทดสอบ Collage Feature

1. เข้า Dashboard
2. สร้างงานใหม่
3. เลือกรูปอ้างอิงมากกว่า 1 รูป
4. เปิดใช้ "สร้าง Collage ก่อนเจนรูป"
5. เลือก Template (หรือปล่อยให้สุ่มอัตโนมัติ)
6. คลิก "สร้างภาพ"

## Deployment

### Vercel

**Option A: Python Runtime (แนะนำ)**

1. สร้าง `api/collage.py` ใน root:

```python
from python-service.main import app

# Vercel จะ host ใน /api/collage
handler = app
```

2. ตั้ง environment variable:
```
PYTHON_SERVICE_URL=https://your-app.vercel.app/api
```

**Option B: Deploy Python Service แยก**

1. Deploy Python service บน Railway/Render:
```bash
# Railway
railway up

# Render
render deploy
```

2. ตั้ง environment variable:
```
PYTHON_SERVICE_URL=https://your-python-service.railway.app
```

## Troubleshooting

### Python service ไม่ทำงาน
- ตรวจสอบ port 8000 ว่างหรือไม่
- ลอง `pip install -r requirements.txt` อีกครั้ง

### รูป collage ไม่แสดง
- ตรวจสอบ PYTHON_SERVICE_URL ใน .env
- เช็ค console logs ใน terminal

### DALL-E ไม่เห็น collage
- ตรวจสอบว่า collage URL ถูก upload ไป Vercel Blob
- เช็ค Job Logs ใน admin panel

# แก้ปัญหารูปภาพไม่แสดงใน Google Drive

## สาเหตุที่รูปไม่แสดง

1. **Google Drive Permissions** - รูปไม่ได้ตั้งเป็น public หรือ service account ไม่มีสิทธิ์เข้าถึง
2. **URL Format** - URL ที่ใช้ไม่ถูกต้องหรือหมดอายุ
3. **CORS Issues** - Next.js Image component ไม่สามารถโหลดรูปจาก Google Drive ได้
4. **Next.js Image Configuration** - domain ไม่ได้ถูก whitelist

## วิธีแก้ไข

### 1. ตั้งค่า Google Drive Permissions

สำหรับรูปภาพแต่ละไฟล์ใน Google Drive:

```bash
# ตัวเลือก A: ทำให้ไฟล์เป็น Public
1. คลิกขวาที่ไฟล์
2. เลือก "Share" หรือ "แชร์"
3. เปลี่ยน "Restricted" เป็น "Anyone with the link"
4. ตั้งสิทธิ์เป็น "Viewer"
5. คลิก "Copy link"

# ตัวเลือก B: Share กับ Service Account
1. ไปที่ Google Cloud Console
2. คัดลอก email ของ Service Account (จบด้วย @*.iam.gserviceaccount.com)
3. กลับมาที่ Google Drive
4. คลิกขวาที่ไฟล์หรือโฟลเดอร์
5. เลือก "Share"
6. ใส่ email ของ Service Account
7. ตั้งสิทธิ์เป็น "Viewer"
8. คลิก "Send" (ยกเลิก "Notify people" ได้)
```

### 2. ตรวจสอบ URL Format

URLs ที่ support:
- ✅ `https://lh3.googleusercontent.com/d/{FILE_ID}`
- ✅ `https://drive.google.com/file/d/{FILE_ID}/view`
- ✅ `https://drive.google.com/uc?id={FILE_ID}`
- ❌ `https://drive.google.com/open?id={FILE_ID}` (deprecated)

### 3. Test Image URLs

เปิด browser console และทดสอบ:

```javascript
// Copy URL ของรูปและลองเปิดใน browser ใหม่
// ถ้าเห็นรูป = URL ใช้ได้
// ถ้าเห็น error หรือ access denied = ปัญหา permissions
```

### 4. ตรวจสอบ Service Account Setup

```bash
# ตรวจสอบว่ามี environment variables
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ตรวจสอบว่า Service Account มี API enabled
1. ไปที่ Google Cloud Console
2. APIs & Services > Enabled APIs
3. ต้องมี "Google Drive API" enabled
```

### 5. Debug Steps

1. **เปิด Browser Console** (F12)
2. **ดู Network tab** เมื่อโหลดหน้า dashboard
3. **ดู errors** ของ image requests:
   - ถ้าเห็น 403 = Permission denied
   - ถ้าเห็น 404 = File not found หรือ ID ผิด
   - ถ้าเห็น CORS error = ปัญหา Next.js config

4. **ดู Console logs** จะแสดง:
   ```
   Image 1 Original URL: ... Normalized: ... Status: ...
   ```

## Quick Fix - ทำให้โฟลเดอร์ทั้งหมดเป็น Public

ถ้าต้องการให้รูปทั้งหมดแสดงได้เร็วๆ:

1. เปิด Google Drive
2. เลือกโฟลเดอร์ที่เก็บรูป
3. คลิกขวา > Share
4. เปลี่ยนเป็น "Anyone with the link" + "Viewer"
5. ✅ เช็ค "Apply to all items in this folder"
6. คลิก Done

## การตรวจสอบว่าแก้สำเร็จ

1. Refresh หน้า dashboard
2. ดูว่ารูปแสดงในตาราง "งานทั้งหมด"
3. คลิกที่ปุ่ม "ดูรูป" ของงานที่เสร็จแล้ว
4. รูปทั้งหมดควรแสดงออกมา

## หมายเหตุ

- การเปลี่ยน permissions อาจใช้เวลา 1-2 นาที
- Refresh browser cache ด้วย Ctrl+Shift+R (Windows) หรือ Cmd+Shift+R (Mac)
- ถ้ายังไม่แสดง ให้ดู Console logs เพื่อหาสาเหตุ

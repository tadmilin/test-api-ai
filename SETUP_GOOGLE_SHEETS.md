# 📊 Google Sheets Integration Setup

## ภาพรวม

ระบบจะส่งข้อมูลการสร้าง job ทุกครั้งไปเก็บใน Google Sheets อัตโนมัติ เพื่อ:
- ✅ เก็บประวัติการใช้งานตลอดกาล (แม้ job ถูกลบออกจาก MongoDB)
- ✅ วิเคราะห์ usage pattern (ใครใช้บ่อย, โหมดไหนนิยม)
- ✅ ติดตาม cost และ predictions ที่ใช้ไป

---

## ขั้นตอนการตั้งค่า (15 นาที)

### 1. สร้าง Google Sheet

1. เปิด [Google Sheets](https://sheets.google.com)
2. สร้าง Sheet ใหม่ ชื่อ **"Job Usage Logs"**
3. ตั้งชื่อ columns ที่ row 1:

| A | B | C | D |
|---|---|---|---|
| วันเวลา | ชื่อ User | โหมด | Prompt |

---

### 2. สร้าง Apps Script Webhook

1. ใน Google Sheet: **Extensions** → **Apps Script**
2. ลบโค้ดเก่า แล้ววางโค้ดนี้:

```javascript
function doPost(e) {
  try {
    // Parse JSON data
    const data = JSON.parse(e.postData.contents);
    
    // Get active sheet (ใช้ active sheet แทน getSheetByName)
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getActiveSheet();
    
    // Format วันเวลาภาษาไทย
    const timestamp = new Date(data.timestamp);
    const dateTimeStr = timestamp.toLocaleString('th-TH', { 
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // ✅ แก้ไข: ดึงข้อมูลจาก payload ที่ถูกต้อง
    const userEmail = data.userEmail || 'unknown';
    const mode = data.mode || 'Unknown';
    const prompt = data.customPrompt || '-';
    
    // Append new row (เฉพาะ 4 คอลัมน์)
    sheet.appendRow([
      dateTimeStr,    // วันเวลา
      userEmail,      // ชื่อ User
      mode,           // โหมด
      prompt,         // Prompt
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.toString() 
    }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. **Save** (💾 icon)
4. **Deploy** → **New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**
5. คัดลอก **Web app URL** (จะได้ URL ยาวๆ แบบนี้):
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

---

### 3. เพิ่ม Environment Variable

เปิดไฟล์ `.env.local` และเพิ่ม:

```bash
# Google Sheets Webhook
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/AKfycbx.../exec
```

---

### 4. ทดสอบ

1. Restart dev server: `pnpm run dev`
2. สร้าง job ใหม่ใน Dashboard
3. เช็คใน Google Sheet → ควรเห็นข้อมูลเพิ่มขึ้น 1 row

---

## ข้อมูลที่จะถูกเก็บ

| Fiวันเวลา** | 26/12/2568 14:30 | วันที่และเวลา (ภาษาไทย) |
| **ชื่อ User** | user@example.com | อีเมล user ที่สร้าง job |
| **โหมด** | Text-to-Image | โหมดที่ใช้งาน |
| **Prompt** | สุนัขน่ารัก | คำสั่ง prompt ที่กรอก
| **imageCount** | 5 | จำนวนรูปที่ generate |
| **jobId** | 67abe123... | MongoDB _id |

---

## การวิเคราะห์ Usage

### นับจำนวน jobs ต่อ user:
```
=COUNTIF(D:D, "user@example.com")
```

### นับจำนวน predictions ที่ใช้ไป (สมมติ 1 job = 10 predictions):
```
=COUNTIF(J:J, "completed") * 10
```

### Top 5B:B, "user@example.com")
```

### Top 5 users:
```
=QUERY(B:B, "SELECT B, COUNT(B) WHERE B <> '' GROUP BY B ORDER BY COUNT(B) DESC LIMIT 5")
```

### นับโหมดที่ใช้บ่อยสุด:
```
=QUERY(C:C, "SELECT C, COUNT(C) WHERE C <> '' GROUP BY C ORDER BY COUNT(C) DESC
2. ✅ ตรวจสอบจำนวน jobs ใน MongoDB
3. ✅ ถ้าเกิน 100 jobs → ลบ job เก่าสุด + รูปใน Cloudinary

### เมื่อลบ Job:
1. ✅ ลบรูปทั้งหมดใน Cloudinary (imageUrl + templateUrl)
2. ✅ ประวัติยังอยู่ใน Google Sheets

---

## Troubleshooting

### ไม่เห็นข้อมูลใน Google Sheet?

1. เช็ค console logs:
   ```
   ✅ Sent job data to Google Sheets: 67abe123...
   ```

2. ทดสอบ webhook ด้วย curl:
   ```bash
   curl -X POST https://script.google.com/macros/s/AKfycbx.../exec \
     -H "Content-Type: application/json" \
     -d '{"timestamp":"2025-12-26T14:30:00Z","userEmail":"test@test.com"}'
   ```

3. เช็ค Apps Script logs:
   - เปิด Apps Script editor
   - **Executions** (ด้านซ้าย)
   - ดู error messages

### เกิด CORS error?

- Apps Script Web App ต้องตั้งเป็น **"Anyone"** access
- Re-deploy ใหม่ถ้าเพิ่ง change settings

---

## ข้อดี

- ✅ **ฟรี** - Google Sheets ไม่มีค่าใช้จ่าย
- ✅ **Unlimited storage** - เก็บข้อมูลได้ไม่จำกัด
- ✅ **ง่ายต่อการวิเคราะห์** - ใช้ Google Sheets functions หรือ export เป็น CSV
- ✅ **Backup อัตโนมัติ** - Google Drive backup ให้อยู่แล้ว
- ✅ **Share ได้** - แชร์ให้ทีมดูได้ทันที

---

## ตัวอย่าง Dashboard ใน Google Sheets

สามารถสร้าง charts/pivots เพื่อดู:
- 📊 Jobs per day (line chart)
- 👥 Jobs per user (pie chart)  
- 📈 Popular modes (bar chart)
- 💰 Cost estimation (calculated field)

---

**เสร็จแล้ว!** ระบบจะเริ่มเก็บข้อมูลทุกครั้งที่สร้าง job ใหม่ 🎉

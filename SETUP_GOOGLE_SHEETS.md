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

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Timestamp | Date | Time | User Email | User Name | Mode | Custom Prompt | Template | Output Size | Status |

(+ คอลัมน์ K: Image Count, L: Job ID ถ้าต้องการ)

---

### 2. สร้าง Apps Script Webhook

1. ใน Google Sheet: **Extensions** → **Apps Script**
2. ลบโค้ดเก่า แล้ววางโค้ดนี้:

```javascript
function doPost(e) {
  try {
    // Parse JSON data
    const data = JSON.parse(e.postData.contents);
    
    // Get active sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
    // หรือ ระบุชื่อ sheet เฉพาะ:
    // const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Job Logs');
    
    // Append new row
    sheet.appendRow([
      data.timestamp || '',
      data.date || '',
      data.time || '',
      data.userEmail || '',
      data.userName || '',
      data.mode || '',
      data.customPrompt || '',
      data.templateName || '',
      data.outputSize || '',
      data.status || '',
      data.imageCount || 0,
      data.jobId || '',
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

| Field | ตัวอย่าง | คำอธิบาย |
|-------|----------|----------|
| **timestamp** | 2025-12-26T14:30:00.000Z | เวลาสร้าง job (ISO format) |
| **date** | 26/12/2568 | วันที่ (Thai format) |
| **time** | 14:30:00 | เวลา (Thai format) |
| **userEmail** | user@example.com | อีเมล user ที่สร้าง |
| **userName** | สินค้าทดสอบ | ชื่อสินค้า |
| **mode** | Text-to-Image | โหมดที่ใช้ |
| **customPrompt** | สุนัขน่ารัก | Prompt ที่กรอก |
| **templateName** | Professional | Template ที่เลือก |
| **outputSize** | 1:1-2K | ขนาดที่ export |
| **status** | pending | สถานะ job |
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

### Top 5 users:
```
=QUERY(D:D, "SELECT D, COUNT(D) WHERE D <> '' GROUP BY D ORDER BY COUNT(D) DESC LIMIT 5")
```

---

## สิ่งที่เกิดขึ้นอัตโนมัติ

### เมื่อสร้าง Job ใหม่:
1. ✅ ส่งข้อมูลไป Google Sheets
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

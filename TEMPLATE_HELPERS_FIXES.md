# Template Helpers - Security & Quality Fixes

## ✅ ปัญหาที่แก้ไขแล้ว

### 1. **Bug: JPEG vs PNG Format Mismatch** 🔴
**ก่อน:**
```typescript
// compositeImages()
.jpeg({ quality: 90 })  // Output JPEG

// API route
const filename = `template-${timestamp}.png`  // ❌ ชื่อไฟล์ .png
contentType: 'image/png'  // ❌ MIME type ผิด
```

**หลัง:**
```typescript
// compositeImages()
.png({ compressionLevel: 6 })  // ✅ Output PNG

// API route
const filename = `template-${timestamp}.png`  // ✅ ตรงกัน
contentType: 'image/png'  // ✅ MIME type ถูก
```

**ทำไมต้อง PNG:**
- ✅ รักษาความโปร่งใส (transparency/alpha channel)
- ✅ รักษามุมโค้ง (rounded corners)
- ✅ รักษา overlay/effects
- ✅ ไม่มี JPEG artifacts

---

### 2. **Download Timeout & Size Limits** 🔴
**ก่อน:**
```typescript
const response = await fetch(url)  // ❌ ไม่มี timeout
const arrayBuffer = await response.arrayBuffer()  // ❌ ไม่มี size limit
```

**หลัง:**
```typescript
export async function downloadImageFromUrl(
  url: string,
  options: DownloadOptions = {}
): Promise<Buffer> {
  const { timeoutMs = 15000, maxBytes = 10 * 1024 * 1024 } = options
  
  // ✅ Timeout protection
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  
  // ✅ Size check (header)
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`Image too large: ${contentLength} bytes`)
  }
  
  // ✅ Size check (actual)
  if (arrayBuffer.byteLength > maxBytes) {
    throw new Error(`Image too large: ${arrayBuffer.byteLength} bytes`)
  }
}
```

**ประโยชน์:**
- ✅ ไม่ค้าง (timeout 15s)
- ✅ ไม่ RAM พัง (max 10MB)
- ✅ ไม่ถูกโจมตี (size limit)

---

### 3. **Position Clamping & Validation** 🔴
**ก่อน:**
```typescript
const compositeInputs = images.map(({ buffer, position }) => ({
  input: buffer,
  top: position.y,     // ❌ อาจติดลบหรือเป็น float
  left: position.x,    // ❌ Sharp อาจ error
}))
```

**หลัง:**
```typescript
const compositeInputs = images.map(({ buffer, position }) => ({
  input: buffer,
  left: Math.max(0, Math.round(position.x)),  // ✅ Clamp >= 0, integer
  top: Math.max(0, Math.round(position.y)),   // ✅ Clamp >= 0, integer
}))
```

**ประโยชน์:**
- ✅ ป้องกัน AI ให้ค่าติดลบ
- ✅ ป้องกัน float ที่ Sharp ไม่ชอบ
- ✅ ป้องกันตำแหน่งหลุดขอบ

---

### 4. **SSRF Protection (Basic)** 🟡
**ก่อน:**
```typescript
const response = await fetch(url)  // ❌ รับ URL ไหนก็ได้
```

**หลัง:**
```typescript
const parsedUrl = new URL(url)
if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
  throw new Error('Only http/https URLs are allowed')
}
// ✅ Block file://, ftp://, etc.
```

**หมายเหตุ:** API route มี allowlist domains เพิ่มเติม (Google Drive, Blob, Replicate)

---

### 5. **Format Options & Flexibility** 🟢
**เพิ่ม:**
```typescript
export interface CompositeOptions {
  format?: 'png' | 'jpeg'  // เลือกได้
  quality?: number
}

const finalImageBuffer = await compositeImages(templateBuffer, images, {
  format: 'png',  // Default PNG (preserves transparency)
  quality: 90,
})
```

**ใช้เมื่อไหร่:**
- **PNG:** Templates with overlays, transparency, rounded corners (แนะนำ)
- **JPEG:** Photo-only templates, need smaller file size

---

## 📊 Comparison

| Feature | ก่อน | หลัง |
|---------|------|------|
| Format | JPEG (ทำลายโปร่งใส) | **PNG** (รักษาโปร่งใส) |
| Download timeout | ❌ None | **✅ 15s** |
| Size limit | ❌ None | **✅ 10MB** |
| Position clamp | ❌ None | **✅ Math.max(0, round())** |
| SSRF protection | ❌ None | **✅ Protocol check** |
| Error handling | Basic | **Enhanced + AbortError** |

---

## 🎯 Best Practices

### ใช้ PNG เมื่อไหร่:
```typescript
// ✅ Templates with:
- Transparency/overlays
- Rounded corners
- Drop shadows
- Text on transparent background
- Design elements with alpha channel
```

### ใช้ JPEG เมื่อไหร่:
```typescript
// ✅ Photo-only composites:
- Grid layouts (no overlays)
- Simple collages
- Need smaller file size
- No transparency needed
```

### Custom Options:
```typescript
// For high-quality PNG
await compositeImages(template, images, {
  format: 'png',
  quality: 100,  // Max quality (not used for PNG, but for docs)
})

// For smaller JPEG
await compositeImages(template, images, {
  format: 'jpeg',
  quality: 80,  // Balance size vs quality
})
```

---

## 🔮 Advanced: Overlay Support (Future)

**ปัญหา:** ตอนนี้ composite แค่ "ทับ" ไม่ได้ "แทนที่"

**วิธีแก้ (ถ้าต้องการ):**
```typescript
// Layer structure:
1. Background (no photos)
2. Photos (insert here)
3. Overlay (frame/decorations on top)

// Implementation:
const bgBuffer = await downloadImageFromUrl(templateBgUrl)
const overlayBuffer = await downloadImageFromUrl(templateOverlayUrl)

// Step 1: Composite photos onto background
const withPhotos = await compositeImages(bgBuffer, images, { format: 'png' })

// Step 2: Composite overlay on top
const final = await sharp(withPhotos)
  .composite([{ input: overlayBuffer, top: 0, left: 0 }])
  .png()
  .toBuffer()
```

---

## ✅ Summary

**Fixed:**
1. ✅ PNG format (preserves transparency)
2. ✅ Download timeout (15s)
3. ✅ Size limits (10MB)
4. ✅ Position clamping (>= 0, integer)
5. ✅ Basic SSRF protection
6. ✅ Format options (png/jpeg)
7. ✅ Enhanced error handling

**ระบบแข็งแรง ปลอดภัย และรักษาคุณภาพ template ได้ดีขึ้นมาก!** 🎨

# Replicate Webhook Setup Guide

## ✅ Webhook ถูกต้องตาม Replicate Docs แล้ว

### 🔒 Security Features

1. **Webhook Signature Verification**
   - ตรวจสอบ HMAC SHA-256 signature
   - ป้องกัน unauthorized requests
   - ใช้ constant-time comparison (ป้องกัน timing attacks)

2. **Replay Attack Prevention**
   - ตรวจสอบ timestamp (ยอมรับได้ 5 นาที)
   - ป้องกันการส่ง webhook เก่าซ้ำ

3. **Idempotency**
   - เช็คว่า prediction นี้ถูก process ไปแล้วหรือยัง
   - ป้องกันการ process ซ้ำ

4. **Fast Response**
   - Respond ทันที (200 OK)
   - Process webhook ใน background
   - Replicate จะไม่ retry unnecessarily

---

## 🔧 Setup Instructions

### 1. Get Webhook Signing Secret

```bash
curl -X GET \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  https://api.replicate.com/v1/webhooks/default/secret
```

Response:
```json
{
  "key": 
}
```

### 2. Add to Environment Variables

เพิ่มใน `.env`:

```env

```

### 3. Test Webhook (Optional)

สร้าง prediction พร้อม webhook URL:

```bash
curl -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "...",
    "input": {...},
    "webhook": "https://your-domain.com/api/webhooks/replicate",
    "webhook_events_filter": ["start", "completed"]
  }' \
  https://api.replicate.com/v1/predictions
```

---

## 📝 How It Works

### Webhook Flow:

1. **Request Arrives** → Webhook route receives POST from Replicate
2. **Verify Signature** → Validate HMAC SHA-256 with signing secret
3. **Verify Timestamp** → Check request is not too old (< 5 min)
4. **Respond Immediately** → Return 200 OK to Replicate
5. **Process in Background** → Update job without blocking response
6. **Idempotency Check** → Skip if already processed

### Security Headers:

Replicate ส่งมา 3 headers:
- `webhook-id`: Unique message ID
- `webhook-timestamp`: Unix timestamp (seconds)
- `webhook-signature`: Base64 encoded signature(s)

### Signature Verification:

```
signedContent = webhook_id + "." + webhook_timestamp + "." + body
signature = HMAC-SHA256(signedContent, base64_decode(secret))
```

---

## ⚠️ Important Notes

### Development vs Production

**Development (no secret configured):**
- Verification skipped automatically
- Warning logged: "REPLICATE_WEBHOOK_SECRET not configured"
- Webhooks still work (insecure)

**Production (secret configured):**
- Verification enforced
- Rejects invalid signatures with 403
- Prevents unauthorized webhook calls

### Retry Behavior

Replicate will retry:
- Terminal webhooks (succeeded/failed/canceled) only
- If response is 4xx, 5xx, or no response
- Exponential backoff (~1 minute max)

Replicate will NOT retry:
- Intermediate webhooks (starting/processing)
- If 2xx response received

---

## 🐛 Troubleshooting

### "Invalid webhook signature"

1. ตรวจสอบ `REPLICATE_WEBHOOK_SECRET` ถูกต้อง
2. เช็ค secret format: `whsec_...`
3. ลอง fetch secret ใหม่จาก API

### "Webhook timestamp too old"

1. เซิร์ฟเวอร์ time sync ถูกต้องหรือไม่
2. Webhook ใช้เวลานานเกินไป (> 5 นาที)
3. เป็น retry จาก Replicate (ใช้เวลานาน)

### Duplicate Processing

1. เช็ค idempotency logic working
2. ดู logs: "⏭️ Already processed"
3. เช็ค database: มี URL หรือยัง

---

## 📚 References

- [Replicate Webhooks Docs](https://replicate.com/docs/topics/webhooks)
- [Webhook Verification](https://replicate.com/docs/topics/webhooks/verify-webhook)
- [HTTP API Reference](https://replicate.com/docs/reference/http)

---

## ✅ Implementation Checklist

- [x] Webhook signature verification
- [x] Timestamp validation (replay attack prevention)
- [x] Idempotency check (duplicate prevention)
- [x] Fast response (immediate 200 OK)
- [x] Background processing
- [x] Error handling
- [x] Logging & debugging
- [x] Development mode support (no secret)
- [x] Production-ready security

**Status: Production Ready** ✨

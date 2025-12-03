# 🎨 Image Enhancement System Setup Guide

## Overview
ระบบนี้ใช้ **Replicate SDXL img2img** เพื่อปรับแต่งภาพจากรูปต้นฉบับ แทนการสร้างรูปใหม่ทั้งหมดด้วย DALL-E

### Workflow
```
Google Sheets → GPT-4 Prompt → Python Collage → Replicate Enhancement → Resize → Display
```

## Prerequisites

1. **Node.js** (v18.20.2+ or v20.9.0+)
2. **Python 3.8+** (for collage service)
3. **MongoDB** (for PayloadCMS)
4. **API Keys:**
   - OpenAI API Key (for GPT-4)
   - Replicate API Token (for SDXL image enhancement)
   - Google Drive API credentials

## Installation Steps

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# In y/ directory
cp .env.example .env
```

Required variables:
```env
DATABASE_URI=mongodb://127.0.0.1/your-database-name
PAYLOAD_SECRET=your_secret_here
NEXT_PUBLIC_SERVER_URL=http://localhost:3000

# OpenAI for GPT-4 prompt generation
OPENAI_API_KEY=sk-...

# Replicate for image enhancement (NEW!)
REPLICATE_API_TOKEN=r8_...

# Python service URL
PYTHON_SERVICE_URL=http://localhost:8000

# Vercel Blob storage
BLOB_READ_WRITE_TOKEN=vercel_blob_...
```

### 2. Install Node.js Dependencies

```bash
cd y/
pnpm install
```

This will install:
- Next.js 15
- PayloadCMS 3.65.0
- OpenAI SDK
- **Replicate SDK** (NEW!)
- Vercel Blob

### 3. Install Python Dependencies

```bash
cd python-service/
pip install -r requirements.txt
```

This installs:
- FastAPI
- Uvicorn
- Pillow (image processing)
- Requests
- Pydantic

### 4. Start the Python Collage Service

In a **separate terminal**, run:

```bash
cd y/python-service/
python main.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The service will run on `http://localhost:8000`

### 5. Start Next.js Development Server

In the main terminal:

```bash
cd y/
pnpm dev
```

The app will run on `http://localhost:3000`

## Testing the System

### 1. Login
- Go to `http://localhost:3000/login` (customer login)
- Or `http://localhost:3000/admin` (admin dashboard)

### 2. Create a Job

1. **Select Google Sheet** with columns:
   - `Product Name`
   - `Content_Topic` (หัวข้อเนื้อหา)
   - `Post_Title_Headline` (หัวข้อโพสต์)
   - `Content_Description` (รายละเอียดเนื้อหา)

2. **Select Reference Images** from Google Drive

3. **Collage Options** (if multiple images):
   - ☑️ Enable "สร้าง Collage ก่อนเจนรูป"
   - Choose template: Auto / Hero Grid / Split / Masonry / Grid

4. **Enhancement Strength**:
   - Drag slider (0.3-0.8)
   - 0.3-0.4: เบา (ใกล้เคียงต้นฉบับ)
   - 0.5-0.6: ปานกลาง
   - 0.7-0.8: หนัก (เปลี่ยนแปลงมาก)

5. **Select Target Platforms**:
   - Facebook (1200x630)
   - Instagram Feed (1080x1080)
   - Instagram Story (1080x1920)

6. Click **สร้างภาพ**

### 3. Processing Flow

Watch the status updates:
```
🤖 Generating enhancement prompt...
✨ Enhancing image with Replicate AI...
📐 Resizing images for platforms...
✅ Complete!
```

## Architecture Changes

### OLD System (DALL-E Generation)
```
Sheets → GPT-4 Prompt → DALL-E 3 Generate → Resize
```
- **Problem**: Creates entirely new images, ignores reference photos
- **Cost**: $0.04-0.08 per image

### NEW System (Replicate Enhancement)
```
Sheets → GPT-4 Prompt → [Collage] → Replicate SDXL img2img → Resize
```
- **Advantage**: Preserves original photos, enhances quality
- **Cost**: $0.002-0.01 per image (cheaper!)
- **Control**: Strength parameter controls modification level

## Key Files Modified

### 1. API Routes

- **`/api/generate/enhance/route.ts`** (NEW)
  - Replicate SDXL img2img endpoint
  - Input: collageUrl, prompt, strength
  - Output: enhanced image URL

- **`/api/generate/prompt/route.ts`** (MODIFIED)
  - Changed from "generation prompts" to "enhancement prompts"
  - Vision mode: analyzes collage for enhancement instructions
  - Text-only mode: creates professional photography prompt

- **`/api/generate/process/route.ts`** (MODIFIED)
  - Step 0: Create collage (if useCollage && multiple images)
  - Step 1: Generate enhancement prompt with GPT-4
  - **Step 2: Call Replicate enhance** (was DALL-E generate)
  - Step 3: Resize for platforms

- **`/api/collage/route.ts`** (NEW)
  - Next.js proxy to Python service
  - Uploads collage to Vercel Blob

### 2. Collections

- **`collections/Jobs.ts`** (MODIFIED)
  - Added `contentTopic`, `postTitleHeadline`, `contentDescription`
  - Added `useCollage`, `collageTemplate`
  - Added `enhancementStrength` (0.3-0.8)

### 3. Dashboard

- **`dashboard/page.tsx`** (MODIFIED)
  - Collage options UI
  - Enhancement strength slider
  - Content fields from Google Sheets
  - Updated status messages

### 4. Python Service

- **`python-service/main.py`** (NEW)
  - FastAPI server on port 8000
  - POST /collage endpoint

- **`python-service/collage_generator.py`** (NEW)
  - 4 layout templates
  - Smart cropping and positioning

## Replicate Model Details

**Model**: `stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b`

**Parameters**:
- `prompt`: Enhancement instructions from GPT-4
- `image`: Base64 collage or reference image
- `strength`: 0.3-0.8 (how much to modify)
- `num_inference_steps`: 30
- `guidance_scale`: 7.5
- `scheduler`: DPMSolverMultistep
- `negative_prompt`: "blurry, low quality, distorted..."

## Troubleshooting

### Python Service Won't Start
```bash
# Check if port 8000 is in use
netstat -ano | findstr :8000

# Kill the process if needed
taskkill /PID <process_id> /F

# Restart service
python main.py
```

### Replicate API Errors
- Check API token in `.env`
- Verify token at: https://replicate.com/account/api-tokens
- Check usage limits

### Collage Creation Fails
- Verify Python service is running
- Check logs in Python terminal
- Test endpoint: `curl http://localhost:8000/health`

### Enhancement Takes Too Long
- Replicate SDXL takes 5-15 seconds per image
- Lower `num_inference_steps` (currently 30) for faster results
- Check Replicate status: https://replicate.com/stability-ai/sdxl

### Image Quality Issues
- **Too similar to original**: Increase `enhancementStrength` (0.5-0.7)
- **Too different**: Decrease `enhancementStrength` (0.3-0.4)
- **Blurry**: Check negative prompts in `/api/generate/enhance/route.ts`

## Development Notes

### Testing Prompt Generation
```bash
curl -X POST http://localhost:3000/api/generate/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "productName": "โซฟา",
    "contentTopic": "ห้องนั่งเล่นสไตล์โมเดิร์น",
    "postTitleHeadline": "แต่งห้องนั่งเล่นให้ดูหรูหรา",
    "contentDescription": "โซฟาสีเทาพร้อมหมอนอิง...",
    "referenceImageUrls": ["https://..."]
  }'
```

### Testing Collage Creation
```bash
curl -X POST http://localhost:8000/collage \
  -H "Content-Type: application/json" \
  -d '{
    "image_urls": ["url1", "url2"],
    "template": "hero_grid",
    "canvas_size": [1792, 1024]
  }'
```

### Testing Image Enhancement
```bash
curl -X POST http://localhost:3000/api/generate/enhance \
  -H "Content-Type: application/json" \
  -d '{
    "collageUrl": "https://...",
    "prompt": "Professional luxury interior...",
    "strength": 0.4,
    "jobId": "123"
  }'
```

## Cost Comparison

| Service | OLD (DALL-E) | NEW (Replicate) |
|---------|-------------|-----------------|
| Image Generation | $0.040-0.080 | $0.002-0.010 |
| Prompt (GPT-4) | $0.001 | $0.001 |
| **Total per Job** | **$0.041-0.081** | **$0.003-0.011** |
| **Savings** | - | **~85% cheaper!** |

## Next Steps

1. **Deploy Python Service**:
   - Option A: Railway.app (free tier)
   - Option B: Render.com (free tier)
   - Option C: Vercel Python runtime (experimental)

2. **Update PYTHON_SERVICE_URL** in production `.env`

3. **Monitor Replicate Usage**:
   - Dashboard: https://replicate.com/account/billing
   - Set spending limits

4. **Fine-tune Parameters**:
   - Test different `strength` values (0.3-0.8)
   - Adjust `guidance_scale` (5-10)
   - Try different `scheduler` options

## Support

For issues or questions:
1. Check Python service logs: `python-service/` terminal
2. Check Next.js logs: `y/` terminal
3. Check job logs in PayloadCMS: `/admin/collections/job-logs`

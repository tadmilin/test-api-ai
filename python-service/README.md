# Image Collage Service

Python service สำหรับสร้าง image collage จากรูปหลายรูป

## Installation

```bash
pip install -r requirements.txt
```

## Run Service

```bash
python main.py
```

หรือ

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

### POST /collage

สร้าง collage จากรูปหลายรูป

**Request Body:**
```json
{
  "image_urls": ["url1", "url2", "url3"],
  "template": "hero_grid",
  "canvas_size": [1792, 1024]
}
```

**Templates Available:**
- `hero_grid` - 1 รูปใหญ่ซ้าย + 3 รูปเล็กขวา
- `split` - 2 รูปแบ่งครึ่ง
- `masonry` - 4-6 รูปแบบ Pinterest
- `grid` - 4 รูป 2x2

**Response:**
```json
{
  "image_base64": "base64_string...",
  "template_used": "hero_grid",
  "dimensions": {
    "width": 1792,
    "height": 1024
  }
}
```

### GET /health

Health check endpoint

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run in development mode
uvicorn main:app --reload

# Test
curl -X POST http://localhost:8000/collage \
  -H "Content-Type: application/json" \
  -d '{"image_urls": ["url1", "url2"]}'
```

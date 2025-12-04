# AI Graphic Design Service 🎨

Professional graphic design service for social media posts

## Features ✨

- **5 Professional Styles**: Auto-selected randomly
  - Modern Minimal, Gradient Luxury, Resort Mountain, Eco Nature, Modern Entrance
- **Smart Color Extraction**: Extracts dominant colors from images
- **Social Media Formats**: Facebook (1200×630), Instagram (1080×1080, 1080×1920)
- **1-6 Images**: Automatic layout optimization

## Architecture

```
main.py              → FastAPI server
graphic_designer.py  → Complete design system (download + styles)
```

## Installation

```bash
pip install -r requirements.txt
```

## Run Service

```bash
python main.py
```

## API Endpoints

### POST /collage

**Request:**
```json
{
  "image_urls": ["url1", "url2"],
  "social_media_format": "facebook_post"
}
```

**Response:**
```json
{
  "image_base64": "iVBORw0KGgo...",
  "template_used": "graphic_design_professional_auto",
  "dimensions": {"width": 1200, "height": 630}
}
```

### GET /health

Health check endpoint

## Deploy to Railway

Railway auto-detects Python and runs the service.
Port: Auto from `$PORT` env variable

## Development

```bash
# Test locally
curl -X POST http://localhost:8000/collage \
  -H "Content-Type: application/json" \
  -d '{"image_urls": ["https://example.com/img.jpg"], "social_media_format": "instagram_feed"}'
```

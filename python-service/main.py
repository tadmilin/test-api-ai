from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import base64
from io import BytesIO
import requests
from PIL import Image

from graphic_designer import GraphicDesigner
from overlay_designer import OverlayDesigner

app = FastAPI(title="AI Graphic Design Service")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CollageRequest(BaseModel):
    image_urls: List[str]
    template: Optional[str] = None
    canvas_size: Optional[List[int]] = None
    aspect_ratio: Optional[str] = None  # Legacy หรือ "3:1", "2:1" สำหรับ overlay
    size: Optional[str] = "MD"
    social_media_format: Optional[str] = None
    use_graphic_design: Optional[bool] = True
    use_overlay_design: Optional[bool] = False  # NEW: ใช้ระบบ overlay แทน
    hero_image_index: Optional[int] = 0  # NEW: index ของรูปหลัก (0-based)

class CollageResponse(BaseModel):
    image_base64: str
    template_used: str
    dimensions: dict

@app.get("/")
def root():
    return {"status": "ok", "service": "AI Graphic Design Service"}

def download_image(url: str) -> Image.Image:
    """
    Helper function to download image from URL
    """
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        img = Image.open(BytesIO(response.content))
        return img.convert('RGB')
    except Exception as e:
        raise Exception(f"Failed to download image: {str(e)}")

@app.post("/collage", response_model=CollageResponse)
async def create_collage(request: CollageRequest):
    """
    สร้างงานกราฟิกโฆษณาแบบมืออาชีพ
    - Overlay Design: รูปหลัก + รูปเล็กซ้อนทับ + Template Patterns
    - Graphic Design: รูปหลายรูปจัดเรียงแบบ grid
    """
    try:
        if not request.image_urls or len(request.image_urls) == 0:
            raise HTTPException(status_code=400, detail="image_urls is required")
        
        if len(request.image_urls) > 6:
            raise HTTPException(status_code=400, detail="Maximum 6 images allowed")
        
        # เลือกระบบออกแบบ: Overlay Design หรือ Graphic Design
        if request.use_overlay_design:
            # ===== OVERLAY DESIGN SYSTEM =====
            print(f"\n🎨 Creating OVERLAY design...")
            
            # กำหนด aspect ratio (default: 3:1)
            aspect_ratio = request.aspect_ratio or "3:1"
            if aspect_ratio not in ["3:1", "2:1"]:
                aspect_ratio = "3:1"
            
            print(f"📐 Aspect Ratio: {aspect_ratio}")
            print(f"🖼️ Images: {len(request.image_urls)}")
            print(f"⭐ Hero Image Index: {request.hero_image_index}")
            
            # สร้าง designer
            overlay_designer = OverlayDesigner(aspect_ratio=aspect_ratio)
            
            # ดาวน์โหลดรูปทั้งหมด
            images = []
            for i, url in enumerate(request.image_urls):
                try:
                    print(f"  [{i+1}/{len(request.image_urls)}] Downloading...")
                    img = download_image(url)
                    images.append(img)
                except Exception as e:
                    print(f"  ⚠️ Warning: Failed to download image {i+1}: {e}")
                    continue
            
            if not images:
                raise HTTPException(status_code=400, detail="No valid images to process")
            
            print(f"✅ Downloaded {len(images)} images")
            
            # สร้างดีไซน์แบบ overlay
            graphic_image = overlay_designer.create_overlay_design(
                images=images,
                hero_index=request.hero_image_index or 0,
                pattern_style="auto"  # สุ่มลายกราฟิก
            )
            
            template_used = f"overlay_design_{aspect_ratio}"
            
        else:
            # ===== GRAPHIC DESIGN SYSTEM (เดิม) =====
            # คำนวณขนาด Canvas
            if request.canvas_size:
                canvas_size_tuple = tuple(request.canvas_size)
            elif request.social_media_format:
                format_map = {
                    "facebook_post": (1200, 630),
                    "instagram_feed": (1080, 1080),
                    "instagram_story": (1080, 1920),
                    "custom_16_9": (1920, 1080),
                    "custom_4_3": (1600, 1200),
                    "custom_1_1": (1200, 1200),
                }
                canvas_size_tuple = format_map.get(request.social_media_format, (1200, 630))
            else:
                canvas_size_tuple = (1200, 630)
            
            print(f"\n🎨 Creating graphic design...")
            print(f"📐 Canvas: {canvas_size_tuple[0]}x{canvas_size_tuple[1]}px")
            print(f"🖼️ Images: {len(request.image_urls)}")
            
            designer = GraphicDesigner(canvas_size=canvas_size_tuple)
            graphic_image = designer.process(request.image_urls)
            
            template_used = "graphic_design_professional_auto"
        
        # แปลงเป็น base64
        buffered = BytesIO()
        graphic_image.save(buffered, format="PNG", quality=95, optimize=True)
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        print(f"✅ Design completed!")
        
        return CollageResponse(
            image_base64=img_base64,
            template_used=template_used,
            dimensions={
                "width": graphic_image.width,
                "height": graphic_image.height
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create collage: {str(e)}")

@app.get("/health")
def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import base64
from io import BytesIO

from graphic_designer import GraphicDesigner

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
    canvas_size: Optional[List[int]] = None  # Legacy support
    aspect_ratio: Optional[str] = None  # Legacy: "3:1", "2:2", "1:1", "16:9", "4:3"
    size: Optional[str] = "MD"  # Legacy: "SM" (800), "MD" (1024), "LG" (1920), "XL" (2560)
    social_media_format: Optional[str] = None  # NEW: "facebook_post", "instagram_feed", "instagram_story"
    use_graphic_design: Optional[bool] = True  # NEW: Enable professional graphic design

class CollageResponse(BaseModel):
    image_base64: str
    template_used: str
    dimensions: dict

@app.get("/")
def root():
    return {"status": "ok", "service": "Image Collage Generator"}

@app.post("/collage", response_model=CollageResponse)
async def create_collage(request: CollageRequest):
    """
    สร้างงานกราฟิกโฆษณาแบบมืออาชีพ
    - รองรับ 1-4 รูป
    - สุ่มสไตล์อัตโนมัติ (5 แบบ)
    - ดึงสีจากภาพมาใช้ในการออกแบบ
    """
    try:
        if not request.image_urls or len(request.image_urls) == 0:
            raise HTTPException(status_code=400, detail="image_urls is required")
        
        if len(request.image_urls) > 6:
            raise HTTPException(status_code=400, detail="Maximum 6 images allowed")
        
        # คำนวณขนาด Canvas จาก social_media_format
        if request.canvas_size:
            canvas_size_tuple = tuple(request.canvas_size)
        elif request.social_media_format:
            format_map = {
                "facebook_post": (1200, 630),      # 1.9:1
                "instagram_feed": (1080, 1080),    # 1:1
                "instagram_story": (1080, 1920),   # 9:16
                "custom_16_9": (1920, 1080),       # 16:9
                "custom_4_3": (1600, 1200),        # 4:3
                "custom_1_1": (1200, 1200),        # 1:1
            }
            canvas_size_tuple = format_map.get(request.social_media_format, (1200, 630))
        else:
            # Default: Facebook post size
            canvas_size_tuple = (1200, 630)
        
        print(f"\n🎨 Creating graphic design...")
        print(f"📐 Canvas: {canvas_size_tuple[0]}x{canvas_size_tuple[1]}px")
        print(f"🖼️ Images: {len(request.image_urls)}")
        
        # สร้างงานกราฟิกด้วย GraphicDesigner
        designer = GraphicDesigner(canvas_size=canvas_size_tuple)
        
        # ประมวลผล: ดาวน์โหลด + สุ่มสไตล์ + สร้างงานออกแบบ
        graphic_image = designer.process(request.image_urls)
        
        # แปลงเป็น base64
        buffered = BytesIO()
        graphic_image.save(buffered, format="PNG", quality=95, optimize=True)
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        print(f"✅ Graphic design completed!")
        
        return CollageResponse(
            image_base64=img_base64,
            template_used="graphic_design_professional_auto",
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

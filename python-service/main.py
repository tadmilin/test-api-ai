from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import base64
from io import BytesIO

from collage_generator import CollageGenerator

app = FastAPI(title="Image Collage Service")

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
    aspect_ratio: Optional[str] = None  # "3:1", "2:2", "1:1", "16:9", "4:3"
    size: Optional[str] = "MD"  # "SM" (800), "MD" (1024), "LG" (1920), "XL" (2560)

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
    สร้าง image collage จากรูปหลายรูป
    """
    try:
        if not request.image_urls or len(request.image_urls) == 0:
            raise HTTPException(status_code=400, detail="image_urls is required")
        
        if len(request.image_urls) > 6:
            raise HTTPException(status_code=400, detail="Maximum 6 images allowed")
        
        # Calculate canvas size from aspect_ratio and size
        if request.canvas_size:
            # Legacy: use provided canvas_size
            canvas_size_tuple = tuple(request.canvas_size)
        else:
            # New: calculate from aspect_ratio + size
            size_map = {
                "SM": 800,
                "MD": 1024,
                "LG": 1920,
                "XL": 2560
            }
            aspect_ratio_map = {
                "3:1": (3, 1),
                "2:2": (2, 2),
                "1:1": (1, 1),
                "16:9": (16, 9),
                "4:3": (4, 3),
                "21:9": (21, 9)
            }
            
            width = size_map.get(request.size or "MD", 1024)
            aspect_w, aspect_h = aspect_ratio_map.get(request.aspect_ratio or "16:9", (16, 9))
            height = int(width * aspect_h / aspect_w)
            canvas_size_tuple = (width, height)
        
        # สร้าง collage generator
        generator = CollageGenerator(canvas_size=canvas_size_tuple)
        
        # สร้าง collage
        collage_image, template_used = generator.create_collage(
            request.image_urls,
            template=request.template
        )
        
        # แปลงเป็น base64
        buffered = BytesIO()
        collage_image.save(buffered, format="PNG", quality=100, optimize=False)
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        return CollageResponse(
            image_base64=img_base64,
            template_used=template_used,
            dimensions={
                "width": collage_image.width,
                "height": collage_image.height
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

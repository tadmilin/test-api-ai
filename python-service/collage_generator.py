from PIL import Image, ImageDraw, ImageFilter, ImageOps
import requests
from io import BytesIO
from typing import List, Tuple, Optional
import random

class CollageGenerator:
    """
    สร้าง image collage จากรูปหลายรูป
    รองรับ 4 layout templates:
    1. hero_grid - 1 รูปใหญ่ซ้าย + 3 รูปเล็กขวา
    2. split - 2 รูปเท่ากัน แบ่งครึ่ง
    3. masonry - 4-6 รูปแบบ Pinterest
    4. grid - 4 รูปเท่ากันแบบ 2x2
    """
    
    def __init__(self, canvas_size: Tuple[int, int] = (1024, 768)):
        self.canvas_size = canvas_size
        # ถ้า canvas ใหญ่เกิน 1024 ให้ลดลง เพื่อประหยัด memory
        max_dimension = 1024
        if canvas_size[0] > max_dimension or canvas_size[1] > max_dimension:
            ratio = min(max_dimension / canvas_size[0], max_dimension / canvas_size[1])
            self.canvas_size = (int(canvas_size[0] * ratio), int(canvas_size[1] * ratio))
            print(f"Canvas resized from {canvas_size} to {self.canvas_size} to save memory")
        
        self.spacing = 8  # ลดระยะห่างระหว่างรูปให้เนียนขึ้น
        self.padding = 12  # ลด padding รอบๆ ให้กระชับ
        self.bg_color = (255, 255, 255)  # พื้นหลังสีขาว
        
    def download_image(self, url: str) -> Image.Image:
        """ดาวน์โหลดรูปจาก URL"""
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            img = Image.open(BytesIO(response.content))
            return img.convert('RGB')
        except Exception as e:
            raise Exception(f"Failed to download image from {url}: {str(e)}")
    
    def add_shadow(self, image: Image.Image, offset: int = 8, blur: int = 15) -> Image.Image:
        """เพิ่มเงาให้รูป"""
        # สร้าง shadow layer
        shadow = Image.new('RGBA', 
                          (image.width + offset * 2, image.height + offset * 2), 
                          (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.rectangle(
            [(offset, offset), (image.width + offset, image.height + offset)],
            fill=(0, 0, 0, 80)
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
        
        # วางรูปลงบน shadow
        result = Image.new('RGBA', shadow.size, (0, 0, 0, 0))
        result.paste(shadow, (0, 0))
        result.paste(image, (offset, offset))
        
        return result
    
    def resize_to_fit(self, image: Image.Image, target_size: Tuple[int, int], 
                     crop: bool = True) -> Image.Image:
        """Resize รูปให้พอดีกับขนาดที่ต้องการ"""
        target_w, target_h = target_size
        img_ratio = image.width / image.height
        target_ratio = target_w / target_h
        
        if crop:
            # ครอปรูปให้พอดี (cover)
            if img_ratio > target_ratio:
                # รูปกว้างกว่า - ครอปซ้าย-ขวา
                new_h = image.height
                new_w = int(new_h * target_ratio)
                left = (image.width - new_w) // 2
                image = image.crop((left, 0, left + new_w, image.height))
            else:
                # รูปสูงกว่า - ครอปบน-ล่าง
                new_w = image.width
                new_h = int(new_w / target_ratio)
                top = (image.height - new_h) // 2
                image = image.crop((0, top, image.width, top + new_h))
            
            return image.resize(target_size, Image.Resampling.LANCZOS)
        else:
            # ไม่ครอป - contain พร้อมพื้นหลัง
            image.thumbnail(target_size, Image.Resampling.LANCZOS)
            background = Image.new('RGB', target_size, self.bg_color)
            offset = ((target_size[0] - image.width) // 2,
                     (target_size[1] - image.height) // 2)
            background.paste(image, offset)
            return background
    
    def layout_hero_grid(self, images: List[Image.Image]) -> Image.Image:
        """
        Layout: 1 รูปใหญ่ซ้าย + 3 รูปเล็กขวา
        ┌─────────┬───┐
        │         │ 1 │
        │  HERO   ├───┤
        │         │ 2 │
        │         ├───┤
        └─────────┴ 3 ┘
        """
        canvas = Image.new('RGB', self.canvas_size, self.bg_color)
        
        # คำนวณขนาด
        available_w = self.canvas_size[0] - self.padding * 2 - self.spacing
        available_h = self.canvas_size[1] - self.padding * 2
        
        hero_w = int(available_w * 0.65)
        hero_h = available_h
        
        small_w = available_w - hero_w
        small_h = (available_h - self.spacing * 2) // 3
        
        # วางรูปใหญ่ซ้าย
        if len(images) >= 1:
            hero = self.resize_to_fit(images[0], (hero_w, hero_h))
            canvas.paste(hero, (self.padding, self.padding))
        
        # วางรูปเล็กขวา
        small_x = self.padding + hero_w + self.spacing
        for i in range(min(3, len(images) - 1)):
            small_y = self.padding + i * (small_h + self.spacing)
            small = self.resize_to_fit(images[i + 1], (small_w, small_h))
            canvas.paste(small, (small_x, small_y))
        
        return canvas
    
    def layout_split(self, images: List[Image.Image]) -> Image.Image:
        """
        Layout: 2 รูปเท่ากัน แบ่งครึ่ง
        ┌──────┬──────┐
        │      │      │
        │  1   │  2   │
        │      │      │
        └──────┴──────┘
        """
        canvas = Image.new('RGB', self.canvas_size, self.bg_color)
        
        available_w = self.canvas_size[0] - self.padding * 2 - self.spacing
        available_h = self.canvas_size[1] - self.padding * 2
        
        half_w = available_w // 2
        
        # วางรูปซ้าย
        if len(images) >= 1:
            left = self.resize_to_fit(images[0], (half_w, available_h))
            canvas.paste(left, (self.padding, self.padding))
        
        # วางรูปขวา
        if len(images) >= 2:
            right = self.resize_to_fit(images[1], (half_w, available_h))
            canvas.paste(right, (self.padding + half_w + self.spacing, self.padding))
        
        return canvas
    
    def layout_masonry(self, images: List[Image.Image]) -> Image.Image:
        """
        Layout: 4-6 รูปแบบ Pinterest (ความสูงไม่เท่ากัน)
        ┌────┬──┬────┐
        │ 1  │2 │ 4  │
        ├────┤  ├────┤
        │ 3  │  │ 5  │
        └────┴──┴────┘
        """
        canvas = Image.new('RGB', self.canvas_size, self.bg_color)
        
        available_w = self.canvas_size[0] - self.padding * 2 - self.spacing * 2
        available_h = self.canvas_size[1] - self.padding * 2 - self.spacing
        
        # แบ่งเป็น 3 คอลัมน์
        col_w = available_w // 3
        half_h = available_h // 2
        
        positions = [
            (self.padding, self.padding, col_w, half_h),  # Top left
            (self.padding + col_w + self.spacing, self.padding, col_w, available_h),  # Center full
            (self.padding, self.padding + half_h + self.spacing, col_w, half_h),  # Bottom left
            (self.padding + col_w * 2 + self.spacing * 2, self.padding, col_w, half_h),  # Top right
            (self.padding + col_w * 2 + self.spacing * 2, self.padding + half_h + self.spacing, col_w, half_h),  # Bottom right
        ]
        
        for i, (x, y, w, h) in enumerate(positions):
            if i < len(images):
                img = self.resize_to_fit(images[i], (w, h))
                canvas.paste(img, (x, y))
        
        return canvas
    
    def layout_grid(self, images: List[Image.Image]) -> Image.Image:
        """
        Layout: 4 รูปเท่ากัน 2x2
        ┌─────┬─────┐
        │  1  │  2  │
        ├─────┼─────┤
        │  3  │  4  │
        └─────┴─────┘
        """
        canvas = Image.new('RGB', self.canvas_size, self.bg_color)
        
        available_w = self.canvas_size[0] - self.padding * 2 - self.spacing
        available_h = self.canvas_size[1] - self.padding * 2 - self.spacing
        
        cell_w = available_w // 2
        cell_h = available_h // 2
        
        positions = [
            (self.padding, self.padding),
            (self.padding + cell_w + self.spacing, self.padding),
            (self.padding, self.padding + cell_h + self.spacing),
            (self.padding + cell_w + self.spacing, self.padding + cell_h + self.spacing),
        ]
        
        for i, (x, y) in enumerate(positions):
            if i < len(images):
                img = self.resize_to_fit(images[i], (cell_w, cell_h))
                canvas.paste(img, (x, y))
        
        return canvas
    
    def select_template(self, num_images: int) -> str:
        """เลือก template ตามจำนวนรูป"""
        if num_images <= 2:
            return 'split'
        elif num_images <= 4:
            return random.choice(['hero_grid', 'grid'])
        else:
            return 'masonry'
    
    def create_collage(self, image_urls: List[str], 
                      template: Optional[str] = None) -> Tuple[Image.Image, str]:
        """
        สร้าง collage จาก URLs
        
        Returns:
            (collage_image, template_used)
        """
        # ดาวน์โหลดรูปทั้งหมด
        images = []
        for url in image_urls:
            try:
                img = self.download_image(url)
                images.append(img)
            except Exception as e:
                print(f"Warning: Failed to download {url}: {e}")
                continue
        
        if not images:
            raise Exception("No valid images to create collage")
        
        # เลือก template
        if not template:
            template = self.select_template(len(images))
        
        # สร้าง collage ตาม template
        if template == 'hero_grid':
            collage = self.layout_hero_grid(images)
        elif template == 'split':
            collage = self.layout_split(images)
        elif template == 'masonry':
            collage = self.layout_masonry(images)
        elif template == 'grid':
            collage = self.layout_grid(images)
        else:
            # Default
            collage = self.layout_hero_grid(images)
            template = 'hero_grid'
        
        return collage, template

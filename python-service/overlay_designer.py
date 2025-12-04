"""
Overlay Designer: รูปหลักเต็มจอ + รูปเล็กซ้อนทับอย่างสวยงาม
พร้อม Graphic Template Patterns ที่ดึงสีจากรูป
"""

from PIL import Image, ImageDraw, ImageFilter
from typing import List, Tuple, Optional
import random
from collections import Counter
import math

class OverlayDesigner:
    """
    ออกแบบแบบ Overlay: รูปหลัก 1 รูป + รูปเล็กซ้อนทับ + Template Patterns
    """
    
    def __init__(self, aspect_ratio: str = "3:1"):
        """
        aspect_ratio: "3:1" หรือ "2:1"
        """
        self.aspect_ratio = aspect_ratio
        
        # คำนวณขนาด canvas
        if aspect_ratio == "3:1":
            self.canvas_size = (1800, 600)  # 3:1
        elif aspect_ratio == "2:1":
            self.canvas_size = (1600, 800)  # 2:1
        else:
            self.canvas_size = (1800, 600)  # default
        
        self.margin = 20
        
    def extract_dominant_colors(self, image: Image.Image, num_colors: int = 3) -> List[Tuple[int, int, int]]:
        """
        ดึงสีหลักจากภาพ
        """
        img_small = image.copy()
        img_small.thumbnail((150, 150))
        
        if img_small.mode != 'RGB':
            img_small = img_small.convert('RGB')
        
        pixels = list(img_small.getdata())
        
        # ลด quantization
        quantized = []
        for r, g, b in pixels:
            qr = (r // 30) * 30
            qg = (g // 30) * 30
            qb = (b // 30) * 30
            quantized.append((qr, qg, qb))
        
        color_counts = Counter(quantized)
        most_common = color_counts.most_common(num_colors * 3)
        
        # กรองสีสด
        vibrant_colors = []
        for color, count in most_common:
            r, g, b = color
            color_variance = max(r, g, b) - min(r, g, b)
            if color_variance > 30:
                vibrant_colors.append(color)
                if len(vibrant_colors) >= num_colors:
                    break
        
        if len(vibrant_colors) < num_colors:
            for color, count in most_common:
                if color not in vibrant_colors:
                    vibrant_colors.append(color)
                    if len(vibrant_colors) >= num_colors:
                        break
        
        return vibrant_colors[:num_colors]
    
    def create_gradient_overlay(self, size: Tuple[int, int], 
                               color1: Tuple[int, int, int], 
                               color2: Tuple[int, int, int],
                               opacity: int = 180) -> Image.Image:
        """
        สร้าง gradient overlay แบบโปร่งใส
        """
        gradient = Image.new('RGBA', size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(gradient)
        
        width, height = size
        
        # Diagonal gradient
        for y in range(height):
            for x in range(width):
                ratio = (x + y) / (width + height)
                r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
                g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
                b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
                draw.point((x, y), fill=(r, g, b, opacity))
        
        return gradient
    
    def create_geometric_pattern(self, size: Tuple[int, int], 
                                 color: Tuple[int, int, int]) -> Image.Image:
        """
        สร้างลาย geometric (วงกลม + เส้น) แบบ abstract
        """
        pattern = Image.new('RGBA', size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(pattern)
        
        width, height = size
        
        # วงกลมใหญ่มุมขวาบน
        circle_r = int(min(width, height) * 0.4)
        draw.ellipse(
            [(width - circle_r - 50, -circle_r//2), (width + 50, circle_r//2 + 50)],
            fill=(*color, 40)  # โปร่งมาก
        )
        
        # วงกลมเล็กมุมซ้ายล่าง
        small_r = int(min(width, height) * 0.25)
        draw.ellipse(
            [(-small_r//2, height - small_r - 50), (small_r//2 + 50, height + 50)],
            fill=(*color, 50)
        )
        
        # เส้นทแยงแบบบาง
        for i in range(0, width, 100):
            draw.line([(i, 0), (i + height, height)], fill=(*color, 20), width=2)
        
        return pattern
    
    def create_wave_pattern(self, size: Tuple[int, int], 
                           color: Tuple[int, int, int]) -> Image.Image:
        """
        สร้างลายคลื่น (wave) แบบนุ่มนวล
        """
        pattern = Image.new('RGBA', size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(pattern)
        
        width, height = size
        
        # วาดคลื่น 3 ชั้น
        for wave_offset in [0, height//3, height*2//3]:
            points = []
            for x in range(0, width + 50, 10):
                y = wave_offset + int(80 * math.sin(x * 0.01))
                points.append((x, y))
            
            # วาดเส้นคลื่น
            for i in range(len(points) - 1):
                draw.line([points[i], points[i+1]], fill=(*color, 30), width=3)
        
        return pattern
    
    def create_dots_pattern(self, size: Tuple[int, int], 
                           color: Tuple[int, int, int]) -> Image.Image:
        """
        สร้างลายจุด (dots) แบบสุ่ม
        """
        pattern = Image.new('RGBA', size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(pattern)
        
        width, height = size
        
        # สุ่มจุดประมาณ 100 จุด
        random.seed(42)  # ให้ผลลัพธ์เหมือนเดิมทุกครั้ง
        for _ in range(100):
            x = random.randint(0, width)
            y = random.randint(0, height)
            r = random.randint(5, 20)
            opacity = random.randint(20, 60)
            draw.ellipse([(x-r, y-r), (x+r, y+r)], fill=(*color, opacity))
        
        return pattern
    
    def fit_image(self, image: Image.Image, target_size: Tuple[int, int]) -> Image.Image:
        """
        Crop รูปให้เต็มพื้นที่ (cover style)
        """
        target_w, target_h = target_size
        img_ratio = image.width / image.height
        target_ratio = target_w / target_h
        
        if img_ratio > target_ratio:
            new_h = image.height
            new_w = int(new_h * target_ratio)
            left = (image.width - new_w) // 2
            cropped = image.crop((left, 0, left + new_w, image.height))
        else:
            new_w = image.width
            new_h = int(new_w / target_ratio)
            top = (image.height - new_h) // 2
            cropped = image.crop((0, top, image.width, top + new_h))
        
        return cropped.resize(target_size, Image.Resampling.LANCZOS)
    
    def add_shadow(self, image: Image.Image, offset: int = 10, blur: int = 20) -> Image.Image:
        """
        เพิ่มเงาให้รูปเล็ก
        """
        # สร้าง shadow layer
        shadow_size = (image.width + offset*2, image.height + offset*2)
        shadow = Image.new('RGBA', shadow_size, (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        
        # วาดเงา
        shadow_draw.rectangle(
            [(offset, offset), (image.width + offset, image.height + offset)],
            fill=(0, 0, 0, 120)
        )
        
        # Blur เงา
        shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
        
        # Paste รูปลงบนเงา
        result = Image.new('RGBA', shadow_size, (0, 0, 0, 0))
        result.paste(shadow, (0, 0))
        
        # แปลง image เป็น RGBA
        if image.mode != 'RGBA':
            image_rgba = image.convert('RGBA')
        else:
            image_rgba = image
        
        result.paste(image_rgba, (offset, offset), image_rgba)
        
        return result
    
    def create_overlay_design(self, images: List[Image.Image], 
                             hero_index: int = 0,
                             pattern_style: str = "auto") -> Image.Image:
        """
        สร้างดีไซน์แบบ overlay
        
        Args:
            images: รูปทั้งหมด
            hero_index: index ของรูปหลัก (0-based)
            pattern_style: "geometric", "wave", "dots", "auto" (สุ่ม)
        """
        if not images:
            raise ValueError("No images provided")
        
        # ตรวจสอบ hero_index
        if hero_index >= len(images):
            hero_index = 0
        
        # 1. วางรูปหลักเต็มจอ
        hero_image = images[hero_index]
        canvas = self.fit_image(hero_image, self.canvas_size)
        canvas = canvas.convert('RGBA')
        
        # 2. ดึงสีจากรูปหลัก
        colors = self.extract_dominant_colors(hero_image, num_colors=3)
        primary_color = colors[0]
        secondary_color = colors[1] if len(colors) > 1 else primary_color
        
        # 3. สร้าง gradient overlay เบาๆ
        gradient = self.create_gradient_overlay(
            self.canvas_size, 
            primary_color, 
            secondary_color, 
            opacity=120  # โปร่ง 50%
        )
        canvas.paste(gradient, (0, 0), gradient)
        
        # 4. เพิ่ม pattern template
        if pattern_style == "auto":
            pattern_style = random.choice(["geometric", "wave", "dots"])
        
        if pattern_style == "geometric":
            pattern = self.create_geometric_pattern(self.canvas_size, primary_color)
        elif pattern_style == "wave":
            pattern = self.create_wave_pattern(self.canvas_size, primary_color)
        else:  # dots
            pattern = self.create_dots_pattern(self.canvas_size, primary_color)
        
        canvas.paste(pattern, (0, 0), pattern)
        
        # 5. วางรูปเล็กซ้อนทับ (ถ้ามีรูปอื่นนอกจากรูปหลัก)
        other_images = [img for i, img in enumerate(images) if i != hero_index]
        
        if other_images:
            # คำนวณขนาดและตำแหน่งรูปเล็ก
            num_small = min(len(other_images), 4)  # สูงสุด 4 รูปเล็ก
            
            # ขนาดรูปเล็ก: 20-25% ของ canvas
            small_size_percent = 0.22
            small_w = int(self.canvas_size[0] * small_size_percent)
            small_h = int(self.canvas_size[1] * small_size_percent * 1.2)  # สูงกว่าเล็กน้อย
            
            # ตำแหน่งวางรูปเล็ก (ขวาบน, ขวาล่าง, ซ้ายล่าง)
            positions = self._calculate_overlay_positions(num_small, (small_w, small_h))
            
            for i, img in enumerate(other_images[:num_small]):
                # Resize รูปเล็ก
                small_img = self.fit_image(img, (small_w, small_h))
                
                # เพิ่มเงา
                small_with_shadow = self.add_shadow(small_img, offset=8, blur=15)
                
                # Paste ลงบน canvas
                x, y = positions[i]
                canvas.paste(small_with_shadow, (x, y), small_with_shadow)
        
        # Convert กลับเป็น RGB
        final = Image.new('RGB', self.canvas_size, (255, 255, 255))
        final.paste(canvas, (0, 0), canvas)
        
        return final
    
    def _calculate_overlay_positions(self, num_images: int, 
                                    image_size: Tuple[int, int]) -> List[Tuple[int, int]]:
        """
        คำนวณตำแหน่งวางรูปเล็กให้สวยงาม
        """
        w, h = self.canvas_size
        img_w, img_h = image_size
        margin = 40
        spacing = 20
        
        positions = []
        
        if num_images == 1:
            # ขวาล่าง
            positions.append((w - img_w - margin, h - img_h - margin))
        
        elif num_images == 2:
            # ขวาบน, ขวาล่าง
            positions.append((w - img_w - margin, margin))
            positions.append((w - img_w - margin, h - img_h - margin))
        
        elif num_images == 3:
            # ขวาบน, ขวาล่าง, ซ้ายล่าง
            positions.append((w - img_w - margin, margin))
            positions.append((w - img_w - margin, h - img_h - margin))
            positions.append((margin, h - img_h - margin))
        
        else:  # 4 รูป
            # ขวาบน, ขวาล่าง, ซ้ายบน, ซ้ายล่าง
            positions.append((w - img_w - margin, margin))
            positions.append((w - img_w - margin, h - img_h - margin))
            positions.append((margin, margin))
            positions.append((margin, h - img_h - margin))
        
        return positions

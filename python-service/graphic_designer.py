"""
Professional Graphic Design System for Social Media Posts
Automatically creates beautiful, client-ready designs with smart color matching
"""

from PIL import Image, ImageDraw, ImageFilter
from typing import List, Tuple, Dict
import random
from collections import Counter
import requests
from io import BytesIO

class GraphicDesigner:
    """
    สร้างงานกราฟิกโฆษณาแบบมืออาชีพ
    - Auto color extraction จากรูป
    - Smart frame/border design
    - Professional layouts พร้อมส่งมอบลูกค้า
    """
    
    def __init__(self, canvas_size: Tuple[int, int] = (1200, 630)):
        self.canvas_size = canvas_size
        self.margin = 40  # ระยะห่างรอบนอก
        self.frame_width = 15  # ความหนากรอบ
        self.corner_radius = 20  # มุมโค้ง
    
    def download_image(self, url: str) -> Image.Image:
        """
        ดาวน์โหลดรูปจาก URL
        """
        try:
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            img = Image.open(BytesIO(response.content))
            return img.convert('RGB')
        except Exception as e:
            raise Exception(f"Failed to download image from {url}: {str(e)}")
        
    def extract_dominant_colors(self, image: Image.Image, num_colors: int = 3) -> List[Tuple[int, int, int]]:
        """
        ดึงสีหลักจากภาพ
        Returns: [(R,G,B), (R,G,B), ...] เรียงตามความเด่น
        """
        # Resize เล็กลงเพื่อประมวลผลเร็ว
        img_small = image.copy()
        img_small.thumbnail((150, 150))
        
        # Convert to RGB
        if img_small.mode != 'RGB':
            img_small = img_small.convert('RGB')
        
        # นับสีที่ปรากฏ
        pixels = list(img_small.getdata())
        
        # ลดความละเอียดสี (quantize) เพื่อจัดกลุ่ม
        quantized = []
        for r, g, b in pixels:
            # ปัดเศษเป็นหลัก 30
            qr = (r // 30) * 30
            qg = (g // 30) * 30
            qb = (b // 30) * 30
            quantized.append((qr, qg, qb))
        
        # หาสีที่ปรากฏบ่อยที่สุด
        color_counts = Counter(quantized)
        most_common = color_counts.most_common(num_colors * 3)  # เอามากกว่าเผื่อกรอง
        
        # กรองสีที่ซีดเกินไป (grayscale)
        vibrant_colors = []
        for color, count in most_common:
            r, g, b = color
            # ตรวจสอบว่าไม่ใช่สีเทา (variance of RGB > 30)
            color_variance = max(r, g, b) - min(r, g, b)
            if color_variance > 30:
                vibrant_colors.append(color)
                if len(vibrant_colors) >= num_colors:
                    break
        
        # ถ้าไม่เจอสีสดใส ใช้สีที่มีมากที่สุดต่อ
        if len(vibrant_colors) < num_colors:
            for color, count in most_common:
                if color not in vibrant_colors:
                    vibrant_colors.append(color)
                    if len(vibrant_colors) >= num_colors:
                        break
        
        return vibrant_colors[:num_colors]
    
    def get_complementary_color(self, color: Tuple[int, int, int]) -> Tuple[int, int, int]:
        """
        หาสีเติมเต็ม (complementary) สำหรับสร้าง gradient
        """
        r, g, b = color
        # สร้างสีที่เข้มขึ้นหรือ่อน่ลง
        if (r + g + b) / 3 > 128:
            # สีอ่อน -> ทำให้เข้มขึ้น
            return (max(0, r - 40), max(0, g - 40), max(0, b - 40))
        else:
            # สีเข้ม -> ทำให้อ่อนขึ้น
            return (min(255, r + 60), min(255, g + 60), min(255, b + 60))
    
    def create_gradient_background(self, size: Tuple[int, int], 
                                   color1: Tuple[int, int, int], 
                                   color2: Tuple[int, int, int],
                                   direction: str = 'diagonal') -> Image.Image:
        """
        สร้างพื้นหลัง gradient
        direction: 'vertical', 'horizontal', 'diagonal', 'radial'
        """
        width, height = size
        gradient = Image.new('RGB', size)
        draw = ImageDraw.Draw(gradient)
        
        if direction == 'vertical':
            for y in range(height):
                ratio = y / height
                r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
                g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
                b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
                draw.line([(0, y), (width, y)], fill=(r, g, b))
        
        elif direction == 'horizontal':
            for x in range(width):
                ratio = x / width
                r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
                g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
                b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
                draw.line([(x, 0), (x, height)], fill=(r, g, b))
        
        elif direction == 'diagonal':
            for y in range(height):
                for x in range(width):
                    ratio = (x + y) / (width + height)
                    r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
                    g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
                    b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
                    draw.point((x, y), fill=(r, g, b))
        
        return gradient
    
    def add_frame(self, image: Image.Image, 
                  frame_color: Tuple[int, int, int],
                  frame_width: int = 15) -> Image.Image:
        """
        เพิ่มกรอบรอบภาพ
        """
        new_width = image.width + frame_width * 2
        new_height = image.height + frame_width * 2
        
        framed = Image.new('RGB', (new_width, new_height), frame_color)
        framed.paste(image, (frame_width, frame_width))
        
        return framed
    
    def add_rounded_corners(self, image: Image.Image, radius: int = 20) -> Image.Image:
        """
        เพิ่มมุมโค้ง
        """
        mask = Image.new('L', image.size, 0)
        draw = ImageDraw.Draw(mask)
        draw.rounded_rectangle([(0, 0), image.size], radius=radius, fill=255)
        
        result = Image.new('RGBA', image.size, (255, 255, 255, 0))
        result.paste(image, (0, 0))
        result.putalpha(mask)
        
        return result
    
    def create_style_modern_minimal(self, images: List[Image.Image]) -> Image.Image:
        """
        สไตล์ 1: Modern Minimal - กรอบบางสีเรียบ พื้นขาว
        """
        # Extract colors from first image
        colors = self.extract_dominant_colors(images[0], num_colors=1)
        accent_color = colors[0]
        
        canvas = Image.new('RGB', self.canvas_size, (255, 255, 255))
        
        # วาง 2 รูปแบบ split
        available_w = self.canvas_size[0] - self.margin * 3
        half_w = available_w // 2
        available_h = self.canvas_size[1] - self.margin * 2
        
        if len(images) >= 1:
            img1 = images[0].copy()
            img1.thumbnail((half_w, available_h), Image.Resampling.LANCZOS)
            framed1 = self.add_frame(img1, accent_color, frame_width=8)
            x1 = self.margin
            y1 = self.margin + (available_h - framed1.height) // 2
            canvas.paste(framed1, (x1, y1))
        
        if len(images) >= 2:
            img2 = images[1].copy()
            img2.thumbnail((half_w, available_h), Image.Resampling.LANCZOS)
            framed2 = self.add_frame(img2, accent_color, frame_width=8)
            x2 = self.margin * 2 + half_w
            y2 = self.margin + (available_h - framed2.height) // 2
            canvas.paste(framed2, (x2, y2))
        
        return canvas
    
    def create_style_gradient_luxury(self, images: List[Image.Image]) -> Image.Image:
        """
        สไตล์ 2: Gradient Luxury - พื้นหลัง gradient หรูหรา
        """
        # Extract colors
        colors = self.extract_dominant_colors(images[0], num_colors=2)
        color1 = colors[0]
        color2 = self.get_complementary_color(color1)
        
        # สร้างพื้นหลัง gradient
        canvas = self.create_gradient_background(
            self.canvas_size, color1, color2, direction='diagonal'
        )
        
        # วางรูปตรงกลาง
        if len(images) >= 1:
            img = images[0].copy()
            max_w = self.canvas_size[0] - self.margin * 2
            max_h = self.canvas_size[1] - self.margin * 2
            img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
            
            # เพิ่มกรอบสีขาว
            framed = self.add_frame(img, (255, 255, 255), frame_width=20)
            
            x = (self.canvas_size[0] - framed.width) // 2
            y = (self.canvas_size[1] - framed.height) // 2
            canvas.paste(framed, (x, y))
        
        return canvas
    
    def create_style_resort_mountain(self, images: List[Image.Image]) -> Image.Image:
        """
        สไตล์ 3: Resort Mountain - พื้นเขียวเข้ม + hero grid (รูปที่ 1)
        """
        # พื้นหลังสีเขียวเข้มสไตล์รีสอร์ท
        bg_color = (25, 60, 45)  # เขียวเข้ม
        canvas = Image.new('RGB', self.canvas_size, bg_color)
        
        # Hero grid layout: 1 ใหญ่ซ้าย + 3 เล็กขวา
        margin = 30
        spacing = 15
        
        available_w = self.canvas_size[0] - margin * 2 - spacing
        available_h = self.canvas_size[1] - margin * 2
        
        hero_w = int(available_w * 0.58)
        hero_h = available_h
        
        small_w = available_w - hero_w
        small_h = (available_h - spacing * 2) // 3
        
        # รูปหลักซ้าย (ภูเขา/ธรรมชาติ)
        if len(images) >= 1:
            hero = images[0].copy()
            hero.thumbnail((hero_w, hero_h), Image.Resampling.LANCZOS)
            # เพิ่มกรอบสีขาวบางๆ
            framed = self.add_frame(hero, (255, 255, 255), frame_width=10)
            # มุมโค้ง
            framed = self.add_rounded_corners(framed, radius=25)
            x = margin
            y = margin + (hero_h - framed.height) // 2
            # Convert RGBA to RGB for paste
            if framed.mode == 'RGBA':
                bg_temp = Image.new('RGB', framed.size, bg_color)
                bg_temp.paste(framed, (0, 0), framed)
                framed = bg_temp
            canvas.paste(framed, (x, y))
        
        # 3 รูปเล็กขวา
        small_x = margin + hero_w + spacing
        for i in range(min(3, len(images) - 1)):
            if i + 1 < len(images):
                small_y = margin + i * (small_h + spacing)
                small = images[i + 1].copy()
                small.thumbnail((small_w, small_h), Image.Resampling.LANCZOS)
                framed = self.add_frame(small, (255, 255, 255), frame_width=8)
                framed = self.add_rounded_corners(framed, radius=20)
                if framed.mode == 'RGBA':
                    bg_temp = Image.new('RGB', framed.size, bg_color)
                    bg_temp.paste(framed, (0, 0), framed)
                    framed = bg_temp
                canvas.paste(framed, (small_x, small_y))
        
        return canvas
    
    def create_style_eco_nature(self, images: List[Image.Image]) -> Image.Image:
        """
        สไตล์ 4: Eco Nature - สีเขียวธรรมชาติ + forest theme (รูปที่ 2)
        """
        # พื้นหลังสีเขียวธรรมชาติ
        bg_color = (40, 70, 50)
        canvas = Image.new('RGB', self.canvas_size, bg_color)
        
        # Layout เหมือน resort mountain
        margin = 30
        spacing = 15
        
        available_w = self.canvas_size[0] - margin * 2 - spacing
        available_h = self.canvas_size[1] - margin * 2
        
        hero_w = int(available_w * 0.60)
        hero_h = available_h
        
        small_w = available_w - hero_w
        small_h = (available_h - spacing * 2) // 3
        
        # รูปหลักซ้าย (ป่า/ธรรมชาติ)
        if len(images) >= 1:
            hero = images[0].copy()
            hero.thumbnail((hero_w, hero_h), Image.Resampling.LANCZOS)
            framed = self.add_frame(hero, (255, 255, 255), frame_width=12)
            framed = self.add_rounded_corners(framed, radius=30)
            x = margin
            y = margin + (hero_h - framed.height) // 2
            if framed.mode == 'RGBA':
                bg_temp = Image.new('RGB', framed.size, bg_color)
                bg_temp.paste(framed, (0, 0), framed)
                framed = bg_temp
            canvas.paste(framed, (x, y))
        
        # 3 รูปเล็กขวา
        small_x = margin + hero_w + spacing
        for i in range(min(3, len(images) - 1)):
            if i + 1 < len(images):
                small_y = margin + i * (small_h + spacing)
                small = images[i + 1].copy()
                small.thumbnail((small_w, small_h), Image.Resampling.LANCZOS)
                framed = self.add_frame(small, (255, 255, 255), frame_width=8)
                framed = self.add_rounded_corners(framed, radius=20)
                if framed.mode == 'RGBA':
                    bg_temp = Image.new('RGB', framed.size, bg_color)
                    bg_temp.paste(framed, (0, 0), framed)
                    framed = bg_temp
                canvas.paste(framed, (small_x, small_y))
        
        return canvas
    
    def create_style_modern_entrance(self, images: List[Image.Image]) -> Image.Image:
        """
        สไตล์ 5: Modern Entrance - กรอบทอง/ครีม สีเขียวอ่อน (รูปที่ 3)
        """
        # พื้นหลังสีเขียวอ่อน/มิ้นท์
        bg_color = (215, 230, 220)
        canvas = Image.new('RGB', self.canvas_size, bg_color)
        
        margin = 40
        spacing = 20
        
        # Layout: 1 รูปใหญ่บน + 3 รูปเล็กล่าง
        available_w = self.canvas_size[0] - margin * 2
        available_h = self.canvas_size[1] - margin * 2 - spacing
        
        top_h = int(available_h * 0.55)
        top_w = available_w
        
        bottom_h = available_h - top_h
        bottom_w = (available_w - spacing * 2) // 3
        
        # กรอบสีทอง/ครีม
        frame_color = (210, 180, 140)  # ทอง
        
        # รูปใหญ่บน
        if len(images) >= 1:
            top_img = images[0].copy()
            top_img.thumbnail((top_w, top_h), Image.Resampling.LANCZOS)
            framed = self.add_frame(top_img, frame_color, frame_width=15)
            framed = self.add_rounded_corners(framed, radius=25)
            x = margin + (top_w - framed.width) // 2
            y = margin
            if framed.mode == 'RGBA':
                bg_temp = Image.new('RGB', framed.size, bg_color)
                bg_temp.paste(framed, (0, 0), framed)
                framed = bg_temp
            canvas.paste(framed, (x, y))
        
        # 3 รูปเล็กล่าง
        bottom_y = margin + top_h + spacing
        for i in range(min(3, len(images) - 1)):
            if i + 1 < len(images):
                bottom_x = margin + i * (bottom_w + spacing)
                small = images[i + 1].copy()
                small.thumbnail((bottom_w, bottom_h), Image.Resampling.LANCZOS)
                framed = self.add_frame(small, frame_color, frame_width=10)
                framed = self.add_rounded_corners(framed, radius=20)
                if framed.mode == 'RGBA':
                    bg_temp = Image.new('RGB', framed.size, bg_color)
                    bg_temp.paste(framed, (0, 0), framed)
                    framed = bg_temp
                canvas.paste(framed, (bottom_x, bottom_y))
        
        return canvas
    
    def select_random_style(self, images: List[Image.Image]) -> Image.Image:
        """
        สุ่มเลือกสไตล์จาก 5 แบบ
        """
        styles = [
            self.create_style_modern_minimal,      # สไตล์ 1: ขาว-สะอาด
            self.create_style_gradient_luxury,     # สไตล์ 2: gradient หรูหรา
            self.create_style_resort_mountain,     # สไตล์ 3: เขียวเข้ม ภูเขา
            self.create_style_eco_nature,          # สไตล์ 4: เขียวธรรมชาติ
            self.create_style_modern_entrance,     # สไตล์ 5: ครีม-ทอง
        ]
        
        selected_style = random.choice(styles)
        return selected_style(images)
    
    def process(self, image_urls: List[str]) -> Image.Image:
        """
        ฟังก์ชันหลักที่เรียกใช้จากภายนอก
        รับ URLs → ดาวน์โหลด → สุ่มสไตล์ → คืนรูปที่สร้างเสร็จ
        """
        print(f"📥 Downloading {len(image_urls)} images...")
        images = []
        
        for i, url in enumerate(image_urls):
            try:
                print(f"  [{i+1}/{len(image_urls)}] {url[:60]}...")
                img = self.download_image(url)
                images.append(img)
            except Exception as e:
                print(f"  ⚠️ Warning: Failed to download image {i+1}: {e}")
                continue
        
        if not images:
            raise Exception("❌ No valid images downloaded!")
        
        print(f"✅ Successfully loaded {len(images)} images")
        print(f"🎨 Selecting random design style...")
        
        # สร้างงานกราฟิก
        result = self.select_random_style(images)
        
        print(f"✅ Graphic design created: {result.size}")
        return result

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// 🎨 ธีมสีสำหรับ Overlay Design
const THEMES: Record<string, { bg: string; accent: string; overlay: string }> = {
  modern: {
    bg: '#1a1a1a',
    accent: '#4F46E5',
    overlay: 'rgba(0, 0, 0, 0.3)',
  },
  resort: {
    bg: '#F0F8FF',
    accent: '#87CEEB',
    overlay: 'rgba(135, 206, 235, 0.2)',
  },
  luxury: {
    bg: '#1C3823',
    accent: '#D4AF37',
    overlay: 'rgba(212, 175, 55, 0.2)',
  },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const images = searchParams.getAll('image');
    const aspectRatio = searchParams.get('aspectRatio') || '3:1'; // 3:1 หรือ 2:1
    const heroIndex = parseInt(searchParams.get('heroIndex') || '0');
    const styleParam = searchParams.get('style') || 'modern';
    
    const theme = THEMES[styleParam] || THEMES.modern;

    if (images.length === 0) {
      return new Response('Missing image URL', { status: 400 });
    }

    // คำนวณขนาด canvas ตาม aspect ratio
    let width = 1800;
    let height = 600;
    
    if (aspectRatio === '2:1') {
      width = 1600;
      height = 800;
    }

    // ========================================
    // 🖼️ OVERLAY DESIGN: รูปหลัก + รูปเล็กซ้อนทับ
    // ========================================
    
    // กำหนด Hero Image (รูปหลัก)
    const heroImage = images[heroIndex] || images[0];
    
    // รูปที่เหลือ (สูงสุด 4 รูป)
    const overlayImages = images
      .filter((_, idx) => idx !== heroIndex)
      .slice(0, 4);

    // คำนวณขนาดและตำแหน่งรูปเล็ก (16% ของ canvas)
    const smallPercent = 0.16;
    const smallWidth = Math.floor(width * smallPercent);
    const smallHeight = Math.floor(height * smallPercent * 1.1);
    const margin = 50;
    const _spacing = 30;

    // คำนวณตำแหน่งรูปเล็ก
    const positions: Array<{ x: number; y: number }> = [];
    
    if (overlayImages.length === 1) {
      positions.push({ x: width - smallWidth - margin, y: height - smallHeight - margin });
    } else if (overlayImages.length === 2) {
      positions.push({ x: width - smallWidth - margin, y: margin });
      positions.push({ x: width - smallWidth - margin, y: height - smallHeight - margin });
    } else if (overlayImages.length === 3) {
      positions.push({ x: width - smallWidth - margin, y: margin });
      positions.push({ x: width - smallWidth - margin, y: height - smallHeight - margin });
      positions.push({ x: margin, y: height - smallHeight - margin });
    } else if (overlayImages.length >= 4) {
      positions.push({ x: width - smallWidth - margin, y: margin });
      positions.push({ x: width - smallWidth - margin, y: height - smallHeight - margin });
      positions.push({ x: margin, y: margin });
      positions.push({ x: margin, y: height - smallHeight - margin });
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            position: 'relative',
            backgroundColor: '#000',
          }}
        >
          {/* 1. รูปหลักเต็มจอ */}
          <img
            src={heroImage}
            alt="Hero background"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          />

          {/* 2. Gradient Overlay เบาๆ */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: `linear-gradient(135deg, ${theme.overlay}, transparent)`,
            }}
          />

          {/* 3. Pattern Overlay (Geometric) */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0.15,
              display: 'flex',
            }}
          >
            <svg width={width} height={height}>
              {/* วงกลมตกแต่ง */}
              <circle cx={width * 0.1} cy={height * 0.2} r="80" fill={theme.accent} opacity="0.3" />
              <circle cx={width * 0.9} cy={height * 0.8} r="60" fill={theme.accent} opacity="0.2" />
              
              {/* เส้นทแยง */}
              <line x1="0" y1={height * 0.3} x2={width} y2={height * 0.7} stroke={theme.accent} strokeWidth="2" opacity="0.4" />
              <line x1="0" y1={height * 0.6} x2={width} y2={height * 0.4} stroke={theme.accent} strokeWidth="2" opacity="0.3" />
            </svg>
          </div>

          {/* 4. รูปเล็กซ้อนทับ พร้อมเงา */}
          {overlayImages.map((img, idx) => {
            const pos = positions[idx];
            if (!pos) return null;

            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: smallWidth,
                  height: smallHeight,
                  display: 'flex',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '3px solid white',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                }}
              >
                <img
                  src={img}
                  alt={`Product detail ${idx + 1}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            );
          })}
        </div>
      ),
      { width, height }
    );

  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    console.error('Overlay generation error:', errorMsg);
    return new Response(`Failed to generate overlay image: ${errorMsg}`, { status: 500 });
  }
}

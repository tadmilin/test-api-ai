import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// 🎨 ธีมสี
const THEMES: any = {
  modern: {
    bg: '#ffffff',
    border: '#e5e5e5',
  },
  luxury: {
    bg: '#1C3823',
    border: '#D4AF37',
  },
  minimal: {
    bg: '#f5f5f5',
    border: '#d0d0d0',
  },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const images = searchParams.getAll('image');
    const format = searchParams.get('format') || 'facebook_post'; // facebook_post, instagram_feed, instagram_story
    const styleParam = searchParams.get('style') || 'modern';
    
    const theme = THEMES[styleParam] || THEMES.modern;

    if (images.length === 0) {
      return new Response('Missing image URL', { status: 400 });
    }

    // คำนวณขนาดตาม format
    let width = 1200;
    let height = 630;
    
    switch (format) {
      case 'instagram_feed':
        width = 1080;
        height = 1080;
        break;
      case 'instagram_story':
        width = 1080;
        height = 1920;
        break;
      case 'custom_16_9':
        width = 1920;
        height = 1080;
        break;
      case 'custom_4_3':
        width = 1600;
        height = 1200;
        break;
      case 'custom_1_1':
        width = 1200;
        height = 1200;
        break;
      default: // facebook_post
        width = 1200;
        height = 630;
    }

    // ==========================================
    // 🖼️ CASE 1: รูปเดียว (SINGLE FRAME)
    // ==========================================
    if (images.length === 1) {
      return new ImageResponse(
        (
          <div
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              backgroundColor: theme.bg,
              padding: '20px',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '100%',
                height: '100%',
                border: `4px solid ${theme.border}`,
                overflow: 'hidden',
              }}
            >
              <img
                src={images[0]}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          </div>
        ),
        { width, height }
      );
    }

    // ==========================================
    // 🖼️ CASE 2: สองรูป (SPLIT SCREEN)
    // ==========================================
    if (images.length === 2) {
      return new ImageResponse(
        (
          <div
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              backgroundColor: theme.bg,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '50%',
                height: '100%',
                borderRight: `4px solid ${theme.bg}`,
              }}
            >
              <img
                src={images[0]}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                width: '50%',
                height: '100%',
                borderLeft: `4px solid ${theme.bg}`,
              }}
            >
              <img
                src={images[1]}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          </div>
        ),
        { width, height }
      );
    }

    // ==========================================
    // 🖼️ CASE 3: สามรูปขึ้นไป (HERO GRID)
    // ==========================================
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            backgroundColor: theme.bg,
            padding: '20px',
            gap: '20px',
          }}
        >
          {/* รูปใหญ่ ซ้าย (60%) */}
          <div
            style={{
              display: 'flex',
              width: '60%',
              height: '100%',
              overflow: 'hidden',
              border: `2px solid ${theme.border}`,
            }}
          >
            <img
              src={images[0]}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>

          {/* คอลัมน์ขวา (40%) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '40%',
              height: '100%',
              gap: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                height: '50%',
                width: '100%',
                overflow: 'hidden',
                border: `2px solid ${theme.border}`,
              }}
            >
              <img
                src={images[1]}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                height: '50%',
                width: '100%',
                overflow: 'hidden',
                border: `2px solid ${theme.border}`,
              }}
            >
              <img
                src={images[2] || images[1]}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          </div>
        </div>
      ),
      { width, height }
    );
  } catch (e: any) {
    console.error('Graphic generation error:', e.message);
    return new Response(`Failed to generate graphic: ${e.message}`, {
      status: 500,
    });
  }
}

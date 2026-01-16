import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;

  // Get internal API URL
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL_INTERNAL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://api:8000';

  try {
    // Fetch image from backend API
    const imageResponse = await fetch(`${apiUrl}/upload/images/${filename}`, {
      headers: {
        // Forward relevant headers
        ...(request.headers.get('range') && {
          Range: request.headers.get('range')!,
        }),
      },
    });

    if (!imageResponse.ok) {
      return new Response('Image not found', { status: 404 });
    }

    // Get image data
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType =
      imageResponse.headers.get('content-type') || 'image/jpeg';

    // Return image with proper headers
    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...(imageResponse.headers.get('content-length') && {
          'Content-Length': imageResponse.headers.get('content-length')!,
        }),
      },
    });
  } catch (error) {
    console.error('Error proxying image:', error);
    return new Response('Error loading image', { status: 500 });
  }
}

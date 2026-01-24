import { useEffect, useRef } from 'react';
import './DitheredLoader.css';

export const DitheredLoader = () => {
  const canvasRef = useRef(null);
  const sparkleCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const sparkleAnimationRef = useRef(null);
  const ditherDataRef = useRef(null); // Store dithered image data for influence map

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Set canvas size to match viewport
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Load the dithered image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/ditherfirst.jpg';

    img.onload = () => {
      imageRef.current = img;
      
      // Draw image to canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // First pass: Increase contrast and reduce brightness for more black
      const contrast = 4.5; // Higher contrast = more intense dithering
      const brightness = -60; // Reduce brightness to push toward black
      const intercept = 128 * (1 - contrast);
      
      for (let i = 0; i < data.length; i += 4) {
        // Apply contrast and brightness to RGB channels
        data[i] = Math.max(0, Math.min(255, (data[i] * contrast) + intercept + brightness));     // R
        data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] * contrast) + intercept + brightness)); // G
        data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] * contrast) + intercept + brightness)); // B
      }
      
      // Second pass: Apply ordered dithering (Bayer dither)
      // 4x4 Bayer matrix for ordered dithering
      const bayerMatrix = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
      ];
      
      const threshold = 200; // Much higher threshold = many more black pixels (much less gray)
      const intensity = 2.0; // Increase this to make dithering more intense (1.0 = normal, higher = more intense)
      
      for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % canvas.width;
        const y = Math.floor((i / 4) / canvas.width);
        
        // Calculate luminance from contrast-adjusted values
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // Get Bayer matrix value for this pixel
        const matrixX = x % 4;
        const matrixY = y % 4;
        const matrixValue = bayerMatrix[matrixY][matrixX];
        
        // Apply dithering threshold with intensity multiplier
        // Scale the matrix value more aggressively for stronger dithering
        const ditherThreshold = threshold + ((matrixValue * 16 - 128) * intensity);
        const output = luminance > ditherThreshold ? 255 : 0;
        
        // Set to black or white
        data[i] = output;     // R
        data[i + 1] = output; // G
        data[i + 2] = output; // B
        // Alpha stays the same
      }
      
      // Put dithered image data back
      ctx.putImageData(imageData, 0, 0);
      
      // Store dithered data for sparkle influence map
      ditherDataRef.current = {
        data: new Uint8ClampedArray(imageData.data),
        width: canvas.width,
        height: canvas.height
      };
    };

    img.onerror = () => {
      // Fallback if image fails to load
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading...', canvas.width / 2, canvas.height / 2);
    };

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (sparkleAnimationRef.current) {
        cancelAnimationFrame(sparkleAnimationRef.current);
      }
    };
  }, []);

  // Sparkle effect - random white points appearing and disappearing, influenced by dither pattern
  useEffect(() => {
    const sparkleCanvas = sparkleCanvasRef.current;
    if (!sparkleCanvas) return;

    const sparkleCtx = sparkleCanvas.getContext('2d');
    if (!sparkleCtx) return;

    const resizeSparkleCanvas = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Only resize if dimensions changed to avoid clearing canvas unnecessarily
      if (sparkleCanvas.width !== width || sparkleCanvas.height !== height) {
        sparkleCanvas.width = width;
        sparkleCanvas.height = height;
      }
    };
    resizeSparkleCanvas();
    window.addEventListener('resize', resizeSparkleCanvas);

    // Helper function to sample dither pattern at a position
    const sampleDitherPattern = (x, y) => {
      if (!ditherDataRef.current) return 0; // No dither data yet
      
      const { data, width, height } = ditherDataRef.current;
      const px = Math.floor(x);
      const py = Math.floor(y);
      
      if (px < 0 || px >= width || py < 0 || py >= height) return 0;
      
      const index = (py * width + px) * 4;
      // Get luminance (since it's black/white, any channel works)
      const luminance = data[index]; // R channel (0 = black, 255 = white)
      return luminance / 255; // Normalize to 0-1
    };

    let animationRunning = true;
    let sparkles = [];

    const createSparkles = () => {
      if (!ditherDataRef.current) return; // Wait for dither data
      
      // Create array of sparkle points, influenced by dither pattern
      const sparkleCount = 10000; // Number of sparkles
      sparkles = [];
      
      // Try to place sparkles, with higher probability on white pixels
      let attempts = 0;
      const maxAttempts = sparkleCount * 3; // Allow more attempts to find good positions
      
      while (sparkles.length < sparkleCount && attempts < maxAttempts) {
        attempts++;
        const x = Math.random() * sparkleCanvas.width;
        const y = Math.random() * sparkleCanvas.height;
        
        // Sample dither pattern at this position
        const ditherValue = sampleDitherPattern(x, y);
        
        // Higher probability of placing sparkle on white pixels (ditherValue close to 1)
        // Use weighted random: more likely on white, but still allow some on black
        const placementProbability = ditherValue * 0.8 + 0.2; // 20% base chance, up to 100% on white
        
        if (Math.random() < placementProbability) {
          sparkles.push({
            x,
            y,
            size: Math.random() * 1.2 + 0.3, // Random size between 0.3 and 1.5
            baseOpacity: ditherValue * 0.5 + 0.3, // Base opacity influenced by dither (0.3-0.8)
            opacity: Math.random(), // Random starting opacity
            speed: Math.random() * 0.15 + 0.1, // Much faster animation speed
            phase: Math.random() * Math.PI * 2, // Random phase for sine wave
          });
        }
      }
    };

    const animateSparkles = () => {
      if (!animationRunning) return;

      // Clear canvas
      sparkleCtx.clearRect(0, 0, sparkleCanvas.width, sparkleCanvas.height);
      
      // Update and draw each sparkle
      sparkles.forEach((sparkle) => {
        // Use sine wave for smooth fade in/out
        const sineOpacity = (Math.sin(sparkle.phase) + 1) / 2; // Convert to 0-1 range
        
        // Combine sine wave with base opacity from dither pattern
        sparkle.opacity = sineOpacity * sparkle.baseOpacity;
        
        // Update phase for animation
        sparkle.phase += sparkle.speed;
        if (sparkle.phase > Math.PI * 2) {
          sparkle.phase -= Math.PI * 2;
        }

        // Draw white point - influenced by dither pattern
        if (sparkle.opacity > 0.05) { // Lower threshold to show more sparkles
          sparkleCtx.fillStyle = `rgba(255, 255, 255, ${sparkle.opacity})`;
          sparkleCtx.beginPath();
          sparkleCtx.arc(sparkle.x, sparkle.y, sparkle.size, 0, Math.PI * 2);
          sparkleCtx.fill();
        }
      });

      sparkleAnimationRef.current = requestAnimationFrame(animateSparkles);
    };

    // Wait for dither data, then create sparkles and start animation
    const checkDitherData = setInterval(() => {
      if (ditherDataRef.current) {
        clearInterval(checkDitherData);
        createSparkles();
        // Start animation
        sparkleAnimationRef.current = requestAnimationFrame(animateSparkles);
      }
    }, 100);
    
    // If dither data is already available, start immediately
    if (ditherDataRef.current) {
      clearInterval(checkDitherData);
      createSparkles();
      sparkleAnimationRef.current = requestAnimationFrame(animateSparkles);
    }

    return () => {
      clearInterval(checkDitherData);
      animationRunning = false;
      window.removeEventListener('resize', resizeSparkleCanvas);
      if (sparkleAnimationRef.current) {
        cancelAnimationFrame(sparkleAnimationRef.current);
        sparkleAnimationRef.current = null;
      }
    };
  }, []);

  return (
    <div className="dithered-loader">
      <canvas ref={canvasRef} className="dithered-canvas" />
      <canvas ref={sparkleCanvasRef} className="sparkle-canvas" />
    </div>
  );
};

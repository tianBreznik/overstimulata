/**
 * Converts an image file to base64 data URI with compression
 * Stores images directly in Firestore (no Firebase Storage billing)
 * @param {File} file - Image file to convert
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width (default: 1200px)
 * @param {number} options.maxHeight - Maximum height (default: 1200px)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.8)
 * @returns {Promise<string>} Base64 data URI
 */
export async function convertImageToBase64(file, { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    // Check file size (Firestore limit is ~1MB per field, but we'll compress)
    if (file.size > 10 * 1024 * 1024) { // 10MB limit before compression
      reject(new Error('Image too large. Please use an image under 10MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        // Create canvas and compress
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to base64 JPEG (smaller than PNG)
        const dataUri = canvas.toDataURL('image/jpeg', quality);
        
        // Check final size (Firestore has ~1MB field limit)
        const base64Size = (dataUri.length * 3) / 4;
        if (base64Size > 900 * 1024) { // ~900KB to be safe
          reject(new Error('Image too large after compression. Please use a smaller image.'));
          return;
        }

        resolve(dataUri);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}



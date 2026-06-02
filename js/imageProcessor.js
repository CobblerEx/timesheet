/**
 * Image Processing Module
 * Handles compression, resizing, and validation
 */

class ImageProcessor {
  constructor(options = {}) {
    this.maxWidth = options.maxWidth || 1920;
    this.maxHeight = options.maxHeight || 1920;
    this.quality = options.quality || 0.85;
    this.thumbnailSize = options.thumbnailSize || 200;
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024; // 5MB
    this.allowedTypes = options.allowedTypes || [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ];
  }

  /**
   * Validate image file
   */
  validateFile(file) {
    const errors = [];

    if (!file) {
      errors.push('No file selected');
      return { valid: false, errors };
    }

    if (!this.allowedTypes.includes(file.type)) {
      errors.push(`File type not allowed. Allowed: ${this.allowedTypes.join(', ')}`);
    }

    if (file.size > this.maxFileSize) {
      errors.push(`File size exceeds ${this._formatBytes(this.maxFileSize)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      file
    };
  }

  /**
   * Compress image to blob
   */
  async compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // Calculate new dimensions
          let width = img.width;
          let height = img.height;

          if (width > this.maxWidth || height > this.maxHeight) {
            const ratio = Math.min(this.maxWidth / width, this.maxHeight / height);
            width *= ratio;
            height *= ratio;
          }

          canvas.width = width;
          canvas.height = height;

          // Draw and compress
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              resolve({
                blob,
                width,
                height,
                originalSize: file.size,
                compressedSize: blob.size,
                compressionRatio: (blob.size / file.size * 100).toFixed(2)
              });
            },
            'image/jpeg',
            this.quality
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Generate thumbnail
   */
  async generateThumbnail(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // Calculate dimensions maintaining aspect ratio
          const ratio = Math.min(
            this.thumbnailSize / img.width,
            this.thumbnailSize / img.height
          );

          const width = img.width * ratio;
          const height = img.height * ratio;

          canvas.width = this.thumbnailSize;
          canvas.height = this.thumbnailSize;

          // Center image on canvas
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, this.thumbnailSize, this.thumbnailSize);
          ctx.drawImage(
            img,
            (this.thumbnailSize - width) / 2,
            (this.thumbnailSize - height) / 2,
            width,
            height
          );

          canvas.toBlob(
            (blob) => resolve(blob),
            'image/jpeg',
            0.8
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert blob to URL
   */
  blobToUrl(blob) {
    return URL.createObjectURL(blob);
  }

  /**
   * Revoke blob URL
   */
  revokeUrl(url) {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Get image metadata
   */
  async getImageMetadata(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          resolve({
            width: img.width,
            height: img.height,
            aspectRatio: img.width / img.height
          });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // Helper methods
  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// Initialize globally
const imageProcessor = new ImageProcessor();

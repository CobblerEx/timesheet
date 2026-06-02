/**
 * IndexedDB Database Manager
 * Handles all data persistence for quotes and photos
 */

class DatabaseManager {
  constructor() {
    this.dbName = 'TimesheetDB';
    this.version = 1;
    this.db = null;
  }

  /**
   * Initialize the database
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Quotes store
        if (!db.objectStoreNames.contains('quotes')) {
          const quotesStore = db.createObjectStore('quotes', { keyPath: 'id' });
          quotesStore.createIndex('createdAt', 'createdAt', { unique: false });
          quotesStore.createIndex('status', 'status', { unique: false });
        }

        // Photos store
        if (!db.objectStoreNames.contains('photos')) {
          const photosStore = db.createObjectStore('photos', { keyPath: 'id' });
          photosStore.createIndex('quoteId', 'quoteId', { unique: false });
          photosStore.createIndex('uploadDate', 'uploadDate', { unique: false });
        }
      };
    });
  }

  /**
   * Add or update a quote
   */
  async saveQuote(quote) {
    if (!this.db) throw new Error('Database not initialized');

    const id = quote.id || this._generateId();
    const quoteData = {
      ...quote,
      id,
      createdAt: quote.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      images: quote.images || []
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['quotes'], 'readwrite');
      const store = transaction.objectStore('quotes');
      const request = store.put(quoteData);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(quoteData);
    });
  }

  /**
   * Get a quote by ID
   */
  async getQuote(id) {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['quotes'], 'readonly');
      const store = transaction.objectStore('quotes');
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Get all quotes
   */
  async getAllQuotes() {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['quotes'], 'readonly');
      const store = transaction.objectStore('quotes');
      const index = store.index('createdAt');
      const request = index.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        // Sort by newest first
        resolve(request.result.reverse());
      };
    });
  }

  /**
   * Delete a quote
   */
  async deleteQuote(id) {
    if (!this.db) throw new Error('Database not initialized');

    // Delete associated photos
    await this.deletePhotosByQuoteId(id);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['quotes'], 'readwrite');
      const store = transaction.objectStore('quotes');
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Save a photo blob and associate with quote
   */
  async savePhoto(quoteId, file, metadata = {}) {
    if (!this.db) throw new Error('Database not initialized');

    const photoId = this._generateId();
    const photoData = {
      id: photoId,
      quoteId,
      filename: file.name,
      mimeType: file.type,
      fileSize: file.size,
      uploadDate: new Date().toISOString(),
      metadata: {
        width: metadata.width || null,
        height: metadata.height || null,
        ...metadata
      },
      blob: file
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['photos'], 'readwrite');
      const store = transaction.objectStore('photos');
      const request = store.add(photoData);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        // Update quote's image references
        this.getQuote(quoteId).then(quote => {
          quote.images.push({
            id: photoId,
            filename: file.name,
            uploadDate: photoData.uploadDate,
            size: file.size
          });
          this.saveQuote(quote);
          resolve(photoData);
        });
      };
    });
  }

  /**
   * Get photo blob by ID
   */
  async getPhotoBlob(photoId) {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['photos'], 'readonly');
      const store = transaction.objectStore('photos');
      const request = store.get(photoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const photo = request.result;
        resolve(photo ? photo.blob : null);
      };
    });
  }

  /**
   * Get all photos for a quote
   */
  async getQuotePhotos(quoteId) {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['photos'], 'readonly');
      const store = transaction.objectStore('photos');
      const index = store.index('quoteId');
      const request = index.getAll(quoteId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result.sort((a, b) => 
          new Date(b.uploadDate) - new Date(a.uploadDate)
        ));
      };
    });
  }

  /**
   * Delete a photo
   */
  async deletePhoto(photoId, quoteId) {
    if (!this.db) throw new Error('Database not initialized');

    // Remove from quote's image references
    const quote = await this.getQuote(quoteId);
    quote.images = quote.images.filter(img => img.id !== photoId);
    await this.saveQuote(quote);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['photos'], 'readwrite');
      const store = transaction.objectStore('photos');
      const request = store.delete(photoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Delete all photos for a quote
   */
  async deletePhotosByQuoteId(quoteId) {
    if (!this.db) throw new Error('Database not initialized');

    const photos = await this.getQuotePhotos(quoteId);
    
    return Promise.all(photos.map(photo => this.deletePhoto(photo.id, quoteId)));
  }

  /**
   * Get database statistics
   */
  async getStats() {
    if (!this.db) throw new Error('Database not initialized');

    const quotes = await this.getAllQuotes();
    let totalPhotoSize = 0;
    let totalPhotos = 0;

    for (const quote of quotes) {
      const photos = await this.getQuotePhotos(quote.id);
      totalPhotos += photos.length;
      totalPhotoSize += photos.reduce((sum, p) => sum + p.fileSize, 0);
    }

    return {
      quoteCount: quotes.length,
      photoCount: totalPhotos,
      totalPhotoSize: totalPhotoSize,
      formattedSize: this._formatBytes(totalPhotoSize)
    };
  }

  // Helper methods
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// Initialize globally
const db = new DatabaseManager();

/**
 * Palani Murugan Function Hall - Gallery Lightbox
 */

class GalleryLightbox {
  constructor() {
    this.images = [];
    this.currentIndex = 0;
    this.modal = null;
    this.init();
  }

  init() {
    this.createModal();
    this.attachEvents();
  }

  createModal() {
    let modal = document.getElementById('gallery-lightbox-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'gallery-lightbox-modal';
      modal.className = 'lightbox-modal';
      modal.innerHTML = `
        <button type="button" class="lightbox-close" id="lb-close">&times;</button>
        <button type="button" class="lightbox-nav lightbox-prev" id="lb-prev">&#10094;</button>
        <div class="lightbox-content">
          <img class="lightbox-img" id="lb-img" src="" alt="Hall Photo">
        </div>
        <button type="button" class="lightbox-nav lightbox-next" id="lb-next">&#10095;</button>
      `;
      document.body.appendChild(modal);
    }
    this.modal = modal;
  }

  attachEvents() {
    // Collect all gallery cards
    const cards = document.querySelectorAll('.gallery-card img');
    this.images = Array.from(cards).map(img => img.src);

    cards.forEach((img, idx) => {
      img.parentElement.addEventListener('click', () => {
        this.open(idx);
      });
    });

    document.getElementById('lb-close')?.addEventListener('click', () => this.close());
    document.getElementById('lb-prev')?.addEventListener('click', () => this.prev());
    document.getElementById('lb-next')?.addEventListener('click', () => this.next());

    // Close on backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.modal.classList.contains('active')) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'ArrowRight') this.next();
    });
  }

  open(index) {
    if (this.images.length === 0) return;
    this.currentIndex = index;
    const imgEl = document.getElementById('lb-img');
    imgEl.src = this.images[this.currentIndex];
    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
    document.getElementById('lb-img').src = this.images[this.currentIndex];
  }

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.images.length;
    document.getElementById('lb-img').src = this.images[this.currentIndex];
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new GalleryLightbox();
});

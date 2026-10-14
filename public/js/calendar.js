/**
 * Palani Murugan Function Hall - Availability Calendar
 */

class AvailabilityCalendar {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.hallId = options.hallId || 1;
    this.onDateSelect = options.onDateSelect || null;
    this.selectedDate = options.selectedDate || null;

    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth() + 1; // 1-12

    this.availabilityData = {};
    if (this.container) {
      this.init();
    }
  }

  async init() {
    await this.fetchAvailability();
    this.render();
  }

  async fetchAvailability() {
    try {
      const res = await fetch(`/api/halls/${this.hallId}/availability?year=${this.currentYear}&month=${this.currentMonth}`);
      const json = await res.json();
      if (json.success) {
        this.availabilityData = json.availability || {};
      }
    } catch (err) {
      console.error('Failed to load availability:', err);
    }
  }

  async changeMonth(delta) {
    this.currentMonth += delta;
    if (this.currentMonth > 12) {
      this.currentMonth = 1;
      this.currentYear++;
    } else if (this.currentMonth < 1) {
      this.currentMonth = 12;
      this.currentYear--;
    }
    await this.fetchAvailability();
    this.render();
  }

  render() {
    if (!this.container) return;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthNamesTamil = [
      'ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்',
      'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்'
    ];

    const firstDay = new Date(this.currentYear, this.currentMonth - 1, 1).getDay();
    const daysInMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = `
      <div class="calendar-card">
        <div class="calendar-header">
          <button type="button" class="calendar-nav-btn" id="cal-prev-btn">&larr; Previous</button>
          <div style="text-align:center;">
            <h3 class="calendar-title">${monthNames[this.currentMonth - 1]} ${this.currentYear}</h3>
            <span class="tamil-sub">${monthNamesTamil[this.currentMonth - 1]} ${this.currentYear}</span>
          </div>
          <button type="button" class="calendar-nav-btn" id="cal-next-btn">Next &rarr;</button>
        </div>

        <div class="calendar-legend">
          <div class="legend-item">
            <span class="legend-dot available"></span>
            <span>AVAILABLE (கிடைக்கும்)</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot booked"></span>
            <span>BOOKED (முன்பதிவானது)</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot pending"></span>
            <span>PENDING (நிலுவையில்)</span>
          </div>
        </div>

        <div class="calendar-grid">
          <div class="calendar-day-header">Sun</div>
          <div class="calendar-day-header">Mon</div>
          <div class="calendar-day-header">Tue</div>
          <div class="calendar-day-header">Wed</div>
          <div class="calendar-day-header">Thu</div>
          <div class="calendar-day-header">Fri</div>
          <div class="calendar-day-header">Sat</div>
    `;

    // Empty offset days
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="calendar-day empty"></div>`;
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayDate = new Date(this.currentYear, this.currentMonth - 1, day);

      const isPast = dayDate < today;
      const status = this.availabilityData[dateStr] || 'available';

      let statusClass = 'available';
      let titleText = 'Available for booking';

      if (isPast) {
        statusClass = 'past';
        titleText = 'Past date';
      } else if (status === 'booked') {
        statusClass = 'booked';
        titleText = 'Hall Booked (Unavailable)';
      } else if (status === 'pending') {
        statusClass = 'pending';
        titleText = 'Booking Pending Advance';
      }

      const isSelected = this.selectedDate === dateStr ? 'selected' : '';

      html += `
        <div class="calendar-day ${statusClass} ${isSelected}"
             data-date="${dateStr}"
             data-status="${statusClass}"
             title="${titleText}">
          <span>${day}</span>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    this.container.innerHTML = html;

    // Attach event listeners
    this.container.querySelector('#cal-prev-btn').addEventListener('click', () => this.changeMonth(-1));
    this.container.querySelector('#cal-next-btn').addEventListener('click', () => this.changeMonth(1));

    this.container.querySelectorAll('.calendar-day[data-date]').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.getAttribute('data-date');
        const status = el.getAttribute('data-status');

        if (status === 'available') {
          this.selectedDate = date;
          this.container.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
          el.classList.add('selected');

          if (this.onDateSelect) {
            this.onDateSelect(date);
          }
        } else if (status === 'booked') {
          App.toast(`Date ${date} is already booked. Please pick an available date.`, 'warning');
        } else if (status === 'pending') {
          App.toast(`Date ${date} has a pending booking.`, 'warning');
        }
      });
    });
  }
}

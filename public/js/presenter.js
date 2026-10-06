// Presenter Console Engine for SharePresent
let socket = null;
let roomCode = null;
let roomData = null;

// Presentation State
let currentSlideIndex = 0;
let slides = [];
let presentationMode = 'deck'; // 'deck' | 'pdf' | 'screenshare'
let allowAudienceExplore = false;

// Tools State
let isLaserActive = false;
let isDrawingActive = false;
let drawColor = '#ff2d55';
let drawWidth = 3;
let isDrawing = false;
let lastDrawX = 0;
let lastDrawY = 0;

// Timer State
let timerSeconds = 0;
let timerInterval = null;
let isTimerRunning = true;

// WebRTC Screen Share State
let peer = null;
let screenStream = null;

// Drawing canvas elements
let canvas, ctx;

document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  initCanvas();
  initEventListeners();
  startTimer();
});

// Initialize Socket.io Connection
function initSocket() {
  socket = io();

  const urlParams = Utils.getUrlParams();
  const codeParam = urlParams.get('code');

  // Check if we have pre-created room in session storage
  const cachedRoom = sessionStorage.getItem('sharepresent_created_room');
  if (cachedRoom) {
    try {
      const parsed = JSON.parse(cachedRoom);
      if (!codeParam || parsed.code === codeParam) {
        roomCode = parsed.code;
        roomData = parsed;
        slides = parsed.slides || [];
        updateRoomUI(parsed);
      }
    } catch (e) {
      console.warn('Failed parsing cached room', e);
    }
  }

  // If no room code, create one
  if (!roomCode) {
    socket.emit('room:create', { title: 'Presentasi Baru' }, (res) => {
      if (res && res.success) {
        roomCode = res.code;
        roomData = res.room;
        slides = res.room.slides;
        updateRoomUI(res.room);
      } else {
        alert('Gagal menginisialisasi ruangan presentasi.');
        window.location.href = 'index.html';
      }
    });
  } else {
    // Re-verify room with server
    socket.emit('room:create', { title: roomData ? roomData.title : 'Presentasi' }, (res) => {
      if (res && res.success) {
        roomCode = res.code;
        roomData = res.room;
        slides = res.room.slides;
        updateRoomUI(res.room);
      }
    });
  }

  // Socket Event Listeners
  socket.on('audience:joined', (data) => {
    Utils.showToast(`${data.name} bergabung ke presentasi!`, '👋');
    updateAudienceCount(data.count);
  });

  socket.on('audience:left', (data) => {
    updateAudienceCount(data.count);
  });

  socket.on('audience:count', (data) => {
    updateAudienceCount(data.count);
  });

  socket.on('reaction:received', (data) => {
    spawnReaction(data.emoji);
    Utils.playSound('pop');
  });

  socket.on('qa:new', (question) => {
    addQAItemToDrawer(question);
    updateQABadge();
    Utils.showToast(`Pertanyaan baru dari ${question.author}: "${question.text.substring(0, 30)}..."`, '💬');
    Utils.playSound('pop');
  });

  socket.on('qa:upvoted', (data) => {
    const upvoteEl = document.getElementById(`qa-votes-${data.questionId}`);
    if (upvoteEl) upvoteEl.textContent = `▲ ${data.upvotes}`;
  });

  socket.on('poll:updated', (poll) => {
    renderLivePollResults(poll);
  });
}

// Update Room UI Elements
function updateRoomUI(room) {
  document.getElementById('display-room-code').textContent = room.code;
  document.getElementById('qr-modal-code').textContent = room.code;
  document.getElementById('header-presentation-title').textContent = room.title;
  currentSlideIndex = room.currentSlide || 0;
  totalSlides = room.totalSlides || slides.length;

  document.getElementById('current-slide-num').textContent = currentSlideIndex + 1;
  document.getElementById('total-slide-num').textContent = slides.length;

  // Generate QR Code
  generateQRCode(room.code);

  // Render first slide
  renderSlide(currentSlideIndex);
  updateSpeakerNotes();
}

function updateAudienceCount(count) {
  const el = document.getElementById('audience-count-num');
  if (el) el.textContent = count;
}

// Generate QR Code with join URL
function generateQRCode(code) {
  const targetEl = document.getElementById('qrcode-target');
  if (!targetEl) return;
  targetEl.innerHTML = '';

  const joinUrl = `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
  
  if (typeof QRCode !== 'undefined') {
    new QRCode(targetEl, {
      text: joinUrl,
      width: 210,
      height: 210,
      colorDark: '#090d16',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

// Render Slide Content
function renderSlide(index) {
  if (!slides || slides.length === 0) return;
  if (index < 0) index = 0;
  if (index >= slides.length) index = slides.length - 1;

  currentSlideIndex = index;
  document.getElementById('current-slide-num').textContent = currentSlideIndex + 1;
  document.getElementById('total-slide-num').textContent = slides.length;

  // Update nav buttons disabled state
  document.getElementById('btn-prev-slide').disabled = (currentSlideIndex === 0);
  document.getElementById('btn-next-slide').disabled = (currentSlideIndex === slides.length - 1);

  const surface = document.getElementById('slide-surface');
  const slide = slides[currentSlideIndex];

  // If slide is a PDF or Image slide
  if (presentationMode === 'pdf' || (slide && slide.type === 'pdf') || (slide && slide.imageUrl)) {
    surface.innerHTML = `<img src="${slide.imageUrl}" class="pdf-slide-canvas" alt="Slide ${index + 1}">`;
    clearCanvas();
    updateSpeakerNotes();
    return;
  }

  // Render built-in Keynote deck template
  let contentHtml = '';

  if (slide.type === 'hero') {
    contentHtml = `
      <div class="slide-hero">
        ${slide.badge ? `<div class="slide-badge">${slide.badge}</div>` : ''}
        <h1 class="slide-title">${slide.title}</h1>
        <p class="slide-subtitle">${slide.subtitle || ''}</p>
        ${slide.bulletPoints ? `
          <ul class="slide-bullets">
            ${slide.bulletPoints.map(b => `<li><span style="color: var(--primary);">✓</span> <span>${b}</span></li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `;
  } else if (slide.type === 'cards') {
    contentHtml = `
      <div style="width: 100%; max-width: 950px; text-align: center;">
        ${slide.badge ? `<div class="slide-badge">${slide.badge}</div>` : ''}
        <h2 class="slide-title" style="font-size: clamp(1.8rem, 3.2vw, 3rem);">${slide.title}</h2>
        <p class="slide-subtitle">${slide.subtitle || ''}</p>
        <div class="slide-cards-grid">
          ${slide.cards.map(c => `
            <div class="slide-item-card">
              <div class="slide-item-icon">${c.icon}</div>
              <div style="text-align: left;">
                <div class="slide-item-title">${c.title}</div>
                <div class="slide-item-desc">${c.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (slide.type === 'steps') {
    contentHtml = `
      <div style="width: 100%; max-width: 950px; text-align: center;">
        ${slide.badge ? `<div class="slide-badge">${slide.badge}</div>` : ''}
        <h2 class="slide-title" style="font-size: clamp(1.8rem, 3.2vw, 3.2rem);">${slide.title}</h2>
        <p class="slide-subtitle">${slide.subtitle || ''}</p>
        <div class="slide-steps-grid">
          ${slide.steps.map(s => `
            <div class="slide-step-card" style="text-align: left;">
              <div class="slide-step-num">${s.num}</div>
              <div style="font-weight: 700; font-size: 1.15rem; margin-bottom: 8px;">${s.title}</div>
              <div style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5;">${s.desc}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (slide.type === 'code') {
    contentHtml = `
      <div style="width: 100%; max-width: 950px; text-align: center;">
        ${slide.badge ? `<div class="slide-badge">${slide.badge}</div>` : ''}
        <h2 class="slide-title" style="font-size: clamp(1.8rem, 3.2vw, 3rem);">${slide.title}</h2>
        <div class="slide-code-block">${slide.codeSnippet}</div>
        ${slide.bulletPoints ? `
          <ul class="slide-bullets" style="font-size: 0.95rem;">
            ${slide.bulletPoints.map(b => `<li><span style="color: var(--accent-cyan);">✦</span> <span>${b}</span></li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `;
  }

  surface.innerHTML = contentHtml;
  clearCanvas();
  updateSpeakerNotes();
}

// Update Speaker Notes Panel
function updateSpeakerNotes() {
  const notesEl = document.getElementById('slide-notes-content');
  if (!notesEl) return;
  const currentSlide = slides[currentSlideIndex];
  if (currentSlide && currentSlide.notes) {
    notesEl.textContent = currentSlide.notes;
  } else {
    notesEl.textContent = 'Tidak ada catatan khusus untuk slide ini.';
  }
}

// Slide Navigation
function nextSlide() {
  if (currentSlideIndex < slides.length - 1) {
    currentSlideIndex++;
    renderSlide(currentSlideIndex);
    Utils.playSound('slide');
    if (socket) {
      socket.emit('slide:change', { slideIndex: currentSlideIndex, direction: 'next' });
    }
  }
}

function prevSlide() {
  if (currentSlideIndex > 0) {
    currentSlideIndex--;
    renderSlide(currentSlideIndex);
    Utils.playSound('slide');
    if (socket) {
      socket.emit('slide:change', { slideIndex: currentSlideIndex, direction: 'prev' });
    }
  }
}

function jumpToSlide(idx) {
  if (idx >= 0 && idx < slides.length) {
    currentSlideIndex = idx;
    renderSlide(currentSlideIndex);
    toggleModal('thumbnails-modal', false);
    Utils.playSound('slide');
    if (socket) {
      socket.emit('slide:change', { slideIndex: currentSlideIndex, direction: 'jump' });
    }
  }
}

// Drawing Canvas & Laser Overlay Setup
function initCanvas() {
  canvas = document.getElementById('drawing-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();

  window.addEventListener('resize', resizeCanvas);

  // Mouse / Touch drawing events
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDrawing);

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      startDrawing({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && isDrawing) {
      e.preventDefault();
      const touch = e.touches[0];
      draw({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }, { passive: false });

  window.addEventListener('touchend', stopDrawing);

  // Laser Pointer Mouse Tracker on Stage Wrapper
  const stage = document.getElementById('stage-wrapper');
  stage.addEventListener('mousemove', handleLaserMove);
  stage.addEventListener('mouseleave', () => {
    if (isLaserActive) {
      document.getElementById('laser-dot').style.display = 'none';
      if (socket) socket.emit('pointer:move', { x: 0, y: 0, visible: false });
    }
  });
}

function resizeCanvas() {
  const viewport = document.getElementById('slide-viewport');
  if (!viewport || !canvas) return;
  const rect = viewport.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

// Laser Pointer Logic
function toggleLaserPointer() {
  isLaserActive = !isLaserActive;
  const btn = document.getElementById('btn-laser-pointer');
  const dot = document.getElementById('laser-dot');

  if (isLaserActive) {
    btn.classList.add('active');
    // If drawing was active, turn it off
    if (isDrawingActive) toggleDrawPen();
    Utils.showToast('Laser pointer aktif. Gerakkan mouse Anda di atas slide.', '🔴');
  } else {
    btn.classList.remove('active');
    dot.style.display = 'none';
    if (socket) socket.emit('pointer:move', { x: 0, y: 0, visible: false });
  }
}

let lastLaserTime = 0;
function handleLaserMove(e) {
  if (!isLaserActive) return;
  const viewport = document.getElementById('slide-viewport');
  const rect = viewport.getBoundingClientRect();

  // Calculate coordinates relative to 16:9 slide viewport in percentage (0 to 1)
  const relX = (e.clientX - rect.left) / rect.width;
  const relY = (e.clientY - rect.top) / rect.height;

  const dot = document.getElementById('laser-dot');
  if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) {
    dot.style.display = 'block';
    dot.style.left = `${relX * 100}%`;
    dot.style.top = `${relY * 100}%`;

    // Throttle emitting pointer coordinates (60fps limit)
    const now = performance.now();
    if (now - lastLaserTime > 16) {
      lastLaserTime = now;
      if (socket) {
        socket.emit('pointer:move', { x: relX, y: relY, visible: true });
      }
    }
  } else {
    dot.style.display = 'none';
  }
}

// Drawing Logic
function toggleDrawPen() {
  isDrawingActive = !isDrawingActive;
  const btn = document.getElementById('btn-draw-pen');
  const colorsGroup = document.getElementById('pen-colors-group');
  const viewport = document.getElementById('slide-viewport');

  if (isDrawingActive) {
    btn.classList.add('active');
    colorsGroup.style.display = 'flex';
    viewport.classList.add('drawing-mode-active');
    // Deactivate laser if active
    if (isLaserActive) toggleLaserPointer();
    Utils.showToast('Mode gambar aktif. Coret langsung di slide.', '✏️');
  } else {
    btn.classList.remove('active');
    colorsGroup.style.display = 'none';
    viewport.classList.remove('drawing-mode-active');
  }
}

function startDrawing(e) {
  if (!isDrawingActive) return;
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  lastDrawX = e.clientX - rect.left;
  lastDrawY = e.clientY - rect.top;
}

function draw(e) {
  if (!isDrawing || !isDrawingActive) return;
  const rect = canvas.getBoundingClientRect();
  const currX = e.clientX - rect.left;
  const currY = e.clientY - rect.top;

  ctx.strokeStyle = drawColor;
  ctx.lineWidth = drawWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(lastDrawX, lastDrawY);
  ctx.lineTo(currX, currY);
  ctx.stroke();

  // Emit stroke data normalized (percentage)
  if (socket) {
    socket.emit('draw:stroke', {
      x0: lastDrawX / canvas.width,
      y0: lastDrawY / canvas.height,
      x1: currX / canvas.width,
      y1: currY / canvas.height,
      color: drawColor,
      width: drawWidth / canvas.width
    });
  }

  lastDrawX = currX;
  lastDrawY = currY;
}

function stopDrawing() {
  isDrawing = false;
}

function clearCanvas() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (socket) socket.emit('draw:clear');
}

// Floating Emoji Reactions from Audiences
function spawnReaction(emoji) {
  const container = document.getElementById('reactions-container');
  if (!container) return;

  const reaction = document.createElement('div');
  reaction.className = 'floating-reaction';
  reaction.textContent = emoji;
  reaction.style.left = `${15 + Math.random() * 70}%`;

  container.appendChild(reaction);
  setTimeout(() => reaction.remove(), 2500);
}

// PDF Upload Handler
async function handlePdfUpload(file) {
  if (!file || file.type !== 'application/pdf') {
    Utils.showToast('Harap pilih file PDF yang valid!', '⚠️');
    return;
  }

  Utils.showToast('Membaca dan memproses halaman PDF...', '⏳', 8000);
  try {
    const fileReader = new FileReader();
    fileReader.onload = async function() {
      const typedArray = new Uint8Array(this.result);
      const pdf = await pdfjsLib.getDocument(typedArray).promise;
      
      const convertedSlides = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = viewport.width;
        pageCanvas.height = viewport.height;
        const pageCtx = pageCanvas.getContext('2d');

        await page.render({ canvasContext: pageCtx, viewport: viewport }).promise;
        const imgData = pageCanvas.toDataURL('image/jpeg', 0.85);

        convertedSlides.push({
          id: i,
          type: 'pdf',
          imageUrl: imgData,
          notes: `Halaman ${i} dari PDF: ${file.name}`
        });
      }

      slides = convertedSlides;
      presentationMode = 'pdf';
      currentSlideIndex = 0;

      // Broadcast new slides to all audiences
      if (socket) {
        socket.emit('slides:update', {
          mode: 'pdf',
          slides: convertedSlides,
          totalSlides: convertedSlides.length,
          title: file.name.replace(/\.[^/.]+$/, "")
        });
      }

      renderSlide(0);
      Utils.showToast(`Berhasil memuat ${convertedSlides.length} slide dari PDF!`, '🎉');
    };
    fileReader.readAsArrayBuffer(file);
  } catch (err) {
    console.error('Error loading PDF:', err);
    Utils.showToast('Gagal memproses file PDF: ' + err.message, '❌');
  }
}

// Live WebRTC Screen Share (Host -> Audiences across internet)
async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always', frameRate: 30 },
      audio: false
    });

    const videoEl = document.getElementById('screen-share-video');
    videoEl.srcObject = screenStream;
    videoEl.style.display = 'block';
    document.getElementById('slide-surface').style.display = 'none';

    // Initialize PeerJS for P2P streaming over STUN
    peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peer.on('open', (peerId) => {
      console.log('PeerJS ready with ID:', peerId);
      socket.emit('webrtc:screen-start', { peerId });
      Utils.showToast('Berbagi layar aktif! Layar Anda disiarkan ke audiens.', '🖥️');
    });

    peer.on('call', (call) => {
      // Answer incoming audience call by sending our screen stream
      call.answer(screenStream);
    });

    // Handle stream stop by browser native bar
    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

    presentationMode = 'screenshare';
  } catch (err) {
    console.error('Failed to get screen media:', err);
    Utils.showToast('Gagal memulai screen share atau dibatalkan.', '⚠️');
    document.getElementById('source-selector').value = 'deck';
  }
}

function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  if (peer) {
    peer.destroy();
    peer = null;
  }

  document.getElementById('screen-share-video').style.display = 'none';
  document.getElementById('slide-surface').style.display = 'flex';
  presentationMode = 'deck';
  document.getElementById('source-selector').value = 'deck';

  if (socket) socket.emit('webrtc:screen-stop');
  Utils.showToast('Berbagi layar dihentikan.', 'ℹ️');
}

// Q&A Drawer Logic
function toggleQADrawer(open) {
  const drawer = document.getElementById('qa-drawer');
  if (open === undefined) {
    drawer.classList.toggle('open');
  } else {
    drawer.classList.toggle('open', open);
  }
}

let qaItems = [];
function addQAItemToDrawer(question) {
  qaItems.push(question);
  const emptyState = document.getElementById('qa-empty-state');
  if (emptyState) emptyState.style.display = 'none';

  const list = document.getElementById('qa-list');
  const card = document.createElement('div');
  card.className = 'qa-card';
  card.id = `qa-item-${question.id}`;
  card.innerHTML = `
    <div class="qa-author">${question.author}</div>
    <div class="qa-text">${question.text}</div>
    <div class="qa-actions">
      <span class="badge badge-primary" id="qa-votes-${question.id}">▲ ${question.upvotes || 0}</span>
      <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.78rem;" onclick="markQAAnswered('${question.id}')">
        Tandai Terjawab ✓
      </button>
    </div>
  `;
  list.appendChild(card);
}

function markQAAnswered(id) {
  const card = document.getElementById(`qa-item-${id}`);
  if (card) {
    card.classList.add('answered');
    const btn = card.querySelector('button');
    if (btn) btn.outerHTML = '<span class="badge badge-green">Terjawab ✓</span>';
    if (socket) socket.emit('qa:answer', { questionId: id });
  }
}

function updateQABadge() {
  const badge = document.getElementById('qa-count-badge');
  if (badge) badge.textContent = qaItems.length;
}

// Live Polling Logic
function startNewPoll() {
  const question = document.getElementById('poll-question-input').value.trim();
  const optionInputs = document.querySelectorAll('.poll-opt-input');
  const options = [];
  optionInputs.forEach(input => {
    if (input.value.trim()) options.push(input.value.trim());
  });

  if (!question || options.length < 2) {
    Utils.showToast('Harap masukkan pertanyaan dan minimal 2 pilihan jawaban!', '⚠️');
    return;
  }

  socket.emit('poll:create', { question, options }, (res) => {
    if (res && res.success) {
      document.getElementById('poll-create-section').style.display = 'none';
      document.getElementById('poll-active-section').style.display = 'block';
      document.getElementById('poll-active-badge').style.display = 'inline-block';
      document.getElementById('active-poll-question').textContent = question;
      renderLivePollResults(res.poll);
      Utils.showToast('Polling berhasil diluncurkan ke layar penonton!', '🚀');
    }
  });
}

function renderLivePollResults(poll) {
  const container = document.getElementById('poll-results-bars');
  const totalVotesEl = document.getElementById('poll-total-votes');
  if (!container || !poll) return;

  totalVotesEl.textContent = `${poll.totalVotes} Suara Masuk`;
  container.innerHTML = '';

  poll.options.forEach(opt => {
    const percentage = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
    const row = document.createElement('div');
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px;">
        <span style="font-weight: 600;">${opt.text}</span>
        <span style="font-family: var(--font-code); color: var(--accent-cyan);">${opt.votes} (${percentage}%)</span>
      </div>
      <div style="height: 10px; background: rgba(255, 255, 255, 0.1); border-radius: var(--radius-full); overflow: hidden;">
        <div style="height: 100%; width: ${percentage}%; background: linear-gradient(90deg, #6366f1, #06b6d4); transition: width 0.3s ease;"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

function closeCurrentPoll() {
  if (socket) socket.emit('poll:close');
  document.getElementById('poll-active-badge').style.display = 'none';
  Utils.showToast('Polling telah ditutup.', 'ℹ️');
}

function resetPollForm() {
  document.getElementById('poll-create-section').style.display = 'block';
  document.getElementById('poll-active-section').style.display = 'none';
  document.getElementById('poll-active-badge').style.display = 'none';
}

// Timer Controls
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (isTimerRunning) {
      timerSeconds++;
      document.getElementById('timer-display').textContent = Utils.formatTimer(timerSeconds);
    }
  }, 1000);
}

// Thumbnails Gallery Modal
function openThumbnailsModal() {
  const grid = document.getElementById('thumbnails-grid');
  grid.innerHTML = '';

  slides.forEach((s, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'glass-panel';
    thumb.style.padding = '12px';
    thumb.style.cursor = 'pointer';
    thumb.style.border = (idx === currentSlideIndex) ? '2px solid var(--primary)' : '1px solid var(--border-subtle)';
    thumb.innerHTML = `
      <div style="font-size: 0.75rem; font-weight: 700; color: var(--primary); margin-bottom: 4px;">Slide ${idx + 1}</div>
      <div style="font-size: 0.88rem; font-weight: 600; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${s.title || (s.type === 'pdf' ? `Halaman PDF ${idx + 1}` : 'Slide')}
      </div>
    `;
    thumb.onclick = () => jumpToSlide(idx);
    grid.appendChild(thumb);
  });

  toggleModal('thumbnails-modal', true);
}

// Modal helper
function toggleModal(id, show) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (show === undefined) {
    modal.classList.toggle('active');
  } else if (show) {
    modal.classList.add('active');
  } else {
    modal.classList.remove('active');
  }
}

// Event Listeners Binding
function initEventListeners() {
  // Slide Nav Buttons
  document.getElementById('btn-prev-slide').onclick = prevSlide;
  document.getElementById('btn-next-slide').onclick = nextSlide;

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    // If typing in input or textarea, ignore
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
      e.preventDefault();
      nextSlide();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      prevSlide();
    } else if (e.key.toLowerCase() === 'l') {
      toggleLaserPointer();
    } else if (e.key.toLowerCase() === 'd') {
      toggleDrawPen();
    }
  });

  // Tools buttons
  document.getElementById('btn-laser-pointer').onclick = toggleLaserPointer;
  document.getElementById('btn-draw-pen').onclick = toggleDrawPen;
  document.getElementById('btn-draw-clear').onclick = clearCanvas;

  // Pen color picker dots
  document.querySelectorAll('.pen-color-dot').forEach(btn => {
    btn.onclick = () => {
      drawColor = btn.getAttribute('data-color');
      document.querySelectorAll('.pen-color-dot').forEach(b => b.style.border = '1px solid var(--border-subtle)');
      btn.style.border = '2px solid white';
    };
  });

  // Source Selector
  const sourceSel = document.getElementById('source-selector');
  sourceSel.onchange = (e) => {
    const val = e.target.value;
    if (val === 'pdf') {
      document.getElementById('pdf-file-input').click();
    } else if (val === 'screenshare') {
      startScreenShare();
    } else {
      if (presentationMode === 'screenshare') stopScreenShare();
      presentationMode = 'deck';
      renderSlide(0);
    }
  };

  document.getElementById('pdf-file-input').onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handlePdfUpload(e.target.files[0]);
    }
  };

  // Toggle Explore for Audience
  const btnExplore = document.getElementById('btn-toggle-explore');
  btnExplore.onclick = () => {
    allowAudienceExplore = !allowAudienceExplore;
    document.getElementById('explore-icon').textContent = allowAudienceExplore ? '🔓' : '🔒';
    document.getElementById('explore-label').textContent = allowAudienceExplore ? 'Navigasi Bebas (Aktif)' : 'Kunci Audiens (Terkunci)';
    btnExplore.classList.toggle('active', allowAudienceExplore);
    if (socket) socket.emit('host:toggle-explore', { allowAudienceExplore });
    Utils.showToast(allowAudienceExplore ? 'Audiens sekarang dapat menjelajahi slide sendiri!' : 'Layar audiens dikunci ke slide presenter.', 'ℹ️');
  };

  // Modals buttons
  document.getElementById('btn-show-qr').onclick = () => toggleModal('qr-modal', true);
  document.getElementById('btn-show-notes').onclick = () => toggleModal('notes-modal', true);
  document.getElementById('btn-show-thumbnails').onclick = openThumbnailsModal;
  document.getElementById('btn-open-poll').onclick = () => toggleModal('poll-modal', true);
  document.getElementById('btn-start-poll').onclick = startNewPoll;
  document.getElementById('btn-close-poll').onclick = closeCurrentPoll;
  document.getElementById('btn-toggle-qa').onclick = () => toggleQADrawer();

  // Copy code & link
  document.getElementById('btn-copy-code').onclick = () => {
    const joinUrl = `${window.location.origin}/join?code=${roomCode}`;
    Utils.copyToClipboard(joinUrl, `Kode ${roomCode} & link /join tersalin!`);
  };

  document.getElementById('btn-copy-join-link').onclick = () => {
    const joinUrl = `${window.location.origin}/join?code=${roomCode}`;
    Utils.copyToClipboard(joinUrl, `Link bergabung tersalin: ${joinUrl}`);
  };

  // Timer Buttons
  document.getElementById('btn-timer-toggle').onclick = () => {
    isTimerRunning = !isTimerRunning;
    Utils.showToast(isTimerRunning ? 'Timer dilanjutkan.' : 'Timer dijeda.', '⏱️');
  };
  document.getElementById('btn-timer-reset').onclick = () => {
    timerSeconds = 0;
    document.getElementById('timer-display').textContent = '00:00';
  };

  // Fullscreen button
  document.getElementById('btn-fullscreen').onclick = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => alert(err.message));
    } else {
      document.exitFullscreen();
    }
  };

  // Leave Room
  document.getElementById('btn-leave-room').onclick = () => {
    if (confirm('Apakah Anda yakin ingin mengakhiri presentasi ini? Ruangan akan ditutup.')) {
      window.location.href = 'index.html';
    }
  };
}

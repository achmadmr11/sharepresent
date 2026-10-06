// Audience Viewer Engine for SharePresent
let socket = null;
let roomCode = null;
let userName = 'Penonton';

// State
let roomData = null;
let slides = [];
let hostSlideIndex = 0;
let currentSlideIndex = 0;
let presentationMode = 'deck';
let isFollowingHost = true;
let allowExplore = false;
let activePoll = null;
let userHasVoted = false;

// Drawing canvas & elements
let canvas, ctx;
let peer = null;

document.addEventListener('DOMContentLoaded', () => {
  initParams();
  initCanvas();
  initSocket();
  initReactions();
  initFullscreen();
});

// Parse Code and Name from Query Params
function initParams() {
  const params = Utils.getUrlParams();
  roomCode = params.get('code');
  const nameParam = params.get('name');
  if (nameParam && nameParam.trim()) {
    userName = nameParam.trim();
  }

  if (!roomCode) {
    alert('Kode presentasi tidak ditemukan. Silakan masukkan kode terlebih dahulu.');
    window.location.href = 'index.html';
  }
}

// Initialize Socket.io Connection
function initSocket() {
  socket = io();

  // Join Room
  socket.emit('room:join', { code: roomCode, name: userName }, (res) => {
    if (!res || !res.success) {
      alert(res ? res.message : 'Gagal bergabung ke presentasi.');
      window.location.href = 'index.html';
      return;
    }

    roomData = res.room;
    slides = roomData.slides || [];
    hostSlideIndex = roomData.currentSlide || 0;
    currentSlideIndex = hostSlideIndex;
    presentationMode = roomData.mode || 'deck';
    allowExplore = roomData.allowAudienceExplore || false;

    // Update Header & UI
    document.getElementById('audience-header-title').textContent = roomData.title || 'Presentasi Live';
    document.title = `${roomData.title} - SharePresent`;
    updateExploreControls();

    // Render Initial Slide
    renderSlide(currentSlideIndex);

    // Initial Q&A and Poll State
    if (roomData.qa) {
      roomData.qa.forEach(q => addQAItem(q));
    }
    if (roomData.activePoll && roomData.activePoll.active) {
      handlePollStarted(roomData.activePoll);
    }

    Utils.showToast(`Berhasil terhubung ke ruang ${roomCode}!`, '✅');
  });

  // 1. Slide Changed by Host
  socket.on('slide:changed', (data) => {
    hostSlideIndex = data.slideIndex;
    if (isFollowingHost) {
      currentSlideIndex = hostSlideIndex;
      renderSlide(currentSlideIndex);
      Utils.playSound('slide');
    } else {
      // Show "Ikuti Presenter" button when falling behind
      document.getElementById('btn-recenter-host').style.display = 'inline-flex';
    }
  });

  // 2. Slides Updated by Host (e.g. PDF Upload or new presentation)
  socket.on('slides:updated', (data) => {
    slides = data.slides || [];
    presentationMode = data.mode || 'deck';
    hostSlideIndex = 0;
    currentSlideIndex = 0;
    isFollowingHost = true;
    document.getElementById('audience-header-title').textContent = data.title;
    renderSlide(0);
    Utils.showToast('Presenter memperbarui materi presentasi!', '📑');
  });

  // 3. Laser Pointer Moved by Host
  socket.on('pointer:moved', (data) => {
    const dot = document.getElementById('aud-laser-dot');
    if (data.visible && isFollowingHost) {
      dot.style.display = 'block';
      dot.style.left = `${data.x * 100}%`;
      dot.style.top = `${data.y * 100}%`;
    } else {
      dot.style.display = 'none';
    }
  });

  // 4. Live Drawing Stroked by Host
  socket.on('draw:stroked', (stroke) => {
    if (!isFollowingHost || !canvas || !ctx) return;
    drawRemoteStroke(stroke);
  });

  socket.on('draw:cleared', () => {
    clearCanvas();
  });

  // 5. Host Toggled Audience Free Exploration
  socket.on('host:explore-toggled', (data) => {
    allowExplore = data.allowAudienceExplore;
    updateExploreControls();
    if (!allowExplore) {
      // Re-lock to host
      recenterToHost();
      Utils.showToast('Layar dikunci kembali mengikuti presenter.', '🔒');
    } else {
      Utils.showToast('Presenter mengizinkan Anda menjelajahi slide!', '🔓');
    }
  });

  // 6. WebRTC Live Screen Sharing
  socket.on('webrtc:screen-started', (data) => {
    handleRemoteScreenShare(data.peerId);
  });

  socket.on('webrtc:screen-stopped', () => {
    stopRemoteScreenShare();
  });

  // 7. Floating Emoji Reaction Received
  socket.on('reaction:received', (data) => {
    spawnReaction(data.emoji);
  });

  // 8. Q&A Events
  socket.on('qa:new', (question) => {
    addQAItem(question);
  });

  socket.on('qa:upvoted', (data) => {
    const upvoteBadge = document.getElementById(`aud-qa-vote-${data.questionId}`);
    if (upvoteBadge) upvoteBadge.textContent = `▲ ${data.upvotes}`;
  });

  // 9. Live Polling Events
  socket.on('poll:started', (poll) => {
    handlePollStarted(poll);
  });

  socket.on('poll:updated', (poll) => {
    handlePollUpdated(poll);
  });

  socket.on('poll:closed', () => {
    document.getElementById('audience-poll-banner').style.display = 'none';
    Utils.showToast('Polling telah selesai.', 'ℹ️');
  });

  // 10. Host Disconnected
  socket.on('host:disconnected', (data) => {
    alert(data.message || 'Presenter telah mengakhiri presentasi.');
    window.location.href = 'index.html';
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    const badge = document.getElementById('connection-status-badge');
    if (badge) {
      badge.textContent = 'Menghubungkan ulang...';
      badge.className = 'badge badge-primary';
    }
  });

  socket.on('connect', () => {
    const badge = document.getElementById('connection-status-badge');
    if (badge) {
      badge.textContent = 'Live Sync';
      badge.className = 'badge badge-green badge-pulse';
    }
  });
}

// Render Slide
function renderSlide(index) {
  if (!slides || slides.length === 0) return;
  if (index < 0) index = 0;
  if (index >= slides.length) index = slides.length - 1;

  currentSlideIndex = index;
  document.getElementById('aud-current-slide').textContent = currentSlideIndex + 1;
  document.getElementById('aud-total-slide').textContent = slides.length;

  const surface = document.getElementById('aud-slide-surface');
  const slide = slides[currentSlideIndex];

  // If slide is a PDF or Image slide
  if (presentationMode === 'pdf' || (slide && slide.type === 'pdf') || (slide && slide.imageUrl)) {
    surface.innerHTML = `<img src="${slide.imageUrl}" class="pdf-slide-canvas" alt="Slide ${index + 1}">`;
    clearCanvas();
    return;
  }

  // Render Keynote deck template
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
}

// Drawing Canvas Setup
function initCanvas() {
  canvas = document.getElementById('aud-drawing-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const viewport = document.getElementById('aud-slide-viewport');
  if (!viewport || !canvas) return;
  const rect = viewport.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function drawRemoteStroke(stroke) {
  if (!canvas || !ctx) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width * canvas.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(stroke.x0 * canvas.width, stroke.y0 * canvas.height);
  ctx.lineTo(stroke.x1 * canvas.width, stroke.y1 * canvas.height);
  ctx.stroke();
}

function clearCanvas() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// WebRTC Screen Share Receiver via PeerJS & STUN
function handleRemoteScreenShare(hostPeerId) {
  if (!hostPeerId) return;
  Utils.showToast('Menerima siaran langsung layar presenter...', '🖥️');

  try {
    peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peer.on('open', () => {
      // Connect to host's screen share stream
      const call = peer.call(hostPeerId, createDummyStream());
      call.on('stream', (remoteStream) => {
        const videoEl = document.getElementById('aud-screenshare-video');
        videoEl.srcObject = remoteStream;
        videoEl.style.display = 'block';
        document.getElementById('aud-slide-surface').style.display = 'none';
      });
    });
  } catch (e) {
    console.error('PeerJS error:', e);
  }
}

function stopRemoteScreenShare() {
  const videoEl = document.getElementById('aud-screenshare-video');
  videoEl.style.display = 'none';
  if (videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
  }
  if (peer) {
    peer.destroy();
    peer = null;
  }
  document.getElementById('aud-slide-surface').style.display = 'flex';
  renderSlide(currentSlideIndex);
}

// Dummy canvas audio/video stream to satisfy WebRTC call
function createDummyStream() {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  return c.captureStream(1);
}

// Floating Reaction Emojis
function initReactions() {
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.onclick = () => {
      const emoji = btn.getAttribute('data-emoji');
      if (socket) {
        socket.emit('reaction:send', { emoji });
      }
      spawnReaction(emoji);
      Utils.playSound('pop');
    };
  });
}

function spawnReaction(emoji) {
  const container = document.getElementById('aud-reactions-container');
  if (!container) return;

  const reaction = document.createElement('div');
  reaction.className = 'floating-reaction';
  reaction.textContent = emoji;
  reaction.style.left = `${15 + Math.random() * 70}%`;

  container.appendChild(reaction);
  setTimeout(() => reaction.remove(), 2500);
}

// Exploration Controls & Recenter
function updateExploreControls() {
  const controls = document.getElementById('aud-explore-controls');
  const recenterBtn = document.getElementById('btn-recenter-host');

  if (allowExplore) {
    controls.style.display = 'flex';
  } else {
    controls.style.display = 'none';
    recenterBtn.style.display = 'none';
  }
}

function recenterToHost() {
  isFollowingHost = true;
  currentSlideIndex = hostSlideIndex;
  renderSlide(currentSlideIndex);
  document.getElementById('btn-recenter-host').style.display = 'none';
  Utils.showToast('Kembali tersinkronisasi ke slide presenter.', '🎯');
}

document.getElementById('btn-recenter-host').onclick = recenterToHost;

document.getElementById('btn-aud-prev').onclick = () => {
  if (currentSlideIndex > 0) {
    isFollowingHost = false;
    currentSlideIndex--;
    renderSlide(currentSlideIndex);
    document.getElementById('btn-recenter-host').style.display = 'inline-flex';
  }
};

document.getElementById('btn-aud-next').onclick = () => {
  if (currentSlideIndex < slides.length - 1) {
    isFollowingHost = false;
    currentSlideIndex++;
    renderSlide(currentSlideIndex);
    document.getElementById('btn-recenter-host').style.display = 'inline-flex';
  }
};

// Q&A Logic
function openQAModal() {
  toggleModal('aud-qa-modal', true);
}

function handleAudienceAsk(e) {
  e.preventDefault();
  const input = document.getElementById('aud-question-input');
  const text = input.value.trim();
  if (!text) return;

  if (socket) {
    socket.emit('qa:ask', { text }, (res) => {
      if (res && res.success) {
        input.value = '';
        Utils.showToast('Pertanyaan berhasil dikirim ke presenter!', '✅');
      }
    });
  }
}

function addQAItem(question) {
  const emptyEl = document.getElementById('aud-qa-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  const list = document.getElementById('aud-questions-list');
  // Check if exists
  if (document.getElementById(`aud-qa-item-${question.id}`)) return;

  const card = document.createElement('div');
  card.className = 'qa-card';
  card.id = `aud-qa-item-${question.id}`;
  card.innerHTML = `
    <div class="qa-author">${question.author}</div>
    <div class="qa-text">${question.text}</div>
    <div class="qa-actions">
      <button class="upvote-btn" onclick="upvoteQuestion('${question.id}')">
        <span id="aud-qa-vote-${question.id}">▲ ${question.upvotes || 0}</span>
        <span>Upvote</span>
      </button>
      ${question.answered ? '<span class="badge badge-green">Terjawab ✓</span>' : ''}
    </div>
  `;
  list.prepend(card);
}

function upvoteQuestion(id) {
  if (socket) {
    socket.emit('qa:upvote', { questionId: id });
    Utils.playSound('pop');
  }
}

// Live Polling Logic
function handlePollStarted(poll) {
  activePoll = poll;
  userHasVoted = false;
  document.getElementById('audience-poll-banner').style.display = 'block';
  Utils.playSound('applause');
  openPollAnswerModal();
}

function handlePollUpdated(poll) {
  activePoll = poll;
  if (document.getElementById('aud-poll-modal').classList.contains('active')) {
    renderPollOptions();
  }
}

function openPollAnswerModal() {
  if (!activePoll) return;
  toggleModal('aud-poll-modal', true);
  document.getElementById('aud-poll-question-text').textContent = activePoll.question;
  renderPollOptions();
}

function renderPollOptions() {
  const box = document.getElementById('aud-poll-options-box');
  const countEl = document.getElementById('aud-poll-vote-count');
  if (!box || !activePoll) return;

  countEl.textContent = `${activePoll.totalVotes || 0} Suara`;
  box.innerHTML = '';

  activePoll.options.forEach(opt => {
    const percentage = activePoll.totalVotes > 0 ? Math.round((opt.votes / activePoll.totalVotes) * 100) : 0;

    if (!userHasVoted) {
      // Button to vote
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.style.width = '100%';
      btn.style.justifyContent = 'space-between';
      btn.style.padding = '14px 18px';
      btn.style.fontSize = '0.95rem';
      btn.innerHTML = `<span>${opt.text}</span><span>Pilih →</span>`;
      btn.onclick = () => submitVote(opt.id);
      box.appendChild(btn);
    } else {
      // Show results bar
      const bar = document.createElement('div');
      bar.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px;">
          <span style="font-weight: 600;">${opt.text}</span>
          <span style="font-family: var(--font-code); color: var(--accent-cyan);">${opt.votes} (${percentage}%)</span>
        </div>
        <div style="height: 10px; background: rgba(255, 255, 255, 0.1); border-radius: var(--radius-full); overflow: hidden;">
          <div style="height: 100%; width: ${percentage}%; background: linear-gradient(90deg, #6366f1, #06b6d4); transition: width 0.3s ease;"></div>
        </div>
      `;
      box.appendChild(bar);
    }
  });
}

function submitVote(optionId) {
  if (userHasVoted || !activePoll) return;
  socket.emit('poll:vote', { pollId: activePoll.id, optionId }, (res) => {
    if (res && res.success) {
      userHasVoted = true;
      Utils.playSound('pop');
      Utils.showToast('Suara Anda berhasil dicatat!', '🎉');
      renderPollOptions();
    } else {
      Utils.showToast(res ? res.message : 'Gagal mengirim suara', '⚠️');
    }
  });
}

// Fullscreen
function initFullscreen() {
  document.getElementById('btn-aud-fullscreen').onclick = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => alert(err.message));
    } else {
      document.exitFullscreen();
    }
  };
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

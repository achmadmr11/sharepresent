const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 25 * 1024 * 1024 // 25MB for slide data/images
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Route for dedicated Audience Join page
app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

app.get('/join/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// Store active presentation rooms
// roomCode -> { hostId, title, mode, currentSlide, totalSlides, slides: [], qa: [], polls: [], audiences: Map }
const rooms = new Map();

// Helper to generate 6-digit room code
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

// Default initial slides for quick demonstration
const defaultDemoSlides = [
  {
    id: 1,
    title: "Revolusi Presentasi Interaktif",
    subtitle: "Bagikan slide presentasi Anda ke penonton mana pun di dunia tanpa harus satu jaringan Wi-Fi.",
    badge: "🚀 Live Demo",
    type: "hero",
    bulletPoints: [
      "📡 Real-time sync via WebSockets & WebRTC",
      "📱 Penonton cukup scan QR atau ketik 6-digit kode",
      "✨ Laser pointer & live drawing interaktif",
      "💬 Live Q&A, Polling interaktif & reaksi emoji"
    ],
    notes: "Sambut audiens, perkenalkan topik bahwa presentasi ini terhubung secara real-time ke semua gawai mereka."
  },
  {
    id: 2,
    title: "Mengapa SharePresent Berbeda?",
    subtitle: "Solusi tanpa ribet kabel proyektor atau batasan jaringan lokal.",
    badge: "⚡ Fitur Unggulan",
    type: "cards",
    cards: [
      {
        icon: "🌐",
        title: "Bebas Jaringan",
        desc: "Audience menggunakan kuota seluler, Wi-Fi berbeda, atau di belahan dunia lain tetap bisa melihat layar Anda."
      },
      {
        icon: "🎯",
        title: "Laser Pointer & Coretan",
        desc: "Arahkan kursor Anda dan buat coretan langsung di slide, audiens melihatnya secara real-time."
      },
      {
        icon: "📊",
        title: "Live Q&A & Polling",
        desc: "Audiens dapat mengajukan pertanyaan, memberikan voting polling, dan memberi reaksi emoji animasi."
      },
      {
        icon: "🖥️",
        title: "Dukungan PDF & Screen Share",
        desc: "Bisa gunakan slide bawaan, upload file PDF PowerPoint, maupun langsung bagikan layar aplikasi Anda."
      }
    ],
    notes: "Jelaskan bagaimana audiens dapat berinteraksi langsung dari genggaman ponsel mereka."
  },
  {
    id: 3,
    title: "Bagaimana Cara Bergabung?",
    subtitle: "Hanya butuh 3 detik bagi audiens untuk terhubung.",
    badge: "📲 Panduan Cepat",
    type: "steps",
    steps: [
      {
        num: "01",
        title: "Buka Link Web",
        desc: "Buka halaman SharePresent di browser smartphone, tablet, atau laptop."
      },
      {
        num: "02",
        title: "Masukkan Kode / Scan QR",
        desc: "Ketik 6 digit kode unik di atas atau scan QR code yang tampil di layar presenter."
      },
      {
        num: "03",
        title: "Nikmati Presentasi",
        desc: "Layar audiens otomatis berpindah mengikuti presenter dan audiens bisa mengirim reaksi ❤️."
      }
    ],
    notes: "Tunjukkan kode ruangan di pojok atas atau klik tombol QR Code untuk mengajak peserta bergabung."
  },
  {
    id: 4,
    title: "Arsitektur Real-Time Cloud",
    subtitle: "Teknologi di balik sinkronisasi ultra-low latency.",
    badge: "🛠️ Arsitektur",
    type: "code",
    codeSnippet: `// Presenter and Audience synchronization pipeline
Presenter (Screen / Slide / Pointer)
       │
       ├───> WebSocket Signalling (Room Events) ───> Cloud Relay
       │                                                   │
       └───> WebRTC PeerStream (STUN / TURN) ──────────────┼───> Multi-Audience Sync
                                                           ▼
                                                [Viewer Screen 60 FPS]`,
    bulletPoints: [
      "Menggunakan STUN server Google untuk menembus NAT & Firewall lintas jaringan",
      "Fallback WebSocket ultra-cepat untuk perubahan slide & koordinat laser",
      "Mendukung ribuan audiens simultan dengan kompresi data minimal"
    ],
    notes: "Tekankan kehandalan koneksi bahkan saat jaringan seluler tidak stabil."
  },
  {
    id: 5,
    title: "Terima Kasih & Sesi Diskusi",
    subtitle: "Silakan gunakan fitur Q&A pada ponsel Anda untuk mengajukan pertanyaan.",
    badge: "🎉 Selesai",
    type: "hero",
    bulletPoints: [
      "Kirim pertanyaan melalui tab 'Tanya Jawab' di layar Anda",
      "Beri apresiasi dengan menekan tombol reaksi emoji",
      "Kunjungi repository kami untuk dokumentasi lengkap"
    ],
    notes: "Ajak audiens mencoba tab Q&A dan memencet tombol reaksi emoji."
  }
];

// API: Check room status
app.get('/api/room/:code', (req, res) => {
  const code = req.params.code;
  if (rooms.has(code)) {
    const room = rooms.get(code);
    return res.json({
      exists: true,
      title: room.title,
      mode: room.mode,
      currentSlide: room.currentSlide,
      totalSlides: room.totalSlides,
      audienceCount: room.audiences.size
    });
  }
  return res.status(404).json({ exists: false, message: 'Ruangan tidak ditemukan' });
});

// Socket.io handlers
io.on('connection', (socket) => {
  let userRoom = null;
  let isHost = false;
  let userName = 'Anonim';

  // 1. Host creates a presentation room
  socket.on('room:create', ({ title, customSlides }, callback) => {
    const code = generateRoomCode();
    const slides = (customSlides && customSlides.length > 0) ? customSlides : defaultDemoSlides;
    
    const roomData = {
      code,
      hostId: socket.id,
      title: title || 'Presentasi Tanpa Judul',
      mode: 'deck', // 'deck' | 'pdf' | 'images' | 'screenshare'
      currentSlide: 0,
      totalSlides: slides.length,
      slides,
      qa: [],
      polls: [],
      activePoll: null,
      audiences: new Map(),
      allowAudienceExplore: false
    };

    rooms.set(code, roomData);
    userRoom = code;
    isHost = true;
    socket.join(code);

    if (callback) {
      callback({
        success: true,
        code,
        room: {
          code,
          title: roomData.title,
          mode: roomData.mode,
          currentSlide: roomData.currentSlide,
          totalSlides: roomData.totalSlides,
          slides: roomData.slides,
          allowAudienceExplore: roomData.allowAudienceExplore
        }
      });
    }
  });

  // 2. Audience joins a presentation room
  socket.on('room:join', ({ code, name }, callback) => {
    if (!rooms.has(code)) {
      if (callback) callback({ success: false, message: 'Kode presentasi tidak valid atau telah berakhir.' });
      return;
    }

    const room = rooms.get(code);
    userRoom = code;
    isHost = false;
    userName = name && name.trim() ? name.trim() : `Penonton ${room.audiences.size + 1}`;
    
    room.audiences.set(socket.id, {
      id: socket.id,
      name: userName,
      joinedAt: Date.now()
    });

    socket.join(code);

    // Notify room host of new audience
    io.to(room.hostId).emit('audience:joined', {
      id: socket.id,
      name: userName,
      count: room.audiences.size
    });

    // Broadcast updated audience count to everyone in room
    io.to(code).emit('audience:count', { count: room.audiences.size });

    if (callback) {
      callback({
        success: true,
        room: {
          code: room.code,
          title: room.title,
          mode: room.mode,
          currentSlide: room.currentSlide,
          totalSlides: room.totalSlides,
          slides: room.slides,
          qa: room.qa,
          activePoll: room.activePoll,
          allowAudienceExplore: room.allowAudienceExplore
        }
      });
    }
  });

  // 3. Host updates slide (Next, Prev, Jump)
  socket.on('slide:change', ({ slideIndex, direction }) => {
    if (!userRoom || !isHost) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    room.currentSlide = slideIndex;
    socket.to(userRoom).emit('slide:changed', {
      slideIndex,
      direction: direction || 'next'
    });
  });

  // 4. Host changes presentation mode or uploads custom slides (PDF pages, images)
  socket.on('slides:update', ({ mode, slides, totalSlides, title }) => {
    if (!userRoom || !isHost) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    if (mode) room.mode = mode;
    if (slides) room.slides = slides;
    if (totalSlides !== undefined) room.totalSlides = totalSlides;
    if (title) room.title = title;
    room.currentSlide = 0;

    socket.to(userRoom).emit('slides:updated', {
      mode: room.mode,
      slides: room.slides,
      totalSlides: room.totalSlides,
      title: room.title,
      currentSlide: 0
    });
  });

  // 5. Host controls Audience Freedom (Can explore or locked to presenter)
  socket.on('host:toggle-explore', ({ allowAudienceExplore }) => {
    if (!userRoom || !isHost) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    room.allowAudienceExplore = allowAudienceExplore;
    socket.to(userRoom).emit('host:explore-toggled', { allowAudienceExplore });
  });

  // 6. Laser Pointer (real-time high frequency)
  socket.on('pointer:move', ({ x, y, visible }) => {
    if (!userRoom || !isHost) return;
    socket.to(userRoom).emit('pointer:moved', { x, y, visible });
  });

  // 7. Live Drawing Canvas (draw stroke & clear)
  socket.on('draw:stroke', (strokeData) => {
    if (!userRoom || !isHost) return;
    socket.to(userRoom).emit('draw:stroked', strokeData);
  });

  socket.on('draw:clear', () => {
    if (!userRoom || !isHost) return;
    socket.to(userRoom).emit('draw:cleared');
  });

  // 8. Audience Floating Emoji Reactions
  socket.on('reaction:send', ({ emoji }) => {
    if (!userRoom) return;
    io.to(userRoom).emit('reaction:received', {
      emoji,
      senderName: userName,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now()
    });
  });

  // 9. Audience Q&A
  socket.on('qa:ask', ({ text }, callback) => {
    if (!userRoom || !text) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    const question = {
      id: 'q_' + Math.random().toString(36).substring(2, 9),
      text: text.trim(),
      author: userName,
      authorId: socket.id,
      upvotes: 0,
      upvotedBy: [],
      answered: false,
      createdAt: Date.now()
    };

    room.qa.unshift(question);
    io.to(userRoom).emit('qa:new', question);
    if (callback) callback({ success: true, question });
  });

  socket.on('qa:upvote', ({ questionId }) => {
    if (!userRoom) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    const q = room.qa.find(item => item.id === questionId);
    if (q) {
      if (!q.upvotedBy.includes(socket.id)) {
        q.upvotedBy.push(socket.id);
        q.upvotes = q.upvotedBy.length;
        io.to(userRoom).emit('qa:upvoted', { questionId, upvotes: q.upvotes });
      }
    }
  });

  socket.on('qa:answer', ({ questionId }) => {
    if (!userRoom || !isHost) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    const q = room.qa.find(item => item.id === questionId);
    if (q) {
      q.answered = true;
      io.to(userRoom).emit('qa:answered', { questionId });
    }
  });

  // 10. Live Polling
  socket.on('poll:create', ({ question, options }, callback) => {
    if (!userRoom || !isHost) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    const poll = {
      id: 'poll_' + Math.random().toString(36).substring(2, 9),
      question,
      options: options.map((opt, idx) => ({ id: idx, text: opt, votes: 0 })),
      voters: new Set(),
      active: true,
      totalVotes: 0,
      createdAt: Date.now()
    };

    room.activePoll = poll;
    room.polls.push(poll);

    io.to(userRoom).emit('poll:started', {
      id: poll.id,
      question: poll.question,
      options: poll.options.map(o => ({ id: o.id, text: o.text, votes: o.votes })),
      totalVotes: 0
    });

    if (callback) callback({ success: true, poll });
  });

  socket.on('poll:vote', ({ pollId, optionId }, callback) => {
    if (!userRoom) return;
    const room = rooms.get(userRoom);
    if (!room || !room.activePoll || room.activePoll.id !== pollId || !room.activePoll.active) {
      if (callback) callback({ success: false, message: 'Polling tidak aktif' });
      return;
    }

    const poll = room.activePoll;
    if (poll.voters.has(socket.id)) {
      if (callback) callback({ success: false, message: 'Anda sudah memberikan suara' });
      return;
    }

    const opt = poll.options.find(o => o.id === optionId);
    if (opt) {
      poll.voters.add(socket.id);
      opt.votes += 1;
      poll.totalVotes += 1;

      io.to(userRoom).emit('poll:updated', {
        id: poll.id,
        options: poll.options.map(o => ({ id: o.id, text: o.text, votes: o.votes })),
        totalVotes: poll.totalVotes
      });

      if (callback) callback({ success: true });
    }
  });

  socket.on('poll:close', () => {
    if (!userRoom || !isHost) return;
    const room = rooms.get(userRoom);
    if (!room || !room.activePoll) return;

    room.activePoll.active = false;
    io.to(userRoom).emit('poll:closed', { id: room.activePoll.id });
  });

  // 11. WebRTC Screen Sharing Signaling (Host to Viewers across internet)
  socket.on('webrtc:screen-start', ({ peerId }) => {
    if (!userRoom || !isHost) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    room.mode = 'screenshare';
    room.screensharePeerId = peerId;

    socket.to(userRoom).emit('webrtc:screen-started', { peerId });
  });

  socket.on('webrtc:screen-stop', () => {
    if (!userRoom || !isHost) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    room.mode = 'deck';
    room.screensharePeerId = null;

    socket.to(userRoom).emit('webrtc:screen-stopped');
  });

  // 12. Chat Messages
  socket.on('chat:send', ({ text }) => {
    if (!userRoom || !text) return;
    io.to(userRoom).emit('chat:received', {
      sender: userName,
      isHost,
      text: text.trim(),
      timestamp: Date.now()
    });
  });

  // Disconnection cleanup
  socket.on('disconnect', () => {
    if (userRoom && rooms.has(userRoom)) {
      const room = rooms.get(userRoom);

      if (isHost) {
        // Host disconnected
        io.to(userRoom).emit('host:disconnected', {
          message: 'Presenter telah mengakhiri atau meninggalkan presentasi.'
        });
        rooms.delete(userRoom);
      } else {
        // Audience left
        if (room.audiences.has(socket.id)) {
          room.audiences.delete(socket.id);
          io.to(room.hostId).emit('audience:left', {
            id: socket.id,
            count: room.audiences.size
          });
          io.to(userRoom).emit('audience:count', { count: room.audiences.size });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 SharePresent Server is running on port ${PORT}`);
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  console.log(`🌐 Works across networks via Cloud WebSockets & WebRTC`);
  console.log(`=================================================`);
});

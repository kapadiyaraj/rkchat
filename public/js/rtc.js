// rtc.js — WebRTC module (audio + video calls)

class RTC {
  constructor(socket) {
    this.socket     = socket;
    this.pc         = null;
    this.localStream = null;
    this.peerPhone  = null;
    this.callType   = null;   // "audio" | "video"
    this.muted      = false;
    this.camOff     = false;

    this.iceConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
        {
          urls:       "turn:openrelay.metered.ca:80",
          username:   "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    };

    this._bindSocketEvents();
  }

  // ─────────────────────────────────────
  // SOCKET EVENTS
  // ─────────────────────────────────────
  _bindSocketEvents() {
    // Remote ICE candidate
    this.socket.on("ice-candidate", async ({ candidate }) => {
      if (this.pc && candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("ICE candidate error:", e);
        }
      }
    });

    // Caller: receives answer from callee
    this.socket.on("call-answered", async ({ answer }) => {
      if (!this.pc) return;
      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        this._setStatus("Connected");
      } catch (e) {
        console.error("setRemoteDescription error:", e);
      }
    });

    // Call ended by remote peer
    this.socket.on("call-ended", () => {
      this._setStatus("Call ended");
      setTimeout(() => this.hangup(true), 900);
    });

    // Call rejected by remote peer
    this.socket.on("call-rejected", () => {
      this._setStatus("Call declined");
      setTimeout(() => this.hangup(true), 1200);
    });

    // Server-side error
    this.socket.on("call-failed", (msg) => {
      alert("Call failed: " + msg);
      this.hangup(true);
    });
  }

  // ─────────────────────────────────────
  // BUILD PEER CONNECTION
  // ─────────────────────────────────────
  _buildPC(peerPhone) {
    const pc = new RTCPeerConnection(this.iceConfig);

    // Send ICE candidates to peer
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket.emit("ice-candidate", { toPhone: peerPhone, candidate });
      }
    };

    // Receive remote stream → attach to <video>
    pc.ontrack = ({ streams }) => {
      const rv = document.getElementById("remote-video");
      if (rv && streams[0]) rv.srcObject = streams[0];
    };

    // Monitor connection state
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === "connected" || s === "completed") this._setStatus("Connected");
      if (s === "failed")       this._setStatus("Connection failed — check network");
      if (s === "disconnected") this._setStatus("Reconnecting…");
    };

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
    }

    return pc;
  }

  // ─────────────────────────────────────
  // GET USER MEDIA
  // ─────────────────────────────────────
  async _getMedia(wantVideo) {
    // Try with requested video setting
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantVideo,
      });
    } catch {
      // Video failed → fallback to audio-only
      if (wantVideo) {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          console.warn("Camera unavailable — falling back to audio-only.");
        } catch {
          alert("Microphone access denied. Please allow mic access and try again.");
          return false;
        }
      } else {
        alert("Microphone access denied. Please allow mic access and try again.");
        return false;
      }
    }

    // Attach to local <video> preview
    const lv = document.getElementById("local-video");
    if (lv) lv.srcObject = this.localStream;

    return true;
  }

  // ─────────────────────────────────────
  // OUTGOING CALL (Caller side)
  // ─────────────────────────────────────
  async startCall(peerPhone, callType = "video") {
    this.peerPhone = peerPhone;
    this.callType  = callType;

    const ok = await this._getMedia(callType === "video");
    if (!ok) return;

    this.pc = this._buildPC(peerPhone);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.socket.emit("call-user", { toPhone: peerPhone, offer, callType });
    this._setStatus("Calling…");
    this._updateCallUI(callType);
  }

  // ─────────────────────────────────────
  // INCOMING CALL (Callee side)
  // ─────────────────────────────────────
  async acceptCall(fromPhone, offer, callType = "video") {
    this.peerPhone = fromPhone;
    this.callType  = callType;

    const ok = await this._getMedia(callType === "video");
    if (!ok) return;

    this.pc = this._buildPC(fromPhone);

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.socket.emit("call-answer", { toPhone: fromPhone, answer });
    this._setStatus("Connecting…");
    this._updateCallUI(callType);
  }

  // ─────────────────────────────────────
  // HANG UP
  // ─────────────────────────────────────
  hangup(silent = false) {
    // Notify peer
    if (!silent && this.peerPhone) {
      this.socket.emit("end-call", { toPhone: this.peerPhone });
    }

    // Close peer connection
    if (this.pc) { this.pc.close(); this.pc = null; }

    // Stop local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    // Clear video elements
    ["remote-video", "local-video"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.srcObject = null;
    });

    // Reset state
    this.peerPhone = null;
    this.callType  = null;
    this.muted     = false;
    this.camOff    = false;

    // Reset UI
    document.getElementById("call-overlay").classList.add("hidden");
    document.getElementById("btn-mute").classList.remove("active");
    document.getElementById("btn-cam").classList.remove("active");
    document.getElementById("btn-spk").classList.remove("active");
  }

  // ─────────────────────────────────────
  // CONTROLS
  // ─────────────────────────────────────
  toggleMute() {
    if (!this.localStream) return;
    this.muted = !this.muted;
    this.localStream.getAudioTracks().forEach(t => t.enabled = !this.muted);
    document.getElementById("btn-mute").classList.toggle("active", this.muted);
  }

  toggleCam() {
    if (!this.localStream) return;
    this.camOff = !this.camOff;
    this.localStream.getVideoTracks().forEach(t => t.enabled = !this.camOff);
    // btn-cam "active" = cam is OFF
    document.getElementById("btn-cam").classList.toggle("active", this.camOff);
    document.getElementById("local-video").classList.toggle("hidden", this.camOff);
  }

  // ─────────────────────────────────────
  // INTERNAL UI HELPERS
  // ─────────────────────────────────────
  _updateCallUI(callType) {
    const lv      = document.getElementById("local-video");
    const audioAv = document.getElementById("audio-avatar");
    const btnCam  = document.getElementById("btn-cam");
    const btnSpk  = document.getElementById("btn-spk");
    const rv      = document.getElementById("remote-video");

    document.getElementById("call-overlay").classList.remove("hidden");

    if (callType === "video") {
      // Video call: show video elements
      rv.classList.remove("hidden");
      lv.classList.remove("hidden");
      audioAv.classList.add("hidden");
      btnCam.classList.remove("hidden");
      btnCam.classList.remove("active");   // cam ON
      btnSpk.classList.add("active");      // speaker ON for video
      rv.volume = 1.0;
    } else {
      // Audio call: show avatar, hide video
      rv.classList.add("hidden");
      lv.classList.add("hidden");
      audioAv.classList.remove("hidden");
      btnCam.classList.add("hidden");      // hide cam button for audio calls
      btnSpk.classList.remove("active");   // earpiece mode by default
      rv.volume = 0.4;
    }
  }

  _setStatus(msg) {
    const el = document.getElementById("call-status-text");
    if (el) el.textContent = msg;
  }
}
// WebRTC module — supports both audio-only and video calls

class RTC {
  constructor(socket) {
    this.socket = socket;
    this.pc = null;
    this.localStream = null;
    this.peerPhone = null;
    this.callType = null; // "audio" | "video"
    this.muted = false;
    this.camOff = false;

    this.iceServers = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
        // Free TURN for NAT traversal across networks
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
      ],
    };

    this._bindSocketEvents();
  }

  _bindSocketEvents() {
    this.socket.on("ice-candidate", async ({ candidate }) => {
      if (this.pc && candidate) {
        try { await this.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      }
    });

    this.socket.on("call-answered", async ({ answer }) => {
      if (this.pc) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        this._setStatus("Connected");
      }
    });

    this.socket.on("call-ended", () => {
      this._setStatus("Call ended");
      setTimeout(() => this.hangup(true), 900);
    });

    this.socket.on("call-rejected", () => {
      this._setStatus("Call declined");
      setTimeout(() => this.hangup(true), 1200);
    });

    this.socket.on("call-failed", (msg) => {
      alert(msg);
      this.hangup(true);
    });
  }

  _buildPC(peerPhone) {
    const pc = new RTCPeerConnection(this.iceServers);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.socket.emit("ice-candidate", { toPhone: peerPhone, candidate });
    };
    pc.ontrack = ({ streams }) => {
      const rv = document.getElementById("remote-video");
      if (rv && streams[0]) rv.srcObject = streams[0];
    };
    pc.oniceconnectionstatechange = () => {
      if (["connected","completed"].includes(pc.iceConnectionState)) this._setStatus("Connected");
      if (pc.iceConnectionState === "failed") this._setStatus("Connection failed");
    };
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
    }
    return pc;
  }

  async _getMedia(video) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    } catch {
      // camera unavailable — fallback to audio
      try { this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
      catch { alert("Microphone access denied. Please allow and try again."); return false; }
    }
    const lv = document.getElementById("local-video");
    if (lv) lv.srcObject = this.localStream;
    return true;
  }

  // ── Caller ──
  async startCall(peerPhone, callType = "video") {
    this.peerPhone = peerPhone;
    this.callType = callType;
    const wantVideo = callType === "video";
    const ok = await this._getMedia(wantVideo);
    if (!ok) return;

    this.pc = this._buildPC(peerPhone);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.socket.emit("call-user", { toPhone: peerPhone, offer, callType });
    this._setStatus("Calling…");
    this._showOverlay(callType);
  }

  // ── Callee ──
  async acceptCall(fromPhone, offer, callType = "video") {
    this.peerPhone = fromPhone;
    this.callType = callType;
    const wantVideo = callType === "video";
    const ok = await this._getMedia(wantVideo);
    if (!ok) return;

    this.pc = this._buildPC(fromPhone);
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.socket.emit("call-answer", { toPhone: fromPhone, answer });
    this._setStatus("Connecting…");
    this._showOverlay(callType);
  }

  hangup(silent = false) {
    if (!silent && this.peerPhone) {
      this.socket.emit("end-call", { toPhone: this.peerPhone });
    }
    if (this.pc) { this.pc.close(); this.pc = null; }
    if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
    ["remote-video","local-video"].forEach(id => { const el = document.getElementById(id); if(el) el.srcObject = null; });
    this.peerPhone = null;
    this.callType = null;
    this.muted = false;
    this.camOff = false;
    document.getElementById("call-overlay").classList.add("hidden");
    document.getElementById("btn-mute").classList.remove("active");
    document.getElementById("btn-cam").classList.remove("active");
  }

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
    document.getElementById("btn-cam").classList.toggle("active", this.camOff);
  }

  _showOverlay(callType) {
    const overlay = document.getElementById("call-overlay");
    overlay.classList.remove("hidden");
    // Audio call: hide local video, show avatar
    const lv = document.getElementById("local-video");
    const audioAv = document.getElementById("audio-avatar");
    if (callType === "audio") {
      if (lv) lv.classList.add("hidden");
      if (audioAv) audioAv.classList.remove("hidden");
      document.getElementById("btn-cam").classList.add("hidden");
    } else {
      if (lv) lv.classList.remove("hidden");
      if (audioAv) audioAv.classList.add("hidden");
      document.getElementById("btn-cam").classList.remove("hidden");
    }
  }

  _setStatus(msg) {
    const el = document.getElementById("call-status-text");
    if (el) el.textContent = msg;
  }
}

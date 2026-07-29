// ======================================================
// FriendCall - WebRTC
// Audio + Video Calling
// ======================================================

class RTC {
  constructor(socket) {
    this.socket = socket;

    this.pc = null;
    this.localStream = null;

    this.peerPhone = null;
    this.callType = null;

    this.muted = false;
    this.camOff = false;

    this.iceConfig = {
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
        {
          urls: "stun:stun1.l.google.com:19302",
        },
        {
          urls: "stun:stun.cloudflare.com:3478",
        },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    };

    this.bindSocketEvents();
  }

  // ====================================================
  // SOCKET EVENTS
  // ====================================================

  bindSocketEvents() {
    this.socket.on(
      "ice-candidate",
      async ({ candidate }) => {
        if (!this.pc || !candidate) {
          return;
        }

        try {
          await this.pc.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } catch (err) {
          console.warn("ICE candidate error:", err);
        }
      }
    );

    this.socket.on(
      "call-answered",
      async ({ answer }) => {
        if (!this.pc) return;

        try {
          await this.pc.setRemoteDescription(
            new RTCSessionDescription(answer)
          );

          this.setStatus("Connected");
        } catch (err) {
          console.error("Remote description error:", err);
        }
      }
    );

    this.socket.on("call-ended", () => {
      this.setStatus("Call ended");

      setTimeout(() => {
        this.hangup(true);
      }, 700);
    });

    this.socket.on("call-rejected", () => {
      this.setStatus("Call declined");

      setTimeout(() => {
        this.hangup(true);
      }, 900);
    });

    this.socket.on("call-failed", (msg) => {
      alert("Call failed: " + msg);
      this.hangup(true);
    });
  }

  // ====================================================
  // PEER CONNECTION
  // ====================================================

  buildPC(peerPhone) {
    const pc = new RTCPeerConnection(this.iceConfig);

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;

      this.socket.emit("ice-candidate", {
        toPhone: peerPhone,
        candidate,
      });
    };

    pc.ontrack = ({ streams }) => {
      const remoteVideo =
        document.getElementById("remote-video");

      if (remoteVideo && streams[0]) {
        remoteVideo.srcObject = streams[0];

        remoteVideo
          .play()
          .catch(() => {});
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;

      if (state === "connected" || state === "completed") {
        this.setStatus("Connected");
      }

      if (state === "failed") {
        this.setStatus("Connection failed");
      }

      if (state === "disconnected") {
        this.setStatus("Reconnecting...");
      }
    };

    if (this.localStream) {
      this.localStream
        .getTracks()
        .forEach((track) => {
          pc.addTrack(track, this.localStream);
        });
    }

    return pc;
  }

  // ====================================================
  // CAMERA / MICROPHONE
  // ====================================================

  async getMedia(wantVideo) {
    try {
      this.localStream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: wantVideo,
        });
    } catch (err) {
      if (wantVideo) {
        try {
          this.localStream =
            await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });

          console.warn("Camera unavailable. Audio only.");
          this.callType = "audio";
        } catch {
          alert(
            "Microphone access denied. Please allow microphone permission."
          );
          return false;
        }
      } else {
        alert(
          "Microphone access denied. Please allow microphone permission."
        );
        return false;
      }
    }

    const localVideo =
      document.getElementById("local-video");

    if (localVideo) {
      localVideo.srcObject = this.localStream;
      localVideo.muted = true;

      localVideo
        .play()
        .catch(() => {});
    }

    return true;
  }

  // ====================================================
  // START OUTGOING CALL
  // ====================================================

  async startCall(peerPhone, callType = "video") {
    if (this.pc || this.localStream) {
      this.hangup(true);
    }

    this.peerPhone = peerPhone;
    this.callType = callType;

    const mediaReady = await this.getMedia(
      callType === "video"
    );

    if (!mediaReady) {
      this.peerPhone = null;
      return;
    }

    this.pc = this.buildPC(peerPhone);

    try {
      const offer = await this.pc.createOffer();

      await this.pc.setLocalDescription(offer);

      this.socket.emit("call-user", {
        toPhone: peerPhone,
        offer: this.pc.localDescription,
        callType: this.callType,
      });

      this.setStatus("Calling...");
      this.updateCallUI(this.callType);
    } catch (err) {
      console.error("Start call error:", err);
      this.hangup(true);
    }
  }

  // ====================================================
  // ACCEPT INCOMING CALL
  // ====================================================

  async acceptCall(fromPhone, offer, callType = "video") {
    if (this.pc || this.localStream) {
      this.hangup(true);
    }

    this.peerPhone = fromPhone;
    this.callType = callType;

    const mediaReady = await this.getMedia(
      callType === "video"
    );

    if (!mediaReady) {
      this.socket.emit("reject-call", {
        toPhone: fromPhone,
      });

      this.peerPhone = null;
      return;
    }

    this.pc = this.buildPC(fromPhone);

    try {
      await this.pc.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await this.pc.createAnswer();

      await this.pc.setLocalDescription(answer);

      this.socket.emit("call-answer", {
        toPhone: fromPhone,
        answer: this.pc.localDescription,
      });

      this.setStatus("Connecting...");
      this.updateCallUI(this.callType);
    } catch (err) {
      console.error("Accept call error:", err);
      this.hangup(true);
    }
  }

  // ====================================================
  // HANGUP
  // ====================================================

  hangup(silent = false) {
    if (!silent && this.peerPhone) {
      this.socket.emit("end-call", {
        toPhone: this.peerPhone,
      });
    }

    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;

      this.pc.close();
      this.pc = null;
    }

    if (this.localStream) {
      this.localStream
        .getTracks()
        .forEach((track) => track.stop());

      this.localStream = null;
    }

    ["remote-video", "local-video"].forEach((id) => {
      const element = document.getElementById(id);

      if (element) {
        element.srcObject = null;
      }
    });

    this.peerPhone = null;
    this.callType = null;

    this.muted = false;
    this.camOff = false;

    const overlay = document.getElementById("call-overlay");

    if (overlay) {
      overlay.classList.add("hidden");
    }

    const mute = document.getElementById("btn-mute");
    const cam = document.getElementById("btn-cam");
    const speaker = document.getElementById("btn-spk");

    mute?.classList.remove("active");
    cam?.classList.remove("active");
    speaker?.classList.remove("active");
  }

  // ====================================================
  // MUTE
  // ====================================================

  toggleMute() {
    if (!this.localStream) {
      return;
    }

    this.muted = !this.muted;

    this.localStream
      .getAudioTracks()
      .forEach((track) => {
        track.enabled = !this.muted;
      });

    document
      .getElementById("btn-mute")
      ?.classList.toggle("active", this.muted);
  }

  // ====================================================
  // CAMERA
  // ====================================================

  toggleCam() {
    if (!this.localStream) {
      return;
    }

    const tracks = this.localStream.getVideoTracks();

    if (!tracks.length) {
      return;
    }

    this.camOff = !this.camOff;

    tracks.forEach((track) => {
      track.enabled = !this.camOff;
    });

    document
      .getElementById("btn-cam")
      ?.classList.toggle("active", this.camOff);

    document
      .getElementById("local-video")
      ?.classList.toggle("hidden", this.camOff);
  }

  // ====================================================
  // CALL UI
  // ====================================================

  updateCallUI(callType) {
    const localVideo =
      document.getElementById("local-video");

    const remoteVideo =
      document.getElementById("remote-video");

    const audioAvatar =
      document.getElementById("audio-avatar");

    const btnCam =
      document.getElementById("btn-cam");

    const btnSpeaker =
      document.getElementById("btn-spk");

    const overlay =
      document.getElementById("call-overlay");

    overlay?.classList.remove("hidden");

    // Default Speaker UI → OFF (Standard audio output)
    btnSpeaker?.classList.remove("active");

    if (remoteVideo) {
      remoteVideo.volume = 0.4;
    }

    if (callType === "video") {
      remoteVideo?.classList.remove("hidden");
      localVideo?.classList.remove("hidden");
      audioAvatar?.classList.add("hidden");

      btnCam?.classList.remove("hidden");
      btnCam?.classList.remove("active");
    } else {
      remoteVideo?.classList.add("hidden");
      localVideo?.classList.add("hidden");
      audioAvatar?.classList.remove("hidden");

      btnCam?.classList.add("hidden");
    }
  }

  // ====================================================
  // STATUS
  // ====================================================

  setStatus(message) {
    const status =
      document.getElementById("call-status-text");

    if (status) {
      status.textContent = message;
    }
  }
}
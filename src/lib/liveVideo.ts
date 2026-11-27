import type { VideoAccess } from "./sellsourceStore";

// Live show video. With a LiveKit server set up, the host's camera goes out to every viewer over
// WebRTC (LiveKit handles the relaying, so a phone only sends one stream). Without one (demo mode)
// the host still sees their own camera, and viewers see the item photos instead.

export interface VideoSession {
  stop(): void;
  // Switches between the front and back camera on phones.
  flip?(): Promise<void>;
}

async function camera(facing: "user" | "environment"): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't use a camera. Try Chrome or Safari on your phone.");
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
}

// The host: shows their camera in `el`, and broadcasts it when `access` is given.
export async function startHost(el: HTMLVideoElement, access: VideoAccess | null): Promise<VideoSession> {
  let facing: "user" | "environment" = "environment";
  if (!access) {
    let stream = await camera(facing);
    el.srcObject = stream;
    el.muted = true;
    await el.play().catch(() => undefined);
    return {
      stop: () => stream.getTracks().forEach((t) => t.stop()),
      flip: async () => {
        stream.getTracks().forEach((t) => t.stop());
        facing = facing === "user" ? "environment" : "user";
        stream = await camera(facing);
        el.srcObject = stream;
      },
    };
  }
  const { Room, Track, createLocalTracks } = await import("livekit-client");
  const room = new Room({ adaptiveStream: true, dynacast: true });
  await room.connect(access.url, access.token);
  let tracks = await createLocalTracks({ audio: true, video: { facingMode: facing } });
  for (const t of tracks) {
    await room.localParticipant.publishTrack(t);
    if (t.kind === Track.Kind.Video) t.attach(el);
  }
  el.muted = true;
  return {
    stop: () => {
      tracks.forEach((t) => t.stop());
      void room.disconnect();
    },
    flip: async () => {
      facing = facing === "user" ? "environment" : "user";
      const video = tracks.find((t) => t.kind === Track.Kind.Video);
      if (video && "restartTrack" in video) await (video as unknown as { restartTrack(o: object): Promise<void> }).restartTrack({ facingMode: facing });
      tracks = [...tracks];
    },
  };
}

// A viewer: plays the host's camera in `el`. Calls onLive(true) once video arrives.
export async function watch(el: HTMLVideoElement, access: VideoAccess, onLive: (on: boolean) => void): Promise<VideoSession> {
  const { Room, RoomEvent, Track } = await import("livekit-client");
  const room = new Room({ adaptiveStream: true });
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) track.attach(el);
    if (track.kind === Track.Kind.Video) onLive(true);
  });
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    track.detach(el);
    if (track.kind === Track.Kind.Video) onLive(false);
  });
  await room.connect(access.url, access.token);
  return { stop: () => void room.disconnect() };
}

"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */


import { useEffect, useRef, useState } from "react";

export default function FloatingFaceSoft() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const faceMeshRef = useRef<any>(null);

  // Load FaceMesh
  useEffect(() => {
    const load = async () => {
      try {
        const mp = await import("@mediapipe/face_mesh");
        const { FaceMesh } = mp;

        const fm = new FaceMesh({
          locateFile: (f: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
        });

        fm.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMeshRef.current = fm;
        setModelLoaded(true);
      } catch (e) {
        console.error(e);
        setError("Failed to load FaceMesh model.");
      }
    };
    load();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch (e) {
      console.error(e);
      setError("Cannot access camera.");
    }
  };

  const captureFace = async () => {
    const fm = faceMeshRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!fm || !video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = video.videoWidth || 400;
    const h = video.videoHeight || 400;
    canvas.width = w;
    canvas.height = h;

    await new Promise<void>((resolve) => {
      fm.onResults((res: any) => {
        ctx.clearRect(0, 0, w, h);
        if (!res.multiFaceLandmarks?.[0]) return resolve();

        const pts = res.multiFaceLandmarks[0].map((p: any) => [
          p.x * w,
          p.y * h,
        ]);

        // ---- Define head contour indices ----
        const jaw = Array.from({ length: 17 }, (_, i) => pts[i]); // 0..16
        const foreheadArc = [
          pts[454], pts[356], pts[389], pts[251],
          pts[284], pts[332], pts[297], pts[338],
          pts[10],  // top center
        ];

        const contour = [...jaw, ...foreheadArc.reverse()];

        // ---- Draw precise face mask ----
        const mask = document.createElement("canvas");
        mask.width = w;
        mask.height = h;
        const mctx = mask.getContext("2d")!;
        mctx.beginPath();
        mctx.moveTo(contour[0][0], contour[0][1]);
        contour.forEach(([x, y]) => mctx.lineTo(x, y));
        mctx.closePath();
        mctx.fillStyle = "white";
        mctx.fill();

        // ---- Feather edges (soft transition) ----
        const blurred = document.createElement("canvas");
        blurred.width = w;
        blurred.height = h;
        const bctx = blurred.getContext("2d")!;
        bctx.filter = "blur(40px)";
        bctx.drawImage(mask, 0, 0);
        // reinforce center
        bctx.filter = "none";
        bctx.drawImage(mask, 0, 0);

        // ---- Apply mask to video ----
        ctx.save();
        ctx.drawImage(video, 0, 0, w, h);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(blurred, 0, 0);
        ctx.restore();

        // ---- Background black ----
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, w, h);
        resolve();
      });

      fm.send({ image: video });
    });
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-2xl font-bold mb-6">
        🪞 Floating Face (Soft Oval Mask)
      </h1>

      <div className="flex gap-10 flex-wrap justify-center items-center">
        {/* Camera */}
        <div className="flex flex-col items-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-[400px] h-[400px] bg-black rounded-xl object-cover"
          />
          {!streaming ? (
            <button
              onClick={startCamera}
              className="mt-4 bg-blue-600 px-5 py-3 rounded-xl hover:bg-blue-700"
            >
              Start Camera
            </button>
          ) : !modelLoaded ? (
            <button
              disabled
              className="mt-4 bg-gray-600 px-5 py-3 rounded-xl cursor-not-allowed"
            >
              Loading Model...
            </button>
          ) : (
            <button
              onClick={captureFace}
              className="mt-4 bg-green-600 px-5 py-3 rounded-xl hover:bg-green-700"
            >
              Capture Soft Face
            </button>
          )}
        </div>

        {/* Result */}
        <div className="flex flex-col items-center">
          <h3 className="text-lg font-semibold mb-2">🧠 Result</h3>
          <canvas
            ref={canvasRef}
            className="w-[400px] h-[400px] bg-black rounded-xl border border-gray-700"
          />
        </div>
      </div>

      {error && <p className="text-red-400 mt-4">{error}</p>}
    </main>
  );
}

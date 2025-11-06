/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";

// ---- zoom constants for software (no hardware zoom support) ----
const SOFTWARE_DEFAULT_SCALE = 0.9; // 0.70x by default
// negative zoom value so cssScale = |1/zoom| = 0.7
const SOFTWARE_DEFAULT_ZOOM = -1 / SOFTWARE_DEFAULT_SCALE; // ≈ -1.42857

export default function Home() {
  const mainDivRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [photo, setPhoto] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useFrontCamera, setUseFrontCamera] = useState(true);

  // 🔍 Zoom-related state
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [zoom, setZoom] = useState<number>(SOFTWARE_DEFAULT_ZOOM);

  // initialize zoom range
  const [zoomRange, setZoomRange] = useState<{
    min: number;
    max: number;
    step: number;
  }>({
    min: -4,
    max: -1,
    step: 0.1,
  });

  const [supportsHardwareZoom, setSupportsHardwareZoom] = useState(false);

  // ✅ Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: useFrontCamera ? "user" : "environment",
          width: { min: 1024, ideal: 1280, max: 1920 },
          height: { min: 576, ideal: 720, max: 1080 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        requestAnimationFrame(() => {
          setStreaming(true);
          setError(null);
        });
      }

      const videoTrack = stream.getVideoTracks()[0];
      setTrack(videoTrack);

      // Check zoom support
      const capabilities = videoTrack.getCapabilities?.() as any;

      // if (capabilities && capabilities.zoom) {
      //   // ✅ Hardware zoom supported (mobile cameras etc.)
      //   const { min, max, step } = capabilities.zoom;
      //   setSupportsHardwareZoom(true);
      //   setZoomRange({
      //     min: min ?? 1,
      //     max: max ?? 1,
      //     step: step ?? 0.1,
      //   });

      //   const settings = videoTrack.getSettings();
      //   setZoom(settings.zoom ?? min ?? 1); // hardware zoom value
      // } else {
        // ❌ No hardware zoom – use CSS zoom fallback (zoom OUT via negative values)
        setSupportsHardwareZoom(false);
        setZoomRange({ min: -4, max: -1, step: 0.1 }); // allow -1x to -4x
        setZoom(SOFTWARE_DEFAULT_ZOOM); // default ~0.70x scale
      // }
    } catch (err) {
      console.error(err);
      requestAnimationFrame(() => {
        setError("Camera access failed. Allow permission or use HTTPS.");
        setStreaming(false);
        setTrack(null);
      });
    }
  };

  // ✅ Stop camera
  const stopCamera = () => {
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
      video.srcObject = null;
    }
    setStreaming(false);
    setTrack(null);
  };

  // ✅ Toggle camera (let useEffect restart it)
  const toggleCamera = () => {
    stopCamera();
    setUseFrontCamera((prev) => !prev);
    // zoom will be reset appropriately in startCamera based on hardware support
  };

  // ✅ Apply zoom via mediaDevices constraints (if supported)
  const handleZoomChange = async (value: number) => {
    setZoom(value);

    // If device supports hardware zoom, use applyConstraints
    if (supportsHardwareZoom && track) {
      try {
        await (track as any).applyConstraints({
          advanced: [{ zoom: Math.abs(value) }],
        });
      } catch (err) {
        console.error("Zoom adjustment failed:", err);
      }
    }
    // If no hardware zoom, CSS fallback uses this zoom value in render + capture
  };

  // ✅ Capture photo (with mirror + overlay + object-cover + CSS zoom fallback)
  const capturePhoto = async () => {
    if (!videoRef.current || !mainDivRef.current) return;

    const video = videoRef.current;
    const container = mainDivRef.current;
    const { width, height } = container.getBoundingClientRect();

    // Wait for video metadata
    if (!video.videoWidth || !video.videoHeight) {
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Base object-cover calculation
    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = width / height;
    let drawWidth: number;
    let drawHeight: number;
    let dx: number;
    let dy: number;

    if (videoRatio > containerRatio) {
      // video is wider than container
      drawHeight = height;
      drawWidth = height * videoRatio;
      dx = (width - drawWidth) / 2;
      dy = 0;
    } else {
      // video is taller than container
      drawWidth = width;
      drawHeight = width / videoRatio;
      dx = 0;
      dy = (height - drawHeight) / 2;
    }

    // ✅ If hardware zoom is NOT supported, we simulate zoom OUT in the capture
    const effectiveZoom = supportsHardwareZoom ? 1 : Math.abs(1 / zoom);
    const zoomedWidth = drawWidth * effectiveZoom;
    const zoomedHeight = drawHeight * effectiveZoom;
    const zoomDx = dx - (zoomedWidth - drawWidth) / 2;
    const zoomDy = dy - (zoomedHeight - drawHeight) / 2;

    // Mirror if using front camera
    if (useFrontCamera) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, zoomDx, zoomDy, zoomedWidth, zoomedHeight);

    // Reset transform so overlay isn't flipped
    if (useFrontCamera) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Draw overlay frame
    const frame = new window.Image();
    frame.crossOrigin = "anonymous";
    frame.src =
      "https://res.cloudinary.com/ds95mo5gr/image/upload/v1762431140/Hamza3_gtxcbh.png";

    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
    });

    ctx.drawImage(frame, 0, 0, width, height);

    // Export photo
    setPhoto(canvas.toDataURL("image/png"));
  };

  // ✅ Start camera on mount / camera toggle
  useEffect(() => {
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useFrontCamera]);

  // ✅ Live preview transform: mirror + CSS zoom only when no hardware zoom
  // smaller (more negative) zoom value => more zoom out (scale < 1)
  const cssScale = supportsHardwareZoom ? 1 : Math.abs(1 / zoom);
  const videoTransform = useFrontCamera
    ? `scaleX(-1) scale(${cssScale})`
    : `scale(${cssScale})`;

  // user-facing zoom factor (always positive)
  const displayZoom = supportsHardwareZoom ? zoom : Math.abs(1 / zoom); // software: -1.428.. -> 0.70x

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <div className="flex flex-wrap lg:gap-10 justify-center w-full">
        <div className="w-full lg:w-[500px]">
          <h1 className="text-2xl font-bold mb-6 text-center">
            📸 Live Camera Capture (Zoom In / Out)
          </h1>

          {/* Camera container */}
          <div
            ref={mainDivRef}
            className="relative w-full lg:w-[400px] h-[80vh] overflow-hidden rounded-xl bg-black"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-500 ${
                streaming ? "opacity-100" : "opacity-30"
              }`}
              style={{
                transform: videoTransform,
                transformOrigin: "center center",
              }}
            />
            <NextImage
              src="https://res.cloudinary.com/ds95mo5gr/image/upload/v1762431140/Hamza3_gtxcbh.png"
              alt="Overlay"
              fill
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
          </div>

          {/* Zoom slider (progress bar) */}
          {zoomRange.max > zoomRange.min && (
            <div className="mt-4 w-full flex flex-col items-center gap-2">
              <label className="text-sm text-gray-300">
                Zoom: {displayZoom.toFixed(2)}x{" "}
                {!supportsHardwareZoom && "(software zoom-out for webcam)"}
              </label>
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="w-3/4 accent-green-500"
              />
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col items-center mt-4 gap-3">
            <button
              onClick={capturePhoto}
              disabled={!streaming}
              className="bg-green-600 hover:bg-green-700 px-5 py-3 rounded-xl text-white font-semibold disabled:opacity-50"
            >
              Capture Photo
            </button>
            <button
              onClick={toggleCamera}
              className="bg-purple-600 hover:bg-purple-700 px-5 py-3 rounded-xl text-white font-semibold"
            >
              Switch to {useFrontCamera ? "Back" : "Front"} Camera
            </button>
            <button
              onClick={stopCamera}
              className="bg-red-600 hover:bg-red-700 px-5 py-3 rounded-xl text-white font-semibold"
            >
              Stop Camera
            </button>
          </div>
        </div>

        {/* Captured Photo Preview */}
        {photo && (
          <div className="mt-6 text-center w-[95%] lg:w-[400px] h-[80vh]">
            <h3 className="font-semibold mb-2">Captured Frame:</h3>
            <img
              src={photo}
              alt="Captured"
              className="rounded-xl w-full h-full object-cover border border-gray-700"
            />
          </div>
        )}
      </div>

      {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
    </main>
  );
}

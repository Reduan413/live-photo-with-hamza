/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import FaceMeshLib from "@mediapipe/face_mesh";
import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";

export default function FaceMeshCamera() {
  const mainDivRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [photo, setPhoto] = useState<string | null>(null);
  const [croppedFace, setCroppedFace] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [useFrontCamera, setUseFrontCamera] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ Start Camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: useFrontCamera ? "user" : "environment" },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        requestAnimationFrame(() => {
          setStreaming(true);
          setError(null);
        });
      }
    } catch (err) {
      console.error(err);
      requestAnimationFrame(() => {
        setError("Camera access failed. Allow permission or use HTTPS.");
      });
    }
  };

  // ✅ Stop Camera
  const stopCamera = () => {
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
      video.srcObject = null;
    }
    setStreaming(false);
  };

  // ✅ Toggle Camera (button)

  // ✅ Switch Camera (SWITCH UI handler)
  const handleCameraSwitch = (nextIsFront: boolean) => {
    stopCamera();
    setUseFrontCamera(nextIsFront);
    // small delay so facingMode change is applied cleanly
    setTimeout(startCamera, 300);
  };

  // ✅ Capture Photo from video frame (NOT html2canvas)
  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video) return;

    // Make sure video has dimensions
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      console.warn("Video not ready yet");
      return;
    }

    // Draw current video frame to an offscreen canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const imgData = canvas.toDataURL("image/png");
    setPhoto(imgData);
    stopCamera();
  };

  // ✅ FaceMesh Detection and Crop
  useEffect(() => {
    if (!photo) return;

    let isCancelled = false;

    const img = new Image();
    img.crossOrigin = "anonymous";

    const faceMesh = new FaceMeshLib.FaceMesh({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results: any) => {
      if (isCancelled) return;

      const canvas = canvasRef.current;
      if (!canvas || !img) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, img.width, img.height);

      if (results.multiFaceLandmarks?.length) {
        const landmarks = results.multiFaceLandmarks[0];

        // Approximate contour indices
        const faceContourIndices = [
          10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
          379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
          234, 127, 162, 21, 54, 103, 67, 109,
        ];

        // Mask canvas
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;
        const maskCtx = maskCanvas.getContext("2d")!;
        maskCtx.beginPath();
        faceContourIndices.forEach((i: number, idx: number) => {
          const x = landmarks[i].x * img.width;
          const y = landmarks[i].y * img.height;
          if (idx === 0) maskCtx.moveTo(x, y);
          else maskCtx.lineTo(x, y);
        });
        maskCtx.closePath();
        maskCtx.fillStyle = "#fff";
        maskCtx.fill();

        // Apply mask
        const outCanvas = document.createElement("canvas");
        outCanvas.width = img.width;
        outCanvas.height = img.height;
        const outCtx = outCanvas.getContext("2d")!;
        outCtx.save();
        outCtx.drawImage(maskCanvas, 0, 0);
        outCtx.globalCompositeOperation = "source-in";
        outCtx.drawImage(img, 0, 0);
        outCtx.restore();

        // Compute crop bounds
        const xs = faceContourIndices.map(
          (i: number) => landmarks[i].x * img.width
        );
        const ys = faceContourIndices.map(
          (i: number) => landmarks[i].y * img.height
        );
        const minX = Math.max(0, Math.min(...xs));
        const maxX = Math.min(img.width, Math.max(...xs));
        const minY = Math.max(0, Math.min(...ys));
        const maxY = Math.min(img.height, Math.max(...ys));

        const cropW = maxX - minX;
        const cropH = maxY - minY;
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext("2d")!;
        cropCtx.drawImage(
          outCanvas,
          minX,
          minY,
          cropW,
          cropH,
          0,
          0,
          cropW,
          cropH
        );

        const cropped = cropCanvas.toDataURL("image/png");
        setCroppedFace(cropped);
      } else {
        console.log("No face detected");
      }
    });

    // Attach onload BEFORE setting src
    img.onload = async () => {
      if (isCancelled) return;
      await faceMesh.send({ image: img });
    };
    img.src = photo;

    return () => {
      isCancelled = true;
      faceMesh.close();
    };
  }, [photo]);

  return (
    <div className="flex flex-col items-center gap-4 mt-6">
      {/* Switch camera (Front / Back) */}

      <div className="flex flex-col lg:flex-row justify-center items-center gap-14 lg:gap-24">
        <div className=" space-y-5 w-[95%] lg:w-[400px] text-center">
          <div ref={mainDivRef} className=" w-full h-[80vh] bg-black relative">
            <video
              ref={videoRef}
              className="w-full h-full object-cover rounded-md"
              playsInline
              muted
              autoPlay
            />
            <NextImage
              src="https://res.cloudinary.com/ds95mo5gr/image/upload/v1762441925/2_pqjbj0.png"
              alt="Overlay"
              fill
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
          </div>
          <div className="flex gap-3">
            {!streaming ? (
              <button
                onClick={startCamera}
                className="bg-green-600 text-white px-4 py-2 rounded-md mx-auto"
              >
                Start Camera
              </button>
            ) : (
              <>
                <button
                  onClick={capturePhoto}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md"
                >
                  Capture
                </button>

                {/* keep Flip button if you still want it */}

                <button
                  onClick={stopCamera}
                  className="bg-red-600 text-white px-4 py-2 rounded-md"
                >
                  Stop
                </button>
              </>
            )}
          </div>
          <div className="mb-2 flex items-center gap-3 ">
            <button
              onClick={() => handleCameraSwitch(!useFrontCamera)}
              className="bg-purple-600 hover:bg-purple-700 px-5 py-3 rounded-xl text-white font-semibold cursor-pointer mx-auto"
            >
              {/* when currently front, we should switch TO back */}
              Switch to {useFrontCamera ? "Back" : "Front"} Camera
            </button>
          </div>
        </div>
        {croppedFace && (
          <div className=" relative border border-gray-300 w-[95%] lg:w-[400px] h-[80vh]">
            <img
              src="https://res.cloudinary.com/ds95mo5gr/image/upload/v1762441925/2_pqjbj0.png"
              alt="Overlay"
              className="w-full h-full"
            />
            <img
              src={croppedFace}
              alt="Cropped Face"
              className="absolute top-[45%] left-[15%] w-[28%] rounded-lg shadow-md -z-30"
            />
          </div>
        )}
      </div>

      {error && <p className="text-red-500">{error}</p>}

      {photo && (
        <div className="mt-4 hidden">
          <h3 className="font-semibold text-gray-200 mb-2">Captured Image</h3>
          <canvas ref={canvasRef} className="border rounded-md" />
        </div>
      )}
    </div>
  );
}

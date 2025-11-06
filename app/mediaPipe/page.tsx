/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import FaceMesh from "@mediapipe/face_mesh";
import drawingUtils from "@mediapipe/drawing_utils";
import faceMeshConnections from "@mediapipe/face_mesh";
import NextImage from "next/image";

export default function FaceMeshImage() {
  const [imageURL, setImageURL] = useState<string | null>(null);
  const [croppedFace, setCroppedFace] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageURL(url);
      setCroppedFace(null);
    }
  };

  useEffect(() => {
    if (!imageURL) return;

    const imageElement = imageRef.current;
    const canvasElement = canvasRef.current;
    if (!imageElement || !canvasElement) return;

    const faceMesh = new FaceMesh.FaceMesh({
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
      const ctx = canvasElement.getContext("2d");
      if (!ctx) return;

      // Resize canvas
      canvasElement.width = imageElement.width;
      canvasElement.height = imageElement.height;

      // Draw base image
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      ctx.drawImage(
        imageElement,
        0,
        0,
        imageElement.width,
        imageElement.height
      );

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // --- FACE CONTOUR POINTS (outer shape) ---
        // Based on MediaPipe FaceMesh indices for face outline
        const faceContourIndices = [
          10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
          379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
          234, 127, 162, 21, 54, 103, 67, 109,
        ];

        // --- Create mask canvas ---
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = imageElement.width;
        maskCanvas.height = imageElement.height;
        const maskCtx = maskCanvas.getContext("2d")!;
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

        // --- Draw polygon mask following face contour ---
        maskCtx.beginPath();
        faceContourIndices.forEach((i, idx) => {
          const x = landmarks[i].x * imageElement.width;
          const y = landmarks[i].y * imageElement.height;
          if (idx === 0) maskCtx.moveTo(x, y);
          else maskCtx.lineTo(x, y);
        });
        maskCtx.closePath();

        // Fill the face contour area
        maskCtx.fillStyle = "#fff";
        maskCtx.fill();

        // --- Create output canvas for cropped region ---
        const outCanvas = document.createElement("canvas");
        outCanvas.width = imageElement.width;
        outCanvas.height = imageElement.height;
        const outCtx = outCanvas.getContext("2d")!;

        // Use mask to clip the face region only
        outCtx.save();
        outCtx.drawImage(maskCanvas, 0, 0);
        outCtx.globalCompositeOperation = "source-in"; // keep intersection
        outCtx.drawImage(imageElement, 0, 0);
        outCtx.restore();

        // Optional: Draw landmarks for debugging
        drawingUtils.drawConnectors(
          ctx,
          landmarks,
          faceMeshConnections.FACEMESH_TESSELATION,
          {
            color: "#00FF00",
            lineWidth: 0.5,
          }
        );
        drawingUtils.drawLandmarks(ctx, landmarks, {
          color: "#FF0000",
          radius: 1,
        });

        // --- Crop tight around face contour area ---
        const xs = faceContourIndices.map(
          (i) => landmarks[i].x * imageElement.width
        );
        const ys = faceContourIndices.map(
          (i) => landmarks[i].y * imageElement.height
        );
        const minX = Math.max(0, Math.min(...xs));
        const maxX = Math.min(imageElement.width, Math.max(...xs));
        const minY = Math.max(0, Math.min(...ys));
        const maxY = Math.min(imageElement.height, Math.max(...ys));

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

        const faceRegion = cropCanvas.toDataURL("image/png");
        setCroppedFace(faceRegion);
      }
    });

    imageElement.onload = async () => {
      await faceMesh.send({ image: imageElement });
    };
  }, [imageURL]);

  return (
    <div className="flex flex-col items-center gap-6 mt-6">
      <input type="file" accept="image/*" onChange={handleFileChange} />

      {imageURL && (
        <div className="relative">
          <img
            ref={imageRef}
            src={imageURL}
            alt="Uploaded"
            className="hidden"
            crossOrigin="anonymous"
          />
          <canvas
            ref={canvasRef}
            className="border border-gray-400 rounded-md"
          />
        </div>
      )}

      {croppedFace && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Cropped Landmark Region:
          </h3>
          <div className=" relative border border-gray-300 ">
            <img
              src={croppedFace}
              alt="Face Landmarks Area"
              className="rounded-lg border border-gray-300 shadow-md bg-transparent absolute top-[45%] left-[15%] w-[250px]"
            />
            <img
              src="https://res.cloudinary.com/ds95mo5gr/image/upload/v1762236779/main_large_bxrcg2.png"
              alt="Overlay"
              className=""
            />
          </div>
        </div>
      )}
    </div>
  );
}

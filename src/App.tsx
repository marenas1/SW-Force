import React, { useRef, useEffect, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

interface Keypoint {
  x: number;
  y: number;
}

interface Angles {
  shoulder: number;
  trunk: number;
}

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [angles, setAngles] = useState<Angles>({ shoulder: 0, trunk: 0 });
  const [force, setForce] = useState<string>("");

  useEffect(() => {

    const setupCamera = async () => {
      //uses navigator and only gets video, no audi
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          //if video exists, gets the mediastream
          videoRef.current.srcObject = cameraStream;
          //will play if there is metadata
          await new Promise((resolve) => (videoRef.current!.onloadedmetadata = resolve));
          videoRef.current.play();
        }
      } catch (error) {
        console.error("Error accessing webcam:", error);
      }
    };
    //Sets up backend for tensorflow, this one uses web, others can use CPU
    const setupTF = async () => {
      await tf.setBackend("webgl"); 
      await tf.ready();
    };

    //Angle Calculations
    //Takes in key points, using x and y axis creates vectors, then we just find the angle

    const calculateShoulderAngle = (shoulder: Keypoint, elbow: Keypoint, hip: Keypoint): number => {
      const vectorShoulderElbow = { x: elbow.x - shoulder.x, y: elbow.y - shoulder.y };
      const vectorShoulderHip = { x: hip.x - shoulder.x, y: hip.y - shoulder.y };

      const dotProduct = vectorShoulderElbow.x * vectorShoulderHip.x + vectorShoulderElbow.y * vectorShoulderHip.y;
      const magShoulderElbow = Math.sqrt(vectorShoulderElbow.x ** 2 + vectorShoulderElbow.y ** 2);
      const magShoulderHip = Math.sqrt(vectorShoulderHip.x ** 2 + vectorShoulderHip.y ** 2);

      const angleInRadians = Math.acos(dotProduct / (magShoulderElbow * magShoulderHip));
      const angleInDegrees = angleInRadians * (180 / Math.PI);

      return parseFloat(angleInDegrees.toFixed(2));
    };

    const calculateTrunkAngle = (shoulder: Keypoint, hip: Keypoint): number => {
      const vectorShoulderHip = { x: hip.x - shoulder.x, y: hip.y - shoulder.y };
      const angleInRadians = Math.atan2(vectorShoulderHip.y, vectorShoulderHip.x);
      const angleInDegrees = angleInRadians * (180 / Math.PI);

      return parseFloat(angleInDegrees.toFixed(2));
    };

    //Draws lines onto the video

    const drawSkeleton = (keypoints: poseDetection.Keypoint[]) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas || !videoRef.current) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      const drawLine = (A: Keypoint, B: Keypoint) => {
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.strokeStyle = "red"; 
        ctx.lineWidth = 8;
        ctx.stroke();
      };

      // Drawing shoulder to elbow, elbow to wrist, hip to knee, knee to ankle
      drawLine(keypoints[5] as Keypoint, keypoints[7] as Keypoint); // Shoulder to elbow
      drawLine(keypoints[7] as Keypoint, keypoints[11] as Keypoint); // Elbow to wrist
      drawLine(keypoints[5] as Keypoint, keypoints[11] as Keypoint); // Shoulder to hip (Trunk)
    };
    //will change to user inputs later
    const calculateShoulderForce = (mass: number, height: number, angle: number): number => {
      const g = 9.81;
      const angleInRadians = angle * (Math.PI / 180);
      const L = height * 0.55; // Center of mass is approximately 55% of body height
      const weight = mass * g;
      const dLever = L * Math.cos(angleInRadians);
      const shoulderForce = weight * (dLever / L);

      return shoulderForce;
    };

    const mass = 70; // Mass of the subject in kg
    const height = 1.75; // Height of the subject in meters

    const runPoseEstimation = async () => {
      await setupTF();
      await setupCamera();
      const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
      });
      const video = videoRef.current;

      if (video) {
        const detect = async () => {
          if (!video.paused && !video.ended) {
            const poses = await detector.estimatePoses(video);
            if (poses.length > 0) {
              const keypoints = poses[0].keypoints;

              drawSkeleton(keypoints);
              const shoulderAngle = calculateShoulderAngle(
                keypoints[5] as Keypoint, // shoulder
                keypoints[7] as Keypoint, // elbow
                keypoints[11] as Keypoint // hip
              );

              const trunkAngle = calculateTrunkAngle(
                keypoints[5] as Keypoint, // shoulder
                keypoints[11] as Keypoint // hip
              );

              setAngles({ shoulder: shoulderAngle, trunk: trunkAngle });

              // Check if the angles are too small for significant force
              if (trunkAngle > 45) {
                setForce("Not enough force applied yet");
              } else {
                const shoulderForce = calculateShoulderForce(mass, height, shoulderAngle);
                setForce(`${shoulderForce.toFixed(2)} N`);
              }

              console.log(`Detected shoulder angle: ${shoulderAngle.toFixed(2)}°`);
              console.log(`Detected trunk angle: ${trunkAngle.toFixed(2)}°`);
            }
          }
          requestAnimationFrame(detect);
        };
        detect();
      }
    };

    runPoseEstimation();
  }, []);

  return (
    <div>
      <h1>Pose Angle Detection</h1>
      <video ref={videoRef} autoPlay playsInline muted width="640" height="480" style={{ display: "none" }} />
      <canvas ref={canvasRef} width="640" height="480" style={{ border: "1px solid black" }} />
      <p>Shoulder Angle: {angles.shoulder}°</p>
      <p>Trunk Angle: {angles.trunk}°</p>
      <p>Shoulder Force: {force}</p>
    </div>
  );
};

export default App;

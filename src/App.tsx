import React, { useRef, useEffect, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
//import fl from "./assets/flIcon.jpg"

const App: React.FC = () => {
  return (
    <div>
      <FlPage height={176} weight={77}></FlPage>
    </div>
  );
};
export default App;

interface Keypoint {
  x: number;
  y: number;
}

interface FlPageProps{  
    height:number;
    weight:number
}

const FlPage: React.FC<FlPageProps> = ({height,weight}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [angle,setAngle]= useState<number>(0)
  const [force, setForce] = useState<string>("");
  const [forcelbs, setForcelbs] = useState<string>("")
  const [bodyLength, setBodyLength] = useState<number>(height)
  const headToHip: number=(height*0.55)
  useEffect(() => {
    console.log(height)
    console.log(weight)
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

    const calculateBodyLength = (head: Keypoint, hip: Keypoint, foot: Keypoint): number => {
      //We assume head to hip is 0.55 of person length
      //If we take the length from head to hip in pixel distance, then we can assume the length of how far the hip to feet is, allowing us to get accurate lever length
      //Dont make straight line from head to hip, instead take linear distance as good form should be straight, no pike
      //then do the same for the feet to hip
      const headToHipPixels = Math.abs(head.x-hip.x)
      const hipToFootPixels = Math.abs(hip.x-foot.x)
      const realWorldLength = headToHip+(headToHip*(hipToFootPixels/headToHipPixels))
      if(realWorldLength>height){
        return height
      }
      return realWorldLength
    };

    //will change to user inputs later
    const calculateShoulderForce = (weight: number, L: number, angle: number): number => {
      const g = 9.81; 
      const angleInRadians = angle * (Math.PI / 180); 
      console.log(weight)
      console.log(angleInRadians+"radians")
      console.log(L)
      console.log("l")
      const torque = weight * g * L/100 * Math.sin(angleInRadians); // Calculate torque using weight,gravity,moment arm and angle
      console.log("torequ"+torque)
      return torque;
    };


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
      const drawBodyLength = (A: Keypoint, B: Keypoint) => {
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.strokeStyle = "green"; 
        ctx.lineWidth = 8;
        ctx.stroke();
      };
      
      // Drawing shoulder to elbow, elbow to wrist, hip to knee, knee to ankle
      drawLine(keypoints[5] as Keypoint, keypoints[7] as Keypoint); // Shoulder to elbow
      drawLine(keypoints[7] as Keypoint, keypoints[11] as Keypoint); // Elbow to wrist
      drawLine(keypoints[5] as Keypoint, keypoints[11] as Keypoint); // Shoulder to hip (Trunk)
      //Three calls below draw the line of the body length (right side)
      //drawBodyLength(keypoints[4] as Keypoint, keypoints[6] as Keypoint)//head to shoulder
      drawBodyLength(keypoints[5] as Keypoint, keypoints[11] as Keypoint)//shoulder to hip
      drawBodyLength(keypoints[11] as Keypoint, keypoints[15] as Keypoint)//hip to foot
    };
    

    

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
              const hip= keypoints[12] as Keypoint;
              const shoulder = keypoints[6] as Keypoint;
              const foot = keypoints[16] as Keypoint;

              const newBodyLength = calculateBodyLength(shoulder,hip, foot);
              setBodyLength(newBodyLength);
              const shoulderAngle = calculateShoulderAngle(
                keypoints[5] as Keypoint, // shoulder
                keypoints[7] as Keypoint, // elbow
                keypoints[11] as Keypoint // hip
              );
              setAngle(shoulderAngle) 
              const shoulderForce = calculateShoulderForce(weight, newBodyLength, shoulderAngle);
              const shoulderForcelbs = shoulderForce*0.2248
              setForcelbs(`${shoulderForcelbs.toFixed(2)} lbs`)
              setForce(`${shoulderForce.toFixed(2)} N`);
              

              console.log(`Detected shoulder angle: ${shoulderAngle.toFixed(2)}°`);
            }
          }
          requestAnimationFrame(detect);
        };
        detect();
      }
    };

    runPoseEstimation();
  }, [height,weight]);

  

  return (
    <div>
      <h1>Front Lever Force</h1>
      <video ref={videoRef} autoPlay playsInline muted width="640" height="480" style={{ display: "none" }} />
      <canvas ref={canvasRef} width="640" height="480" style={{ border: "1px solid black" }} />
      <p>Angle {angle}</p>
      <p>Torque N: {force}</p>
      <p>Lat Force lbs: {forcelbs}</p>
      <p>Body Length: {bodyLength}</p>
    </div>
  );
};
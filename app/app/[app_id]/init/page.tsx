'use client';

import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function AppPage() {
  const params = useParams();
  const { app_id } = params;
  // fetch qr from server
  const [state, setState] = useState<string>('INIT');
  const [qr, setQR] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const eventSource = new EventSource(`/api/${app_id}/init`);
        setState('LOADING');
        eventSource.onmessage = async (event) => {
          const data = JSON.parse(event.data);
          setQR(data.qr);
          setImage(data.qr ? await QRCode.toDataURL(data.qr) : null);
          setState(data.state);
          setDate(data.date);
        };
      } catch (error) {
        console.error('Error fetching QR code:', error);
        setState('ERROR');
      }
    })()
  }, [app_id]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      // 2. Always use the functional update form (prev => prev + 1) 
      // to avoid tracking stale closures or old state values
      setSeconds((prevSeconds) => prevSeconds + 1);
    }, 1000);

    // 3. Return a cleanup function to clear the timer when the component unmounts
    return () => clearInterval(intervalId);
  }, []); // Empty array ensures this effect only runs once when mounting

  return (
    <div>
      <h1>App ID: {app_id}</h1>
      <p>Status: {state}</p>
      {qr && (
        <div>
          <p>Please scan the QR code with your WhatsApp app:</p>
          {image && <Image src={image} alt="QR Code" width={200} height={200} />}
          {date && <>
            <p>QR Code generated at: {new Date(date).toLocaleString()}</p>
            <p>Time Remaining: {Math.max(0, 90 - Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000))} seconds</p>
          </>}
        </div>
      )}
    </div>
  );
}
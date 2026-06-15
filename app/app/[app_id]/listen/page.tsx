'use client';

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppPage() {
  const params = useParams();
  const { app_id } = params;
  const [state, setState] = useState<string>('INIT');
  const [messages, setMessages] = useState<{ from: string; body: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const eventSource = new EventSource(`/api/${app_id}/listen`);
        setState('LOADING');
        eventSource.onmessage = async (event) => {
          const data = JSON.parse(event.data);
          if (data.message) {
            setMessages((prevMessages) => [...prevMessages, data.message]);
          }
          if (data.state) {
            setState(data.state);
          }
        };
      } catch (error) {
        console.error('Error fetching messages:', error);
        setState('ERROR');
      }
    })()
  }, [app_id]);

  return (
    <div>
      <h1>App ID: {app_id}</h1>
      <p>Status: {state}</p>
      {messages.length > 0 && (
        <div>
          <h2>Messages:</h2>
          <ul>
            {messages.map((msg, index) => (
              <li key={index}>
                <strong>From:</strong> {msg.from} <br />
                <strong>Message:</strong> {msg.body}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
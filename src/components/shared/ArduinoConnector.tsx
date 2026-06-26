import React, { useState } from 'react';

export default function ArduinoConnector() {
  const [port, setPort] = useState<any>(null);
  const [writer, setWriter] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  async function connect() {
    try {
      // @ts-ignore
      const p = await navigator.serial.requestPort();
      await p.open({ baudRate: 9600 });
      const w = p.writable.getWriter();
      setPort(p);
      setWriter(w);
      setConnected(true);
      console.log('Arduino serial connected');
    } catch (err) {
      console.error('Serial connect failed', err);
      alert('Failed to connect to Arduino via Web Serial. Use Chrome/Edge and HTTPS (localhost allowed).');
    }
  }

  async function disconnect() {
    try {
      if (writer) await writer.releaseLock();
      if (port) await port.close();
    } catch (e) {
      console.warn('Error closing port', e);
    }
    setWriter(null);
    setPort(null);
    setConnected(false);
  }

  async function sendCommand(cmd: string) {
    if (!writer) {
      alert('Not connected. Click Connect first.');
      return;
    }
    const data = new TextEncoder().encode(cmd + '\n');
    try {
      await writer.write(data);
      console.log('Sent:', cmd);
    } catch (err) {
      console.error('Write failed', err);
    }
  }

  return (
    <div style={{ position: 'fixed', right: 12, top: 12, zIndex: 9999, background: 'rgba(255,255,255,0.95)', padding: 10, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Arduino</div>
      {!connected ? (
        <button onClick={connect} style={{ marginRight: 8 }}>Connect</button>
      ) : (
        <button onClick={disconnect} style={{ marginRight: 8 }}>Disconnect</button>
      )}
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button onClick={() => sendCommand('ALARM:cheating:3')}>Cheating</button>
        <button onClick={() => sendCommand('ALARM:warning:2')}>Warning</button>
        <button onClick={() => sendCommand('ALARM:normal:1')}>Normal</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#333' }}>{connected ? 'Connected' : 'Disconnected'}</div>
    </div>
  );
}

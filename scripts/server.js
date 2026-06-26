import express from 'express';
import { SerialPort } from 'serialport';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

let port = null;
let isConnected = false;
let reconnectTimer = null;

// 🔌 Initialize Arduino Connection with 5-Second Reconnect Loop
function initializeArduino() {
  if (isConnected && port && port.isOpen) return;

  console.log('🔌 Attempting to connect to Arduino on COM3...');
  try {
    if (port) {
      try {
        port.close();
      } catch (e) {
        // ignore
      }
      port = null;
    }

    port = new SerialPort({
      path: 'COM3', 
      baudRate: 9600,
      autoOpen: false
    });

    port.open((err) => {
      if (err) {
        console.log('❌ Arduino Open Error:', err.message);
        isConnected = false;
        scheduleReconnect();
      }
    });

    port.on('open', () => {
      console.log('✅ Arduino Connected on COM3!');
      isConnected = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    });

    port.on('error', (err) => {
      console.log('❌ Arduino SerialPort Error:', err.message);
      isConnected = false;
      scheduleReconnect();
    });

    port.on('close', () => {
      console.log('⚠️ Arduino Connection Closed');
      isConnected = false;
      scheduleReconnect();
    });

  } catch (err) {
    console.log('❌ Error initializing Arduino:', err.message);
    isConnected = false;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log('🔄 Scheduling Arduino reconnection on COM3 in 5 seconds...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initializeArduino();
  }, 5000);
}

// 📡 API Endpoint: Check Connection Status
app.get('/api/arduino-status', (req, res) => {
  res.json({
    connected: isConnected,
    message: isConnected ? 'Arduino Connected' : 'Arduino Not Connected'
  });
});

// 🚨 API Endpoint: Trigger Cheating Alarm
app.post('/api/trigger-alarm', (req, res) => {
  const { type = 'cheating', duration = 3 } = req.body;

  // Validate alarm command arguments before sending
  if (typeof type !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(type)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid alarm type (must be alphanumeric/dash/underscore)'
    });
  }

  const parsedDuration = parseInt(duration, 10);
  if (isNaN(parsedDuration) || parsedDuration <= 0 || parsedDuration > 60) {
    return res.status(400).json({
      success: false,
      message: 'Invalid alarm duration (must be a positive integer between 1 and 60)'
    });
  }

  if (!isConnected) {
    return res.status(400).json({
      success: false,
      message: 'Arduino not connected'
    });
  }

  try {
    // Send validated command to Arduino
    const command = `ALARM:${type}:${parsedDuration}\n`;
    port.write(command);

    console.log(`🚨 Alarm Triggered: ${type} (${parsedDuration}s)`);

    res.json({
      success: true,
      message: `Alarm triggered: ${type}`,
      command: command
    });

  } catch (err) {
    console.error('Error sending command:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger alarm'
    });
  }
});

// 🟢 API Endpoint: Normal Status (Green Light)
app.post('/api/status-normal', (req, res) => {
  if (!isConnected) {
    return res.status(400).json({ success: false, message: 'Arduino not connected' });
  }

  try {
    port.write('STATUS:NORMAL\n');
    res.json({ success: true, message: 'Status set to Normal' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to set status' });
  }
});

// 🟡 API Endpoint: Warning Status (Yellow Light)
app.post('/api/status-warning', (req, res) => {
  if (!isConnected) {
    return res.status(400).json({ success: false, message: 'Arduino not connected' });
  }

  try {
    port.write('STATUS:WARNING\n');
    res.json({ success: true, message: 'Status set to Warning' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to set status' });
  }
});

// Initialize and Start Server
initializeArduino();

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
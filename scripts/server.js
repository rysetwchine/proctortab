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

// 🔌 Initialize Arduino Connection
function initializeArduino() {
  try {
    port = new SerialPort({
      path: 'COM3', 
      baudRate: 9600,
      autoOpen: true
    });

    port.on('open', () => {
      console.log('✅ Arduino Connected!');
      isConnected = true;
    });

    port.on('error', (err) => {
      console.log('❌ Arduino Connection Error:', err.message);
      isConnected = false;
    });

    port.on('close', () => {
      console.log('⚠️ Arduino Disconnected');
      isConnected = false;
    });

  } catch (err) {
    console.log('Error initializing Arduino:', err.message);
  }
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

  if (!isConnected) {
    return res.status(400).json({
      success: false,
      message: 'Arduino not connected'
    });
  }

  try {
    // Send command to Arduino
    const command = `ALARM:${type}:${duration}\n`;
    port.write(command);

    console.log(`🚨 Alarm Triggered: ${type} (${duration}s)`);

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
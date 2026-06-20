import express from 'express';
import { SerialPort } from 'serialport';

const app = express();
app.use(express.json());

const ARDUINO_PORT = 'COM3'; // change to your COMx
const arduino = new SerialPort({ path: ARDUINO_PORT, baudRate: 9600, autoOpen: true });

app.post('/api/send', (req, res) => {
  const { cmd } = req.body;
  if (!cmd) return res.status(400).send('missing cmd');
  arduino.write(cmd + '\\n', (err) => {
    if (err) return res.status(500).send(err.message);
    res.send('sent');
  });
});

app.listen(3000, () => console.log('API on http://localhost:3000'));
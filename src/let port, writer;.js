let port, writer;

async function connectSerial() {
  // must be user gesture
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600 });
  writer = port.writable.getWriter();
  console.log('Connected to Arduino');
}

async function sendCommand(cmd) {
  if (!writer) {
    alert('Not connected. Click Connect first.');
    return;
  }
  const data = new TextEncoder().encode(cmd + '\n');
  await writer.write(data);
}

// Example usage on cheating detection:
sendCommand('ALARM:cheating:3');
// Or set steady status:
sendCommand('STATUS:WARNING');
sendCommand('STATUS:NORMAL');
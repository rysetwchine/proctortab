// Generate unique 6-character alphanumeric join code
export const generateJoinCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar looking chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Format code with dash for display (e.g., ABC-123)
export const formatJoinCode = (code: string): string => {
  if (code.length !== 6) return code;
  return `${code.slice(0, 3)}-${code.slice(3)}`;
};

// Validate code format
export const isValidJoinCode = (code: string): boolean => {
  const cleanCode = code.replace('-', '');
  return /^[A-Z0-9]{6}$/.test(cleanCode);
};

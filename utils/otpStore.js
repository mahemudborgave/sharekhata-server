// In-memory OTP store: { email -> { otp, expiresAt, purpose } }
// For production, use Redis. This is fine for moderate traffic.
const store = new Map();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
};

const saveOTP = (email, otp, purpose = 'registration') => {
  store.set(email.toLowerCase(), {
    otp,
    purpose,
    expiresAt: Date.now() + OTP_TTL_MS
  });
};

const verifyOTP = (email, otp, purpose) => {
  const entry = store.get(email.toLowerCase());
  if (!entry) return { valid: false, reason: 'OTP not found or expired' };
  if (entry.purpose !== purpose) return { valid: false, reason: 'Invalid OTP purpose' };
  if (Date.now() > entry.expiresAt) {
    store.delete(email.toLowerCase());
    return { valid: false, reason: 'OTP has expired' };
  }
  if (entry.otp !== otp) return { valid: false, reason: 'Invalid OTP' };
  return { valid: true };
};

const clearOTP = (email) => {
  store.delete(email.toLowerCase());
};

// Clean up expired entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store.entries()) {
    if (now > val.expiresAt) store.delete(key);
  }
}, 15 * 60 * 1000);

module.exports = { generateOTP, saveOTP, verifyOTP, clearOTP };

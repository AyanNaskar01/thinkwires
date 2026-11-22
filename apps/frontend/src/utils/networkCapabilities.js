/**
 * Network Capabilities Utility
 *
 * Senses network constraints via the Network Information API
 * (navigator.connection) to adapt rendering strategies without altering
 * application styling or business logic.
 */

export const checkLowBandwidthConnection = () => {
  if (typeof navigator === 'undefined') return false;

  const conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;

  if (!conn) return false;

  // 1. Data Saver mode enabled in browser settings
  if (conn.saveData === true) return true;

  // 2. Cellular 2G or slow-2g network type
  if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') {
    return true;
  }

  // 3. Constrained downlink (< 0.75 Mbps) paired with high latency (> 800ms)
  if (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 0.75) {
    if (typeof conn.rtt === 'number' && conn.rtt > 800) {
      return true;
    }
  }

  return false;
};

export const subscribeToNetworkChange = (callback) => {
  if (typeof navigator === 'undefined') return () => {};

  const conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;

  if (!conn || typeof conn.addEventListener !== 'function') return () => {};

  const handler = () => callback(checkLowBandwidthConnection());
  conn.addEventListener('change', handler);
  return () => conn.removeEventListener('change', handler);
};

let ngrokListener = null;

async function startTunnel(port, authtoken) {
  const ngrok = require('@ngrok/ngrok');

  if (ngrokListener) {
    await stopTunnel();
  }

  ngrokListener = await ngrok.forward({
    addr: port,
    authtoken,
    proto: 'http',
  });

  const url = ngrokListener.url();
  console.log('[tunnel] ngrok connected:', url);
  return url;
}

async function stopTunnel() {
  if (ngrokListener) {
    try {
      await ngrokListener.close();
    } catch (err) {
      console.error('[tunnel] Error closing ngrok:', err.message);
    }
    ngrokListener = null;
  }
}

module.exports = { startTunnel, stopTunnel };

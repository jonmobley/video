const PRODUCTION_ORIGIN = 'https://vidshare.co';
const PRODUCTION_HOST = 'vidshare.co';
const WWW_HOST = 'www.vidshare.co';

function apexRedirectLocation(requestUrl) {
  const url = new URL(String(requestUrl));
  if (url.hostname !== WWW_HOST) return null;
  url.hostname = PRODUCTION_HOST;
  return url.toString();
}

module.exports = {
  PRODUCTION_ORIGIN,
  PRODUCTION_HOST,
  WWW_HOST,
  apexRedirectLocation
};

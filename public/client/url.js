var urls = [{"name":"google","url":"http://google.com"},
{"name":"ebay","url":"http://ebay.com"},
{"name":"amazon","url":"http://amazon.com"},
{"name":"msn","url":"http://msn.com"},
{"name":"yahoo","url":"http://yahoo.com"},
{"name":"wikipedia","url":"http://wikipedia.org"}];

function random() {
  let idx = Math.floor(Math.random() * urls.length);
  return urls[idx];
}

export default random;
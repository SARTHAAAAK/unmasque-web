const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 8000,
  path: '/api/extractions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': 'unmasqueRefreshToken=' + process.env.REFRESH_TOKEN // wait, I don't have token
  }
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
});
req.on('error', console.error);
req.end(JSON.stringify({
  conn: "c1",
  appType: "D",
  jobName: "Test Job"
}));
